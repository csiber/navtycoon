// src/lib/game/endgame.ts
// Hyperscales — a végcél és a befejezés EGY helyen (2026-11-13, végjáték-kör).
//
// A játék végigjátszható: a cél végig látszik az oldalsávon (shell.ts), és ha minden feltétel teljesül, a tick
// (tick.ts 8.5. lépés) egyszer feljegyzi a befejezést egy lezárt `game_completed` eseménysorban (migráció nélkül:
// az events táblában). Utána a játék megy tovább (sandbox), a záróképernyő (/play/finale) bármikor újranézhető,
// a ranglista és a profil „Befejezte X nap alatt" jelzést kap. A „Vállalat újraindítása" (restart.ts) az
// eseményekkel együtt ezt is törli, így az új cég újra befejezheti.
//
// A feltételek (GOAL) a szimulátorral hangolva (economy-sim.ts, 365 napos futások; __tests__/economy-sim.test.ts):
// az aktív játékos ~4–6 hónap alatt ér célba, az alkalmi (napi egy műszak) jóval később vagy soha, a tétlen soha.
// A korszak-feltételekhez hasonlóan a nagy ügyfelek (dedikált, nagyvállalati) díja az MRR-be nem számít — a
// nagyvállalati szerződés külön feltétel.

import type { D1Database } from '@cloudflare/workers-types/experimental';
import { ENTERPRISE_TIER } from './dedicated';

export interface GoalRule {
  era: number;
  /** A célhoz számító MRR (cent) — a nagy ügyfelek díja nélkül (era-progress.eraMrrCents). */
  min_mrr_cents: number;
  min_reputation: number;
  min_cloud_regions: number;
  min_edge_pops: number;
  /** Élő nagyvállalati szerződés (plan_tier = 'enterprise'). */
  min_enterprise: number;
}

export const GOAL: GoalRule = {
  era: 4,
  min_mrr_cents: 1500000,
  min_reputation: 90,
  min_cloud_regions: 2,
  min_edge_pops: 3,
  min_enterprise: 1,
};

export interface GoalInput {
  era: number;
  /** A célhoz számító MRR (cent, a nagy ügyfelek nélkül). */
  goal_mrr_cents: number;
  reputation: number;
  cloud_regions: number;
  edge_pops: number;
  enterprise_clients: number;
}

export type GoalKey = 'era' | 'mrr' | 'reputation' | 'regions' | 'pops' | 'enterprise';

export interface GoalRow {
  key: GoalKey;
  current: number;
  needed: number;
  pct: number;
  done: boolean;
}

export interface GoalProgress {
  reqs: GoalRow[];
  met_count: number;
  total: number;
  /** Minden feltétel teljesül. */
  met: boolean;
}

/** A végcél állása — a tick, az oldalsáv, a záróképernyő és a szimulátor is ezt hívja. */
export function goalProgress(i: GoalInput, g: GoalRule = GOAL): GoalProgress {
  const raw: Array<[GoalKey, number, number]> = [
    ['era', i.era, g.era],
    ['mrr', Math.floor(Math.max(0, i.goal_mrr_cents) / 100), Math.floor(g.min_mrr_cents / 100)],
    ['reputation', i.reputation, g.min_reputation],
    ['regions', i.cloud_regions, g.min_cloud_regions],
    ['pops', i.edge_pops, g.min_edge_pops],
    ['enterprise', i.enterprise_clients, g.min_enterprise],
  ];
  const doneOf: Record<GoalKey, boolean> = {
    era: i.era >= g.era,
    mrr: i.goal_mrr_cents >= g.min_mrr_cents,
    reputation: i.reputation >= g.min_reputation,
    regions: i.cloud_regions >= g.min_cloud_regions,
    pops: i.edge_pops >= g.min_edge_pops,
    enterprise: i.enterprise_clients >= g.min_enterprise,
  };
  const reqs = raw.map(([key, current, needed]) => ({
    key, current, needed,
    pct: Math.max(0, Math.min(100, Math.round((current / Math.max(1, needed)) * 100))),
    done: doneOf[key],
  }));
  const met_count = reqs.filter((r) => r.done).length;
  return { reqs, met_count, total: reqs.length, met: met_count === reqs.length };
}

export const GAME_COMPLETED_EVENT = 'game_completed';
/** Az audit_log-ban a csúcs-MRR (a záróképernyőhöz): metadata_json = { mrr_cents }. */
export const MRR_PEAK_ACTION = 'mrr_peak';

export interface CompletionRecord {
  /** Epoch-másodperc. */
  at: number;
  /** Ennyi nap alatt (az alapítástól). */
  days: number;
  mrr_cents: number;
}

