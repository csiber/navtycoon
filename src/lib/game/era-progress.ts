// src/lib/game/era-progress.ts
// Hyperscales — era-progression logic.
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
import { ECONOMY } from './economy';
import { bigClientFeeCents, BIG_TIERS_SQL } from './dedicated';

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
  /** A korszakhoz SZÁMÍTÓ MRR (2026-11-12: a nagy, dedikált ügyfelek díja nélkül — lásd eraMrrCents). */
  mrr_usd_cents: number;
  /** Ennyi MRR nem számít bele (a nagy ügyfelek díja) — csak a kijelzéshez. */
  mrr_excluded_cents?: number;
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

export interface EraRequirementRow {
  /** Stabil kulcs a fordításhoz: mrr | servers | days | reputation. */
  key: 'mrr' | 'servers' | 'days' | 'reputation';
  current: number;
  needed: number;
  pct: number;
  done: boolean;
}

export interface EraProgress {
  /** A nagy ügyfelek díja, ami nem számít a korszakhoz (0, ha nincs). */
  mrr_excluded_cents: number;
  target_era: EraId;
  target_display: string;
  reqs: EraRequirementRow[];
  met_count: number;
  total: number;
}

/** Napok az alapítás óta — UGYANAZ, amit a maybeAdvanceEra használ. */
export function daysAlive(foundedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - foundedAt) / 86400));
}

/**
 * A következő korszak feltételei a játékos valós állapotából — az EGYETLEN forrás, amit a vezérlő, a csapat-,
 * a hálózat-lap és az oldalsáv is mutat (2026-11-11). Pontosan a meetsNextEra szabályait tükrözi:
 * a pipa csak akkor jár, ha az adott feltétel tényleg teljesül. Max korszakban null.
 */
export function eraProgress(input: EraCheckInput): EraProgress | null {
  const target = nextEraTarget(input.current_era);
  if (!target) return null;
  const rows: Array<Omit<EraRequirementRow, 'pct' | 'done'>> = [
    { key: 'mrr', current: Math.floor(input.mrr_usd_cents / 100), needed: Math.floor(target.min_mrr_cents / 100) },
    { key: 'servers', current: input.server_count, needed: target.min_servers },
    { key: 'days', current: input.days_alive, needed: target.min_days_alive },
    { key: 'reputation', current: input.reputation, needed: target.min_reputation },
  ];
  const doneOf: Record<EraRequirementRow['key'], boolean> = {
    mrr: input.mrr_usd_cents >= target.min_mrr_cents,
    servers: input.server_count >= target.min_servers,
    days: input.days_alive >= target.min_days_alive,
    reputation: input.reputation >= target.min_reputation,
  };
  const reqs = rows.map((r) => ({
    ...r,
    pct: Math.max(0, Math.min(100, Math.round((r.current / Math.max(1, r.needed)) * 100))),
    done: doneOf[r.key],
  }));
  return {
    mrr_excluded_cents: Math.max(0, input.mrr_excluded_cents ?? 0),
    target_era: target.era,
    target_display: target.display,
    reqs,
    met_count: reqs.filter((r) => r.done).length,
    total: reqs.length,
  };
}

/**
 * A korszakhoz számító MRR (2026-11-12, dedikált-kör): a teljes MRR a dedikált (nagy) ügyfelek díja nélkül.
 * Csaba döntése: „a 3. korszak nem hamar kipörgethető" — a nagy ügyfél bevétel, de nem korszak-ugrató.
 * A kijelzett MRR, a pénz és a ranglista a teljes összeg marad.
 */
export function eraMrrCents(totalMrrCents: number, dedicatedFeesCents: number): number {
  return Math.max(0, totalMrrCents - Math.max(0, dedicatedFeesCents));
}

/** Az aktív nagy ügyfelek (dedikált + 2026-11-13 óta nagyvállalati) díjainak összege (cent). */
export async function dedicatedMrrCents(db: D1Database, playerId: string): Promise<number> {
  if (!ECONOMY.dedicated) return 0;
  const rows = (await db.prepare(`SELECT id, plan_tier FROM customers WHERE player_id = ? AND is_active = 1 AND plan_tier IN ${BIG_TIERS_SQL}`)
    .bind(playerId).all<{ id: number; plan_tier: string }>()).results ?? [];
  return rows.reduce((a, r) => a + bigClientFeeCents(ECONOMY, r.id, r.plan_tier), 0);
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
  const target = meetsNextEra({
    current_era: player.current_era,
    mrr_usd_cents: eraMrrCents(player.mrr_usd_cents, await dedicatedMrrCents(db, player.user_id)),
    server_count: serverCount,
    days_alive: daysAlive(player.founded_at, now),
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
