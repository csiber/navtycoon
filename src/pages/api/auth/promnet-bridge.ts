// GET /api/auth/promnet-bridge — átdobja a usert PromNET login-ra,
// majd a callback-re vissza.
//
// Áramlat:
//   1. User itt érkezik: /api/auth/promnet-bridge[?next=/play]
//   2. Redirect: https://promnet.hu/app/belepes?next=<path>
//      A `next` paraméter a PromNET belepes.astro-ban csak local-path-et
//      fogad el (`startsWith('/')`), így a cross-domain visszairányítást
//      a PromNET app-on belüli /api/auth/sso/issue endpoint intézi —
//      DE az csak POST. Ezért a megvalósítás itt: a user PromNET-en
//      bejelentkezik, majd manuálisan vagy a "Vissza a játékhoz" CTA-val
//      visszanavigál a /api/auth/promnet-callback URL-re Hyperscaler-en.
//      A callback a saját PROMNET_DB binding-on át validálja a session-t.
//
//   Megjegyzés: ha a user már be van lépve PromNET-en (pn_session cookie van),
//   a következő iterációban érdemes itt egy POST-ot intézni a PromNET
//   /api/auth/sso/issue endpointra — viszont ahhoz Hyperscaler-t fel kell
//   venni az ALLOWED_TARGET_HOSTS whitelist-re a PromNET issue.ts-ben.

import type { APIContext } from 'astro';

export const prerender = false;

const PROMNET_BASE = 'https://promnet.hu';
const CALLBACK_PATH = '/api/auth/promnet-callback';

export async function GET(context: APIContext): Promise<Response> {
  const url = new URL(context.request.url);
  const nextParam = url.searchParams.get('next');
  // Csak local-path-et fogadunk el a `next`-ben — open-redirect védelem.
  const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : '/play';

  // A callback URL Hyperscaler-en, ahova a user "Vissza a játékhoz" után
  // visszanavigál; pre-encode-oljuk a `?next=` paramban hogy a teljes round-trip
  // után a /play (vagy egyéb safe path) legyen a végcél.
  const callbackUrl = new URL(CALLBACK_PATH, url.origin);
  callbackUrl.searchParams.set('next', safeNext);

  // PromNET belepes — `next=` csak `/`-kezdetű path-et fogad el, így a
  // PromNET /app főoldalra megy a login után. Onnan a user vissza-navigál
  // hyperscaler.game-re; a Hyperscaler middleware/promnet-callback a
  // PROMNET_DB-n át validálja a session-tokent.
  const target = new URL('/app/belepes', PROMNET_BASE);
  target.searchParams.set('next', '/app');

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
      // A callback-URL-t a usernek a PromNET app-on egy CTA-link mutatja
      // ("Vissza a Hyperscaler-be"); itt header-ként is jelezzük debug-ra.
      'X-Hyperscaler-Callback': callbackUrl.toString(),
    },
  });
}
