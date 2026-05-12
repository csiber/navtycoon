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
  return {
    player,
    customer_count,
    ticket_count,
    resolved_ticket_count,
    total_refund_cents,
    shift_count,
  };
}
