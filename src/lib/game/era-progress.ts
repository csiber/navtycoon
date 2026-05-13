// src/lib/game/era-progress.ts
// Hyperscaler — era-progression logic.
//
// Players start in Era 1 (LAMP) and auto-advance when meeting the next-era
// requirements. Each era unlocks new server types, more customer-acquisition
// rate (via ERA_FACTOR in tick.ts), and gates UI sections (Staff, Network).
//
// Checked once per tick at the end of tickPlayer; advancement is "sticky"
// (no downgrades). Each advancement spawns an `era_unlock` event so the
// player sees it on dashboard + devlog.

import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { Player, EraId } from './types';

export interface EraRequirements {
  era: EraId;
  display: string;
  min_mrr_cents: number;
  min_servers: number;
  min_days_alive: number;
  min_reputation: number;
}

export const ERA_REQUIREMENTS: EraRequirements[] = [
  // Era 1 → 2 (Colo)
  { era: 2, display: 'Colo', min_mrr_cents: 10000, min_servers: 1, min_days_alive: 7, min_reputation: 60 },
  // Era 2 → 3 (VPS)
  { era: 3, display: 'VPS', min_mrr_cents: 100000, min_servers: 3, min_days_alive: 30, min_reputation: 70 },
  // Era 3 → 4 (Dedicated)
  { era: 4, display: 'Dedicated', min_mrr_cents: 1000000, min_servers: 8, min_days_alive: 90, min_reputation: 80 },
];

export interface EraCheckInput {
  current_era: EraId;
  mrr_usd_cents: number;
  server_count: number;
  days_alive: number;
  reputation: number;
}

/**
 * Returns the next-era requirements the player would need to meet to advance,
 * or null if they're already at the max era.
 */
export function nextEraTarget(currentEra: EraId): EraRequirements | null {
  return ERA_REQUIREMENTS.find((r) => r.era === currentEra + 1) ?? null;
}

/**
 * True if the player meets ALL next-era requirements.
 */
export function meetsNextEra(input: EraCheckInput): EraRequirements | null {
  const target = nextEraTarget(input.current_era);
  if (!target) return null;
  if (input.mrr_usd_cents < target.min_mrr_cents) return null;
  if (input.server_count < target.min_servers) return null;
  if (input.days_alive < target.min_days_alive) return null;
  if (input.reputation < target.min_reputation) return null;
  return target;
}

/**
 * Checks era-progression and advances the player if they qualify.
 * Returns the new era id (or null if no advancement).
 *
 * Advancement is a single step per call — multi-era jumps not supported
 * (player would have to play through one era at a time). This is intentional
 * to pace progression.
 *
 * Side-effects: UPDATE players SET current_era + INSERT INTO events.
 */
export async function maybeAdvanceEra(
  db: D1Database,
  player: Player,
  now: number,
): Promise<EraId | null> {
  // Count servers (cheap query, ~5ms).
  const srvRow = await db.prepare(
    'SELECT COUNT(*) AS n FROM servers WHERE player_id = ?',
  ).bind(player.user_id).first<{ n: number }>();
  const serverCount = srvRow?.n ?? 0;
  const daysAlive = Math.floor((now - player.founded_at) / 86400);
  const target = meetsNextEra({
    current_era: player.current_era,
    mrr_usd_cents: player.mrr_usd_cents,
    server_count: serverCount,
    days_alive: daysAlive,
    reputation: player.reputation,
  });
  if (!target) return null;
  await db.prepare(
    'UPDATE players SET current_era = ? WHERE user_id = ? AND current_era < ?',
  ).bind(target.era, player.user_id, target.era).run();
  // Spawn era-unlock event for visibility on devlog + dashboard.
  await db.prepare(
    'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
    "VALUES (?, 'era_unlock', ?, ?, 'positive', ?)",
  ).bind(
    player.user_id,
    JSON.stringify({ to_era: target.era, to_era_display: target.display }),
    now, now,
  ).run();
  return target.era;
}
