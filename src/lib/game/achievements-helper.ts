// Convenience helper that loads the counts needed for achievement-checks.
// Use this from any endpoint right before calling checkAndUnlockAchievements.
//
// All count-queries here mirror those in /api/game/achievements GET, so the
// counts-driven achievement-check sees the same view of the world regardless
// of which hot-path triggered it (signup, server-buy, upgrade-buy, etc.).

import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { AchievementCheckInput } from './achievements';
import { getPlayer } from './db';
import type { D1Like } from './db';
import { shiftStars } from './shift-score';

/** comeback_kid: a mélyponthoz (audit_log 'cash_low_point') képest ennyi napon belül kell a 2× MRR. */
export const COMEBACK_WINDOW_SEC = 30 * 86400;
/** comeback_kid: ha a mélyponton (majdnem) nulla volt az MRR, legalább ennek a kétszerese kell ($10 → $20). */
export const COMEBACK_MIN_BASE_CENTS = 1000;
export const CASH_LOW_POINT_ACTION = 'cash_low_point';

/** A leghosszabb, egymást követő napokból álló sorozat hossza (a napok: UTC-napsorszám, tetszőleges sorrendben). */
export function longestDayStreak(days: number[]): number {
  const u = [...new Set(days)].sort((a, b) => a - b);
  let best = 0, run = 0, prev = Number.NaN;
  for (const d of u) {
    run = d === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** comeback_kid: a 30 napon belüli legalacsonyabb mélyponti MRR-hez képest legalább kétszeres a mostani. */
export function comebackReached(lowPointMrrCents: number | null | undefined, mrrCents: number): boolean {
  if (lowPointMrrCents == null || !Number.isFinite(lowPointMrrCents)) return false;
  return mrrCents >= 2 * Math.max(COMEBACK_MIN_BASE_CENTS, lowPointMrrCents);
}

/** A shift_end esemény adatából (resolved, total, satisfaction_total, refunds_cents) a csillagszám; hibás adatnál 0. */
export function starsFromShiftEnd(dataJson: string | null): number {
  if (!dataJson) return 0;
  try {
    const d = JSON.parse(dataJson) as Record<string, unknown>;
    const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);
    if (n('total') <= 0) return 0;
    return shiftStars({ resolved: n('resolved'), total: n('total'), satisfaction_total: n('satisfaction_total'), refunds_cents: n('refunds_cents') });
  } catch {
    return 0;
  }
}

export async function computeAchievementInput(
  db: D1Database | D1Like,
  playerId: string,
): Promise<AchievementCheckInput | null> {
  const player = await getPlayer(db as D1Like, playerId);
  if (!player) return null;
  const d = db as D1Database;
  const customer_count = (await d.prepare(
    'SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1',
  ).bind(playerId).first<{ n: number }>())?.n ?? 0;
  const ticket_count = (await d.prepare(
    'SELECT COUNT(*) AS n FROM tickets WHERE player_id = ?',
  ).bind(playerId).first<{ n: number }>())?.n ?? 0;
  const resolved_ticket_count = (await d.prepare(
    `SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status = 'resolved'`,
  ).bind(playerId).first<{ n: number }>())?.n ?? 0;
  const total_refund_cents = (await d.prepare(
    'SELECT COALESCE(SUM(refunds_given_cents), 0) AS s FROM shift_history WHERE player_id = ?',
  ).bind(playerId).first<{ s: number }>())?.s ?? 0;
  const shift_count = (await d.prepare(
    `SELECT COUNT(*) AS n FROM shift_history WHERE player_id = ? AND outcome = 'completed'`,
  ).bind(playerId).first<{ n: number }>())?.n ?? 0;
  // three_star_shift — a műszak-értékelés a shift_end eseményben él (a shift_history-ban nincs „total”).
  const shiftEnds = (await d.prepare(
    "SELECT data_json FROM events WHERE player_id = ? AND event_type = 'shift_end' ORDER BY id DESC LIMIT 500",
  ).bind(playerId).all<{ data_json: string | null }>()).results ?? [];
  let best_shift_stars = 0;
  for (const r of shiftEnds) best_shift_stars = Math.max(best_shift_stars, starsFromShiftEnd(r.data_json));
  // perfect_week — UTC-napok, amelyeken volt lezárt műszak.
  const dayRows = (await d.prepare(
    "SELECT DISTINCT CAST(ended_at / 86400 AS INTEGER) AS d FROM shift_history " +
    "WHERE player_id = ? AND outcome = 'completed' AND ended_at IS NOT NULL",
  ).bind(playerId).all<{ d: number }>()).results ?? [];
  const shift_streak_days = longestDayStreak(dayRows.map((r) => r.d));
  // survived_first_ddos — az ELSŐ ddos_attempt eseményen a tick által beírt ítélet.
  const ddos = await d.prepare(
    "SELECT data_json FROM events WHERE player_id = ? AND event_type = 'ddos_attempt' ORDER BY spawned_at ASC, id ASC LIMIT 1",
  ).bind(playerId).first<{ data_json: string | null }>();
  let ddos_survived = false;
  try { ddos_survived = !!ddos?.data_json && (JSON.parse(ddos.data_json) as { ddos_survived?: unknown }).ddos_survived === true; } catch { /* hibás JSON */ }
  // comeback_kid — a 30 napon belüli mélypont(ok) MRR-je.
  const nowSec = Math.floor(Date.now() / 1000);
  const low = await d.prepare(
    "SELECT MIN(CAST(json_extract(metadata_json, '$.mrr_cents') AS INTEGER)) AS m FROM audit_log " +
    'WHERE player_id = ? AND action = ? AND created_at >= ?',
  ).bind(playerId, CASH_LOW_POINT_ACTION, nowSec - COMEBACK_WINDOW_SEC).first<{ m: number | null }>();
  const comeback = comebackReached(low?.m ?? null, player.mrr_usd_cents);
  // 2026-11-13 (végjáték): felhőrégió, edge POP, nagyvállalati szerződés (volt-e valaha), befejezés.
  const srv = (await d.prepare(
    "SELECT type, COUNT(*) AS n FROM servers WHERE player_id = ? AND type IN ('cloud_region', 'edge_pop') GROUP BY type",
  ).bind(playerId).all<{ type: string; n: number }>()).results ?? [];
  const ent = await d.prepare(
    "SELECT 1 AS x FROM events WHERE player_id = ? AND event_type = 'dedicated_signed' AND json_extract(data_json, '$.enterprise') = 1 LIMIT 1",
  ).bind(playerId).first<{ x: number }>();
  const fin = await d.prepare(
    "SELECT data_json FROM events WHERE player_id = ? AND event_type = 'game_completed' ORDER BY id ASC LIMIT 1",
  ).bind(playerId).first<{ data_json: string | null }>();
  let finished_days: number | null = null;
  if (fin) { try { finished_days = Number((JSON.parse(fin.data_json ?? '{}') as { days?: number }).days) || 0; } catch { finished_days = 0; } }
  return {
    player,
    customer_count,
    ticket_count,
    resolved_ticket_count,
    total_refund_cents,
    shift_count,
    best_shift_stars,
    shift_streak_days,
    ddos_survived,
    comeback,
    cloud_regions: srv.find((r) => r.type === 'cloud_region')?.n ?? 0,
    edge_pops: srv.find((r) => r.type === 'edge_pop')?.n ?? 0,
    enterprise_ever: !!ent,
    finished_days,
  };
}
