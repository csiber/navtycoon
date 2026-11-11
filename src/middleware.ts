// Astro middleware — minden SSR-kérés legelején fut.
//
// www → apex 301 (2026-11-11, claude-3 review): a www.hyperscales.app eddig 200-zal szolgált ki mindent. Az AikaHub-
// belépés state-sütije host-only, a callback viszont az apexre érkezik → www-ről indítva mindig state_mismatch lett.
// Egy kanonikus host a sütiknek (navtycoon_session is) és a SEO-nak is jobb. (CF redirect-szabály is javasolt.)
import type { MiddlewareHandler } from 'astro';

const APEX = 'hyperscales.app';

/** 301-cél, ha a kérés a www-hostra jött; különben null. Útvonal és query változatlan. */
export function wwwRedirectTarget(requestUrl: string): string | null {
  const u = new URL(requestUrl);
  if (u.hostname !== `www.${APEX}`) return null;
  return `https://${APEX}${u.pathname}${u.search}`;
}

// (defineMiddleware helyett típus: így a vitest is be tudja importálni — az astro:middleware virtuális modul.)
export const onRequest: MiddlewareHandler = (context, next) => {
  const target = wwwRedirectTarget(context.request.url);
  if (target) {
    return new Response(null, { status: 301, headers: { Location: target, 'Cache-Control': 'public, max-age=3600' } });
  }
  return next();
};
