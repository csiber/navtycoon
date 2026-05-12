// GET /api/game/achievements — list all achievements + unlocked-state.
// Re-evaluates counts on every call and triggers unlock-checks (idempotent).
// Returns the full catalog so the frontend can render locked/unlocked badges.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import {
  ACHIEVEMENTS,
  checkAndUnlockAchievements,
} from '../../../lib/game/achievements';
import { getPlayer } from '../../../lib/game/db';
import type { D1Database } from '@cloudflare/workers-types/experimental';

export const prerender = false;

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return new Response('auth', { status: 401 });
  const db = getDB(c);
  if (!db) return new Response('no DB', { status: 500 });
  const player = await getPlayer(db, user.id);
  if (!player) return new Response('no player', { status: 404 });

  // Compute current counts in parallel.
  const [
    customerRow,
    ticketRow,
    resolvedTicketRow,
    refundRow,
    shiftRow,
  ] = await Promise.all([
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1',
      )
      .bind(user.id)
      .first<{ n: number }>(),
    db
      .prepare('SELECT COUNT(*) AS n FROM tickets WHERE player_id = ?')
      .bind(user.id)
      .first<{ n: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status = 'resolved'",
      )
      .bind(user.id)
      .first<{ n: number }>(),
    db
      .prepare(
        'SELECT COALESCE(SUM(refunds_given_cents), 0) AS s FROM shift_history WHERE player_id = ?',
      )
      .bind(user.id)
      .first<{ s: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM shift_history WHERE player_id = ? AND outcome = 'completed'",
      )
      .bind(user.id)
      .first<{ n: number }>(),
  ]);

  const customer_count = customerRow?.n ?? 0;
  const ticket_count = ticketRow?.n ?? 0;
  const resolved_ticket_count = resolvedTicketRow?.n ?? 0;
  const total_refund_cents = refundRow?.s ?? 0;
  const shift_count = shiftRow?.n ?? 0;

  // Trigger unlock-checks.
  const newlyUnlocked = await checkAndUnlockAchievements(
    db as unknown as D1Database,
    user.id,
    {
      player,
      customer_count,
      ticket_count,
      resolved_ticket_count,
      total_refund_cents,
      shift_count,
    },
  );

  // Final list with unlocked-state.
  const unlockedRows = (
    await db
      .prepare(
        'SELECT achievement_id, unlocked_at FROM achievements WHERE player_id = ?',
      )
      .bind(user.id)
      .all<{ achievement_id: string; unlocked_at: number }>()
  ).results ?? [];
  const unlocked = new Map(
    unlockedRows.map((r) => [r.achievement_id, r.unlocked_at]),
  );

  const list = ACHIEVEMENTS.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    emoji: a.emoji,
    unlocked: unlocked.has(a.id),
    unlocked_at: unlocked.get(a.id) ?? null,
  }));

  return new Response(
    JSON.stringify({
      ok: true,
      total: list.length,
      unlocked_count: list.filter((a) => a.unlocked).length,
      newly_unlocked: newlyUnlocked,
      achievements: list,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
};
