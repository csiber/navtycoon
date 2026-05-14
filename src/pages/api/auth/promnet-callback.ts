// GET /api/auth/promnet-callback — cross-brand SSO callback.
//
// Két forgatókönyv:
//
// A) A user PromNET-ről érkezik `?_sso=<handoff-token>`-nel (a PromNET
//    middleware-e issueHandoff()-fal írja a sso_handoff_tokens táblába).
//    Ekkor:
//      - redeemHandoff (PROMNET_DB-n át) — egyszer-felhasználható
//      - createPromnetSession a hyperscaler-be
//      - setSessionCookie (`navtycoon_session`)
//      - createPlayer ha még nincs
//      - redirect /play (vagy ?next=)
//
// B) A user a saját bejelentkezett PromNET cookie-val érkezik (pn_session
//    URL-paramként vagy más mechanikán át adódott át — pl. egyedi
//    "?session=<token>" query-param a "Vissza a játékhoz" CTA-ban).
//    Ekkor csak validálni kell a tokent, és setSessionCookie + player-bootstrap.
//
// Mindkét esetben:
//    - Ha PromNET-user létezik DE Hyperscales-player még nincs → auto-create
//      a PromNET display_name-ből származtatott company_name-mel.

import type { APIContext } from 'astro';
import {
  getDB, getPromnetDB,
  getUserBySessionToken, setSessionCookie,
} from '../../../lib/auth';
import { createPlayer, getPlayer } from '../../../lib/game/db';

export const prerender = false;

interface SsoHandoffRow { user_id: string; source: string }

/** redeemHandoff helyi implementációja — PROMNET_DB-n az `sso_handoff_tokens`
 *  táblát használja, single-use atomic UPDATE. (PromNET sso.ts mintájára.) */
async function redeemHandoff(
  pdb: { prepare(q: string): {
    bind(...v: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
    };
  } },
  token: string,
): Promise<{ userId: string; source: string } | null> {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const now = Math.floor(Date.now() / 1000);
  const upd = await pdb.prepare(
    'UPDATE sso_handoff_tokens SET used_at = ? ' +
    'WHERE token = ? AND used_at IS NULL AND expires_at > ?',
  ).bind(now, token, now).run();
  const changes = upd.meta?.changes ?? 0;
  if (changes < 1) return null;
  const row = await pdb.prepare(
    'SELECT user_id, source FROM sso_handoff_tokens WHERE token = ?',
  ).bind(token).first<SsoHandoffRow>();
  if (!row) return null;
  return { userId: row.user_id, source: row.source };
}

export async function GET(context: APIContext): Promise<Response> {
  const pdb = getPromnetDB(context);
  if (!pdb) return jerr(500, 'PROMNET_DB nincs konfigurálva.');
  const db = getDB(context);
  if (!db) return jerr(500, 'DB nincs konfigurálva.');

  const url = new URL(context.request.url);
  const ssoToken = url.searchParams.get('_sso');
  const sessionToken = url.searchParams.get('session');
  const nextParam = url.searchParams.get('next');
  const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : '/play';

  let userId: string | null = null;
  let resolvedToken: string | null = null;

  // A) handoff-token (egyszer-felhasználható, single-use)
  if (ssoToken) {
    const claim = await redeemHandoff(pdb as never, ssoToken);
    if (!claim) return jerr(401, 'Érvénytelen vagy lejárt SSO-token.');
    userId = claim.userId;
    // Új session a PromNET sessions-ben, hogy ugyanarra a tokenre tudjuk
    // a navtycoon_session cookie-t kötni.
    const { createPromnetSession } = await import('../../../lib/auth');
    const ip = context.request.headers.get('cf-connecting-ip') ?? undefined;
    const ua = context.request.headers.get('user-agent') ?? undefined;
    resolvedToken = await createPromnetSession(pdb, userId, ip, ua);
  } else if (sessionToken) {
    // B) közvetlen session-token átadás (best-effort, fallback)
    const u = await getUserBySessionToken(pdb, sessionToken);
    if (!u) return jerr(401, 'Érvénytelen session-token.');
    userId = u.id;
    resolvedToken = sessionToken;
  } else {
    return jerr(400, 'Hiányzó _sso vagy session paraméter.');
  }

  if (!userId || !resolvedToken) {
    return jerr(500, 'Belső hiba: userId vagy token nem feloldható.');
  }

  // Player bootstrap — ha még nincs, auto-create.
  try {
    const existing = await getPlayer(db, userId);
    if (!existing) {
      const u = await pdb.prepare(
        'SELECT email, display_name FROM users WHERE id = ? LIMIT 1',
      ).bind(userId).first<{ email: string; display_name: string | null }>();
      const displayName = u?.display_name?.trim();
      const fromEmail = u?.email?.split('@')[0] ?? 'New Hyperscales';
      const companyName = displayName && displayName.length >= 2
        ? displayName.slice(0, 80)
        : fromEmail.slice(0, 80);
      await createPlayer(db, {
        user_id: userId,
        company_name: companyName,
        city: null,
      });
    }
  } catch (e) {
    // best-effort — ne blokkolja a login-t
    console.warn('promnet-callback: player-bootstrap hiba:', (e as Error).message);
  }

  // Cookie + redirect a /play-re (vagy ?next=)
  setSessionCookie(context, resolvedToken);
  return new Response(null, {
    status: 302,
    headers: { Location: safeNext, 'Cache-Control': 'no-store' },
  });
}

function jerr(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
