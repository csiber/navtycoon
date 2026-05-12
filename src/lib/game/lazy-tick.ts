// src/lib/game/lazy-tick.ts
// Hyperscaler — lazy-tick gating helper.
//
// CF free-tier-en a worker-szintű 5-perces cron-trigger nem regisztrálható
// (5/5 cron-cap). Workaround: minden /play dashboard-load tickteti a
// bejelentkezett játékost — DE csak ha LAZY_TICK_MIN_INTERVAL óta nem volt
// tick.
//
// Konkurrenciára atomikus: az UPDATE-claim akkor sikeres, ha last_ticked_at
// még a régi értéken áll. Két párhuzamos /play-load esetén csak egy nyer.

import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { Player } from './types';
import { tickPlayer } from './tick';
import type { WorkersAIBinding } from '../ai/workers-ai';
import type { VectorizeBinding } from '../ai/vectorize';

export const LAZY_TICK_MIN_INTERVAL_SEC = 5 * 60;

export interface LazyTickEnv {
  ai?: WorkersAIBinding;
  vectorize?: VectorizeBinding;
}

/**
 * Tickteli a játékost EGYSZER, ha legalább LAZY_TICK_MIN_INTERVAL_SEC
 * eltelt az utolsó tick óta. Return: true = tick fired, false = throttled
 * vagy konkurrencia-vesztés, vagy hiba.
 *
 * Hibakezelés: minden exception → console.error + return false (non-fatal:
 * a dashboard render-jét ne blokkolja).
 */
export async function maybeLazyTick(
  db: D1Database,
  player: Player,
  env: LazyTickEnv = {},
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const lastTicked = (player as { last_ticked_at?: number }).last_ticked_at ?? 0;
  if (now - lastTicked < LAZY_TICK_MIN_INTERVAL_SEC) return false;

  // Atomic-ish claim: csak akkor frissítünk, ha last_ticked_at még a régi
  // (cutoff-on aluli) érték. Konkurrens kérések közül csak egy nyer.
  let claim;
  try {
    claim = await db.prepare(
      'UPDATE players SET last_ticked_at = ? WHERE user_id = ? AND last_ticked_at < ?',
    ).bind(now, player.user_id, now - LAZY_TICK_MIN_INTERVAL_SEC).run();
  } catch (e) {
    console.error('lazy-tick claim failed', e);
    return false;
  }
  if ((claim.meta?.changes ?? 0) === 0) return false; // throttled / lost race

  try {
    await tickPlayer(db, player, now, env);
    return true;
  } catch (e) {
    console.error('lazy-tick tick failed', e);
    return false;
  }
}
