// src/lib/game/llm-cap.ts
// Hyperscales — Plan 2 Task 4: per-user daily LLM-call budget tracker.
// Free=5/day, Pro=50/day. UPSERT-pattern atomi-inkrementtel; cap-túllépéskor
// rollback-decrement, hogy a counter ne ússzon el a cap fölé.
//
// Konvenció: nap-kulcs UTC YYYY-MM-DD; 00:00 UTC reset.
// Tábla: llm_usage(player_id TEXT, day TEXT, call_count INTEGER, PK(player_id, day))
// — migration 0002_llm_cap_and_shift.sql.

import type { D1Database } from '@cloudflare/workers-types/experimental';

export const FREE_DAILY_CAP = 5;
export const PRO_DAILY_CAP = 50;

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function tryConsumeLlmCall(
  db: D1Database, playerId: string, isPro: boolean,
): Promise<boolean> {
  const day = todayKey();
  const cap = isPro ? PRO_DAILY_CAP : FREE_DAILY_CAP;
  const r = await db.prepare(`
    INSERT INTO llm_usage (player_id, day, call_count) VALUES (?, ?, 1)
    ON CONFLICT (player_id, day) DO UPDATE SET call_count = call_count + 1
    RETURNING call_count
  `).bind(playerId, day).first<{ call_count: number }>();
  const newCount = r?.call_count ?? 0;
  if (newCount > cap) {
    await db.prepare(`
      UPDATE llm_usage SET call_count = call_count - 1 WHERE player_id = ? AND day = ?
    `).bind(playerId, day).run();
    return false;
  }
  return true;
}

export async function getLlmUsageToday(
  db: D1Database, playerId: string,
): Promise<number> {
  const r = await db.prepare(`
    SELECT call_count FROM llm_usage WHERE player_id = ? AND day = ?
  `).bind(playerId, todayKey()).first<{ call_count: number }>();
  return r?.call_count ?? 0;
}

export function getDailyCap(isPro: boolean): number {
  return isPro ? PRO_DAILY_CAP : FREE_DAILY_CAP;
}
