// POST /api/game/network — Hálózat (2026-11-12, hálózat-kör). Bármelyik mező elhagyható:
//   { transit_tier?: 0..2, peering?: boolean, ddos?: boolean }
// A tranzit-csomag és a DDoS-védelem havidíjas (a tick időarányosan vonja le), a peering egyszeri díjjal kapcsol be.
// A tranzit kisebbre váltásakor a peering lekapcsol, ha a csomag alá csökken a min_tier-nél.
// Ha a 0013-as migráció még nem futott le, érthető hibát ad (feature_not_ready).
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';
import { ECONOMY } from '../../../lib/game/economy';
import { loadNetwork, clampTier, networkActive } from '../../../lib/game/network';
import { jsonError, localeFromRequest } from '../../../lib/i18n/api-errors';

export const prerender = false;

export const POST = async (c: APIContext): Promise<Response> => {
  const loc = localeFromRequest(c.request);
  const user = await getCurrentUser(c);
  if (!user) return jsonError(401, loc, 'unauthorized');
  const db = getDB(c);
  if (!db) return jsonError(500, loc, 'db_missing');
  const player = await getPlayer(db, user.id);
  if (!player) return jsonError(404, loc, 'no_player');
  const NR = ECONOMY.network;
  if (!networkActive(NR, player.current_era)) return jsonError(403, loc, 'era_locked');

  let body: { transit_tier?: number; peering?: boolean; ddos?: boolean } = {};
  try { body = await c.request.json(); } catch { return jsonError(400, loc, 'invalid_json'); }

  try { await db.prepare('SELECT 1 FROM player_network LIMIT 1').bind().all(); } catch { return jsonError(503, loc, 'feature_not_ready'); }

  const cur = await loadNetwork(db, user.id);
  const next = { ...cur };
  if (body.transit_tier !== undefined) {
    const t = Number(body.transit_tier);
    if (!Number.isInteger(t) || t < 0 || t >= NR.tiers.length) return jsonError(400, loc, 'invalid_value', { field: 'transit_tier' });
    if (NR.tiers[t].min_era > player.current_era) return jsonError(403, loc, 'era_locked');
    next.transit_tier = clampTier(NR, t);
  }
  if (body.ddos !== undefined) next.ddos = body.ddos ? 1 : 0;
  if (body.peering !== undefined) next.peering = body.peering ? 1 : 0;
  if (next.transit_tier < NR.peering.min_tier) next.peering = 0;
  if (next.transit_tier === cur.transit_tier && next.peering === cur.peering && next.ddos === cur.ddos) {
    return jsonError(400, loc, 'nothing_to_update');
  }
  if (body.peering && !cur.peering && next.transit_tier < NR.peering.min_tier) return jsonError(400, loc, 'unavailable');

  const now = Math.floor(Date.now() / 1000);
  let setup = 0;
  if (next.peering && !cur.peering) {
    setup = NR.peering.setup_cents;
    const upd = await db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ? AND cash_usd_cents >= ?')
      .bind(setup, user.id, setup).run();
    if (((upd as { meta?: { changes?: number } }).meta?.changes ?? 0) === 0) return jsonError(402, loc, 'not_enough_cash');
  }
  await db.prepare(
    'INSERT INTO player_network (player_id, transit_tier, peering, ddos, updated_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(player_id) DO UPDATE SET transit_tier = excluded.transit_tier, peering = excluded.peering, ddos = excluded.ddos, updated_at = excluded.updated_at',
  ).bind(user.id, next.transit_tier, next.peering, next.ddos, now).run();
  await db.prepare(
    'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
    "VALUES (?, 'network_changed', ?, ?, 'neutral', ?)",
  ).bind(user.id, JSON.stringify({ from: cur, to: next, cash_delta_cents: setup ? -setup : 0 }), now, now).run();
  return new Response(JSON.stringify({ ok: true, network: next, setup_cents: setup }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
};
