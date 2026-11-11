// POST /api/game/marketing — marketing-mix beállítása.
// Auth → tetszőleges seo/ppc/referral súlyok → normalizeMix (100% sum, balanced
// default ha mind 0) → updatePlayer. A normalize csendes: nincs 422, mindig ok.
import { legacyError } from '../../../lib/i18n/api-errors';
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { updatePlayer } from '../../../lib/game/db';
import { normalizeMix } from '../../../lib/game/marketing';

export const prerender = false;


export const POST = async (c: APIContext): Promise<Response> => {
  // Hibaüzenet a játékos nyelvén (src/lib/i18n/api-errors.ts legacyError).
  const jerr = (s: number, e: string): Response => legacyError(c.request, s, e);
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  let body: { seo?: number; ppc?: number; referral?: number } = {};
  try {
    body = await c.request.json();
  } catch {
    return jerr(400, 'JSON');
  }

  const mix = normalizeMix(body);
  await updatePlayer(db, user.id, {
    marketing_seo_pct: mix.seo,
    marketing_ppc_pct: mix.ppc,
    marketing_referral_pct: mix.referral,
  });

  return new Response(JSON.stringify({ ok: true, mix }), {
    headers: { 'content-type': 'application/json' },
  });
};
