// GET /auth/callback — az AikaHub ide küld vissza (?code&state vagy ?error&state).
//
// Szándékosan csak szerveroldali 302, törzs nélkül: nincs HTML és nincs szkript, így a `code` soha nem kerül az Umami
// (vagy más harmadik fél) elé, és a Referrer-Policy: no-referrer miatt a következő oldal Referer-fejlécébe sem.
// Logika: src/lib/aikahub.ts handleCallback.
import type { APIContext } from 'astro';
import {
  getDB, getCurrentUser, createSession, setSessionCookie,
} from '../../lib/auth';
import { handleCallback, stateCookieFor } from '../../lib/aikahub';
import { ensurePlayer } from '../../lib/game/bootstrap';
import { backfillHubAchievements, hubFromLocals } from '../../lib/aikahub-achi';
import { localeFromRequest } from '../../lib/i18n/api-errors';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const db = getDB(context);
  if (!db) return redirect('/login?aikahub_error=provider_error');

  const params = new URL(context.request.url).searchParams;
  const sc = stateCookieFor(context.request.url);
  const cookieState = context.cookies.get(sc.name)?.value ?? null;
  context.cookies.delete(sc.name, { path: '/auth', secure: sc.secure });

  const sessionUser = await getCurrentUser(context);
  let result;
  try {
    result = await handleCallback(db, params, cookieState, { sessionUserId: sessionUser?.id ?? null });
  } catch (e) {
    console.error('aikahub callback failed', e);
    return redirect('/login?aikahub_error=provider_error');
  }
  if (!result.ok) {
    return redirect(['already_linked', 'link_conflict', 'signed_in'].includes(result.error)
      ? `/play/settings?aikahub_error=${result.error}#aikahub-link`
      : `/login?aikahub_error=${result.error}`);
  }

  if (!sessionUser || sessionUser.id !== result.userId) {
    const ip = context.request.headers.get('cf-connecting-ip') ?? undefined;
    const ua = context.request.headers.get('user-agent') ?? undefined;
    setSessionCookie(context, await createSession(db, result.userId, ip, ua));
  }
  try {
    const u = await db.prepare('SELECT id, email, display_name FROM users WHERE id = ?')
      .bind(result.userId).first<{ id: string; email: string; display_name: string | null }>();
    // Új játékos nyelve: a landingen/signupon választott (hs_lang süti), különben Accept-Language.
    if (u) await ensurePlayer(db, u, localeFromRequest(context.request));
  } catch (e) {
    console.warn('aikahub callback: ensurePlayer (a /play pótolja):', (e as Error).message);
  }
  // Visszamenőleges AikaHub-szinkron: a már megszerzett achievementek (idempotens a Hubon). A válasz után fut
  // (waitUntil); kulcs, kötés vagy `achievements` hatókör nélkül csendben semmit sem csinál.
  if (result.achievementsScope) {
    const hub = hubFromLocals(context.locals);
    const p = backfillHubAchievements(db, hub, result.userId).catch(() => undefined);
    if (hub.waitUntil) hub.waitUntil(p); else await p;
  }
  return redirect(result.nextPath ?? '/play');
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
