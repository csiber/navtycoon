// POST /api/game/pricing — plan-tier árazás állítása.
// Auth → JSON-validáció → clamp (PRICING_BOUNDS) → updatePlayer.
// A clamp csendes: ha a kliens out-of-bounds értéket küld, befogjuk és
// a befogott értékkel térünk vissza (nincs 422, csak ok=true).
import { legacyError } from '../../../lib/i18n/api-errors';
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { updatePlayer } from '../../../lib/game/db';
import { clampPricing } from '../../../lib/game/pricing';

export const prerender = false;


export const POST = async (c: APIContext): Promise<Response> => {
  // Hibaüzenet a játékos nyelvén (src/lib/i18n/api-errors.ts legacyError).
  const jerr = (s: number, e: string): Response => legacyError(c.request, s, e);
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  let body: { hobby?: number; business?: number } = {};
  try {
    body = await c.request.json();
  } catch {
    return jerr(400, 'JSON');
  }
  if (typeof body.hobby !== 'number' || typeof body.business !== 'number') {
    return jerr(400, 'hobby+business required');
  }

  const { hobby, business } = clampPricing(Math.round(body.hobby), Math.round(body.business));
  await updatePlayer(db, user.id, {
    pricing_hobby_cents: hobby,
    pricing_business_cents: business,
  });

  return new Response(JSON.stringify({ ok: true, hobby, business }), {
    headers: { 'content-type': 'application/json' },
  });
};
