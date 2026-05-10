// POST /api/game/upgrade — upgrade-buy endpoint.
// Auth + era-gate + prereq-gate + owned-check + cash-gate + atomic insert+deduct.
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';
import { getUpgradeById, availableUpgrades } from '../../../lib/game/upgrade-tree';

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

  let body: { upgrade_id?: string } = {};
  try {
    body = await c.request.json();
  } catch {
    return jerr(400, 'JSON');
  }
  const id = body.upgrade_id;
  const spec = id ? getUpgradeById(id) : null;
  if (!spec) return jerr(400, 'invalid upgrade');

  // Owned-check + prereq enforcement
  const ownedRows = await db.prepare('SELECT upgrade_id FROM upgrades WHERE player_id = ?')
    .bind(user.id).all<{ upgrade_id: string }>();
  const ownedIds = new Set(ownedRows.results?.map(r => r.upgrade_id) ?? []);
  const avail = availableUpgrades(player.current_era, ownedIds);
  if (!avail.find(u => u.id === id)) return jerr(403, 'unavailable (era, prereq, or owned)');
  if (player.cash_usd_cents < spec.cost_usd_cents) return jerr(402, 'insufficient cash');

  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('INSERT INTO upgrades (player_id, upgrade_id, purchased_at) VALUES (?, ?, ?)')
      .bind(user.id, id, now),
    db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?')
      .bind(spec.cost_usd_cents, user.id),
  ]);

  return new Response(JSON.stringify({ ok: true, spec }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};
