// GET /auth/aikahub/start — „Belépés AikaHub-fiókkal" (lásd src/lib/aikahub.ts).
//   ?next=/play/…  belépés utáni cél (csak saját relatív útvonal)
//   ?link=1        belépett (e-mailes) user összeköti az AikaHub-fiókját (Beállítások)
import type { APIContext } from 'astro';
import { getDB, getCurrentUser, safeNextPath } from '../../../lib/auth';
import { startFlow, redirectUriFor, STATE_COOKIE, PENDING_TTL_SEC } from '../../../lib/aikahub';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const db = getDB(context);
  const url = new URL(context.request.url);
  const redirectUri = redirectUriFor(context.request.url);
  if (!db || !redirectUri) return back('/login?aikahub_error=provider_error');

  let linkUserId: string | null = null;
  if (url.searchParams.get('link') === '1') {
    const user = await getCurrentUser(context);
    if (!user) return back('/login?next=/play/settings');
    linkUserId = user.id;
  }
  const nextRaw = url.searchParams.get('next');
  const { state, authorizeUrl } = await startFlow(db, {
    redirectUri,
    linkUserId,
    nextPath: nextRaw ? safeNextPath(nextRaw) : null,
  });
  context.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax', // az AikaHubról visszatérő felső szintű GET-en is elküldi
    path: '/auth',
    maxAge: PENDING_TTL_SEC,
  });
  return back(authorizeUrl);
}

function back(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
