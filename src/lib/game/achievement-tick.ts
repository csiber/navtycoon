// Hyperscales — a tick achievement-lépései (2026-11-12). A tickPlayer (cron és lazy-tick) a végén hívja:
//  1. comeback_kid mélypontja: ha a pénz az alacsony-pénz küszöb (max(LOW_CASH_WARN_CENTS, 7 napi kiadás)) alatt van,
//     naponta legfeljebb egyszer feljegyezzük az akkori MRR-t az audit_log-ba ('cash_low_point'). Migráció nem kell.
//  2. survived_first_ddos: az ELSŐ ddos_attempt eseményt a lezárás (events/[id]/resolve) a `customers_at_resolve`
//     ügyfélszámmal menti; az utána következő első tick ide beírja a `ddos_survived` ítéletet (az ügyfélszám ≥ 90%-a).
//  3. Achievement-ellenőrzés (korszak-, MRR-, ügyfél-achievementek a tick után) + AikaHub-továbbítás.
// Mindhárom best-effort: hiba esetén a tick normálisan fut tovább.

import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { Player } from './types';
import { LOW_CASH_WARN_CENTS } from './economy';
import { dailyCashFlow } from './runway';
import { CASH_LOW_POINT_ACTION, computeAchievementInput } from './achievements-helper';
import { checkAndUnlockAchievements } from './achievements';
import type { HubCtx } from '../aikahub-achi';

export const DDOS_SURVIVE_RATIO = 0.9;

/** Az alacsony-pénz küszöb, ami alatt mélypontot jegyzünk (cent). */
export function lowCashThresholdCents(p: Pick<Player, 'cash_usd_cents' | 'mrr_usd_cents' | 'marketing_ppc_pct'>): number {
  const flow = dailyCashFlow({ cash_usd_cents: p.cash_usd_cents, mrr_usd_cents: p.mrr_usd_cents, marketing_ppc_pct: p.marketing_ppc_pct });
  return Math.max(LOW_CASH_WARN_CENTS, 7 * flow.cost_per_day_cents);
}

export async function recordCashLowPoint(db: D1Database, p: Player, now: number): Promise<boolean> {
  if (p.cash_usd_cents >= lowCashThresholdCents(p)) return false;
  const recent = await db.prepare(
    'SELECT 1 AS x FROM audit_log WHERE player_id = ? AND action = ? AND created_at >= ? LIMIT 1',
  ).bind(p.user_id, CASH_LOW_POINT_ACTION, now - 86400).first<{ x: number }>();
  if (recent) return false;
  await db.prepare('INSERT INTO audit_log (player_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(p.user_id, CASH_LOW_POINT_ACTION, JSON.stringify({ mrr_cents: p.mrr_usd_cents, cash_cents: p.cash_usd_cents }), now).run();
  return true;
}

/** Az első DDoS-esemény túlélési ítélete (egyszer). Visszaadja az ítéletet, vagy null-t, ha most nincs mit eldönteni. */
export async function markDdosSurvival(db: D1Database, playerId: string): Promise<boolean | null> {
  const ev = await db.prepare(
    "SELECT id, data_json, resolved_at FROM events WHERE player_id = ? AND event_type = 'ddos_attempt' ORDER BY spawned_at ASC, id ASC LIMIT 1",
  ).bind(playerId).first<{ id: number; data_json: string | null; resolved_at: number | null }>();
  if (!ev || ev.resolved_at == null || !ev.data_json) return null;
  let data: Record<string, unknown>;
  try { data = JSON.parse(ev.data_json) as Record<string, unknown>; } catch { return null; }
  if (typeof data.customers_at_resolve !== 'number' || 'ddos_survived' in data) return null;
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1')
    .bind(playerId).first<{ n: number }>())?.n ?? 0;
  const survived = n >= data.customers_at_resolve * DDOS_SURVIVE_RATIO - 1e-9;
  await db.prepare('UPDATE events SET data_json = ? WHERE id = ?')
    .bind(JSON.stringify({ ...data, customers_after: n, ddos_survived: survived }), ev.id).run();
  return survived;
}

export async function tickAchievements(db: D1Database, playerId: string, now: number, hub?: HubCtx): Promise<string[]> {
  const fresh = await db.prepare('SELECT * FROM players WHERE user_id = ?').bind(playerId).first<Player>();
  if (!fresh) return [];
  try { await recordCashLowPoint(db, fresh, now); } catch (e) { console.error('achievement-tick: low point', (e as Error)?.message); }
  try { await markDdosSurvival(db, playerId); } catch (e) { console.error('achievement-tick: ddos', (e as Error)?.message); }
  const input = await computeAchievementInput(db, playerId);
  if (!input) return [];
  return checkAndUnlockAchievements(db, playerId, input, { hub });
}
