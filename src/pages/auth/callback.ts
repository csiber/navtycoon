// GET /auth/callback — az AikaHub ide küld vissza (?code&state vagy ?error&state).
//
// Szándékosan csak szerveroldali 302, törzs nélkül: nincs HTML és nincs szkript, így a `code` soha nem kerül az Umami
// (vagy más harmadik fél) elé, és a Referrer-Policy: no-referrer miatt a következő oldal Referer-fejlécébe sem.
// Logika: src/lib/aikahub.ts handleCallback.
import type { APIContext } from 'astro';
import {
  getDB, getCurrentUser, createSession, setSessionCookie,
} from '../../lib/auth';
import { handleCallback, STATE_COOKIE } from '../../lib/aikahub';
import { ensurePlayer } from '../../lib/game/bootstrap';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const db = getDB(context);
  if (!db) return redirect('/login?aikahub_error=provider_error');

  const params = new URL(context.request.url).searchParams;
  const cookieState = context.cookies.get(STATE_COOKIE)?.value ?? null;
  context.cookies.delete(STATE_COOKIE, { path: '/auth' });

  const sessionUser = await getCurrentUser(context);
  let result;
  try {
    result = await handleCallback(db, params, cookieState, { sessionUserId: sessionUser?.id ?? null });
  } catch (e) {
    console.error('aikahub callback failed', e);
    return redirect('/login?aikahub_error=provider_error');
  }
  if (!result.ok) {
    return redirect(result.error === 'already_linked' || result.error === 'link_conflict'
      ? `/play/settings?aikahub_error=${result.error}`
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
    if (u) await ensurePlayer(db, u);
  } catch (e) {
    console.warn('aikahub callback: ensurePlayer (a /play pótolja):', (e as Error).message);
  }
  return redirect(result.nextPath ?? '/play');
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
