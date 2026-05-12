// POST /api/game/server — server-buy endpoint.
// Auth + era-gate + cash-gate + atomic insert+deduct (DB.batch, no race).
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';
import { SERVER_SPECS } from '../../../lib/game/server-types';
import type { ServerType } from '../../../lib/game/types';
import { computeAchievementInput } from '../../../lib/game/achievements-helper';
import { checkAndUnlockAchievements } from '../../../lib/game/achievements';
import type { D1Database } from '@cloudflare/workers-types/experimental';

export const prerender = false;

function jerr(s: number, e: string): Response {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');
  const player = await getPlayer(db, user.id);
  if (!player) return jerr(404, 'no player');

  let body: { type?: string } = {};
  try {
    body = await c.request.json();
  } catch {
    return jerr(400, 'JSON');
  }
  const type = body.type as ServerType;
  const spec = SERVER_SPECS[type];
  if (!spec || spec.capacity === 0) return jerr(400, 'invalid server type');
  if (spec.era > player.current_era) return jerr(403, 'era locked');
  if (player.cash_usd_cents < spec.purchase_cost_cents) return jerr(402, 'insufficient cash');

  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`
      INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).bind(user.id, spec.era, spec.type, spec.capacity, spec.monthly_cost_cents, now),
    db.prepare(`UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?`)
      .bind(spec.purchase_cost_cents, user.id),
  ]);

  let newly_unlocked: string[] = [];
  try {
    const input = await computeAchievementInput(db as unknown as D1Database, user.id);
    if (input) {
      newly_unlocked = await checkAndUnlockAchievements(
        db as unknown as D1Database, user.id, input,
      );
    }
  } catch { /* non-fatal */ }

  return new Response(JSON.stringify({ ok: true, spec, newly_unlocked }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};
