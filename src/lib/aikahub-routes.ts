// Közös részek a /auth/aikahub/* végpontokhoz (start: belépés, link: összekötés a Beállításokból).
import type { APIContext } from 'astro';
import type { D1Like } from './auth';
import { startFlow, stateCookieFor, PENDING_TTL_SEC } from './aikahub';

/** Törzs nélküli átirányítás, Referer nélkül (a callbacknél a `code` miatt kötelező, máshol sem árt). */
export function bare302(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

/** Új belépési folyamat: oauth_pending-sor + state-süti, majd átirányítás az AikaHub authorize-oldalára. */
export async function redirectToAuthorize(
  context: APIContext, db: D1Like,
  opts: { redirectUri: string; linkUserId?: string | null; nextPath?: string | null; status?: number },
): Promise<Response> {
  const { state, authorizeUrl } = await startFlow(db, opts);
  const c = stateCookieFor(context.request.url);
  context.cookies.set(c.name, state, {
    httpOnly: true,
    secure: c.secure,
    sameSite: 'lax', // az AikaHubról visszatérő felső szintű GET-en is elküldi
    path: '/auth',
    maxAge: PENDING_TTL_SEC,
  });
  return bare302(authorizeUrl, opts.status ?? 302);
}
