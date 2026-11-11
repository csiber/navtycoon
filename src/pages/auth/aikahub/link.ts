// POST /auth/aikahub/link — belépett (e-mailes) user összeköti az AikaHub-fiókját (Beállítások űrlap).
// CSRF: a `csrf` mező = linkCsrfToken(munkamenet-token); az Astro checkOrigin is kiszűri az idegen originű űrlapot.
import type { APIContext } from 'astro';
import { getDB, getCurrentUser, getSessionCookie } from '../../../lib/auth';
import { redirectUriFor, checkLinkCsrf } from '../../../lib/aikahub';
import { bare302, redirectToAuthorize } from '../../../lib/aikahub-routes';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const db = getDB(context);
  const redirectUri = redirectUriFor(context.request.url);
  if (!db || !redirectUri) return bare302('/play/settings?aikahub_error=provider_error#aikahub-link', 303);
  const user = await getCurrentUser(context);
  if (!user) return bare302('/login?next=/play/settings', 303);

  let submitted: string | null = null;
  try {
    const f = await context.request.formData();
    const v = f.get('csrf');
    submitted = typeof v === 'string' ? v : null;
  } catch { /* üres/hibás törzs */ }
  if (!(await checkLinkCsrf(getSessionCookie(context), submitted))) {
    return new Response('forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  // 303: a böngésző GET-tel követi az authorize-oldalra
  return redirectToAuthorize(context, db, { redirectUri, linkUserId: user.id, status: 303 });
}