/** A befejezés (ha volt) az events táblából. */
export async function loadCompletion(db: D1Database, playerId: string): Promise<CompletionRecord | null> {
  const row = await db.prepare(
    'SELECT spawned_at, data_json FROM events WHERE player_id = ? AND event_type = ? ORDER BY id ASC LIMIT 1',
  ).bind(playerId, GAME_COMPLETED_EVENT).first<{ spawned_at: number; data_json: string | null }>();
  if (!row) return null;
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(row.data_json ?? '{}') as Record<string, unknown>; } catch { /* hibás JSON */ }
  return { at: row.spawned_at, days: Number(d.days) || 0, mrr_cents: Number(d.mrr_cents) || 0 };
}

/** A játékos végcél-bemenete a DB-ből (gépek, nagyvállalati ügyfelek). Az MRR-t és a hírnevet a hívó adja. */
export async function loadGoalCounts(db: D1Database, playerId: string): Promise<{ cloud_regions: number; edge_pops: number; enterprise_clients: number}> {
  const srv = (await db.prepare(
    "SELECT type, COUNT(*) AS n FROM servers WHERE player_id = ? AND type IN ('cloud_region', 'edge_pop') GROUP BY type",
  ).bind(playerId).all<{ type: string; n: number }>()).results ?? [];
  const ent = await db.prepare(
    'SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1 AND plan_tier = ?',
  ).bind(playerId, ENTERPRISE_TIER).first<{ n: number }>();
  return {
    cloud_regions: srv.find((r) => r.type === 'cloud_region')?.n ?? 0,
    edge_pops: srv.find((r) => r.type === 'edge_pop')?.n ?? 0,
    enterprise_clients: ent?.n ?? 0,
  };
}

/** Félnaponta: ha az MRR új csúcs, feljegyzi (egy sor játékosonként, frissítve). */
export async function recordMrrPeak(db: D1Database, playerId: string, mrrCents: number, now: number): Promise<void> {
  const row = await db.prepare(
    'SELECT id, metadata_json FROM audit_log WHERE player_id = ? AND action = ? ORDER BY id DESC LIMIT 1',
  ).bind(playerId, MRR_PEAK_ACTION).first<{ id: number; metadata_json: string | null }>();
  let peak = 0;
  try { peak = Number((JSON.parse(row?.metadata_json ?? '{}') as { mrr_cents?: number }).mrr_cents) || 0; } catch { /* hibás JSON */ }
  if (mrrCents <= peak) return;
  const meta = JSON.stringify({ mrr_cents: mrrCents });
  if (row) await db.prepare('UPDATE audit_log SET metadata_json = ?, created_at = ? WHERE id = ?').bind(meta, now, row.id).run();
  else await db.prepare('INSERT INTO audit_log (player_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?)').bind(playerId, MRR_PEAK_ACTION, meta, now).run();
}

/** A tárolt csúcs-MRR (0, ha nincs). */
export async function loadMrrPeak(db: D1Database, playerId: string): Promise<number> {
  const row = await db.prepare(
    'SELECT metadata_json FROM audit_log WHERE player_id = ? AND action = ? ORDER BY id DESC LIMIT 1',
  ).bind(playerId, MRR_PEAK_ACTION).first<{ metadata_json: string | null }>();
  try { return Number((JSON.parse(row?.metadata_json ?? '{}') as { mrr_cents?: number }).mrr_cents) || 0; } catch { return 0; }
}

/**
 * A tick vége (8.5): ha a végcél most teljesül és még nem volt befejezés, feljegyzi (egyszer). Visszaadja, hogy
 * most fejezte-e be. Idempotens: a már befejezett cég soha nem kap második sort.
 */
export async function maybeCompleteGame(
  db: D1Database,
  player: { user_id: string; founded_at: number; current_era: number; reputation: number; mrr_usd_cents: number },
  goalMrrCents: number,
  now: number,
): Promise<boolean> {
  if (player.current_era < GOAL.era) return false;
  const counts = await loadGoalCounts(db, player.user_id);
  const gp = goalProgress({
    era: player.current_era, goal_mrr_cents: goalMrrCents, reputation: player.reputation, ...counts,
  });
  if (!gp.met) return false;
  const done = await db.prepare('SELECT 1 AS x FROM events WHERE player_id = ? AND event_type = ? LIMIT 1')
    .bind(player.user_id, GAME_COMPLETED_EVENT).first<{ x: number }>();
  if (done) return false;
  const days = Math.max(0, Math.floor((now - player.founded_at) / 86400));
  await db.prepare(
    'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
    "VALUES (?, 'game_completed', ?, ?, 'positive', ?)",
  ).bind(player.user_id, JSON.stringify({ days, mrr_cents: player.mrr_usd_cents, goal_mrr_cents: goalMrrCents }), now, now).run();
  return true;
}
