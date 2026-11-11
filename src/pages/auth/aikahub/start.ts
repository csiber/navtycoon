// GET /auth/aikahub/start — „Belépés AikaHub-fiókkal" (lásd src/lib/aikahub.ts).
//   ?next=/play/…  belépés utáni cél (csak saját relatív útvonal)
// Összekötés (már belépett e-mailes user) NEM itt: az POST /auth/aikahub/link, CSRF-tokennel (claude-3 review) —
// egy GET-et idegen oldal is elindíthatna, az AikaHub pedig a meglévő webes engedélyt kattintás nélkül jóváhagyja.
import type { APIContext } from 'astro';
import { getDB, getCurrentUser, safeNextPath } from '../../../lib/auth';
import { redirectUriFor } from '../../../lib/aikahub';
import { bare302, redirectToAuthorize } from '../../../lib/aikahub-routes';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const db = getDB(context);
  const redirectUri = redirectUriFor(context.request.url);
  if (!db || !redirectUri) return bare302('/login?aikahub_error=provider_error');

  // Már belépett user: ne váltsunk csendben fiókot — a Beállításokban kötheti össze.
  if (await getCurrentUser(context)) return bare302('/play/settings?aikahub_error=signed_in#aikahub-link');

  const nextRaw = new URL(context.request.url).searchParams.get('next');
  return redirectToAuthorize(context, db, { redirectUri, nextPath: nextRaw ? safeNextPath(nextRaw) : null });
}
