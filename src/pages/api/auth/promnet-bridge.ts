// GET /api/auth/promnet-bridge — átdobja a usert PromNET login-ra,
// majd VISSZA navtycoonra automatikusan, _sso= handoff-tokennel.
//
// Áramlat:
//   1. User itt érkezik: /api/auth/promnet-bridge[?next=/play]
//   2. Redirect: https://promnet.hu/app/belepes?next=<absolute-hyperscaler-callback-url>
//      A PromNET belepes.astro elfogad absolute URL-t a brand-whitelistre
//      (hyperscaler.promnet.hu rajta van). Login után issue-ol egy SSO
//      handoff-tokent és az absolute URL-re irányít `?_sso=<token>`-nel.
//   3. /api/auth/promnet-callback redeemHandoff-fal validálja a tokent
//      és session-cookie-t állít be.

import type { APIContext } from 'astro';

export const prerender = false;

const PROMNET_BASE = 'https://promnet.hu';
const CALLBACK_PATH = '/api/auth/promnet-callback';

export async function GET(context: APIContext): Promise<Response> {
  const url = new URL(context.request.url);
  const nextParam = url.searchParams.get('next');
  // Csak local-path-et fogadunk el a `next`-ben (open-redirect védelem).
  const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : '/play';

  // Hyperscaler-callback URL (absolute) — a PromNET belepes erre redirectel
  // login után, `?_sso=<handoff-token>`-nel appendelve.
  const callbackUrl = new URL(CALLBACK_PATH, url.origin);
  callbackUrl.searchParams.set('next', safeNext);

  const target = new URL('/app/belepes', PROMNET_BASE);
  target.searchParams.set('next', callbackUrl.toString());

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
    },
  });
}
