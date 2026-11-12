// GET /api/game/achievements — list all achievements + unlocked-state.
// Re-evaluates counts on every call and triggers unlock-checks (idempotent).
// Returns the full catalog so the frontend can render locked/unlocked badges.
// A rejtett (hidden) achievement, amíg nincs meg, „???”-ként jön: név, leírás és ikon nélkül.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import {
  ACHIEVEMENTS,
  checkAndUnlockAchievements,
} from '../../../lib/game/achievements';
import { computeAchievementInput } from '../../../lib/game/achievements-helper';
import { hubFromLocals } from '../../../lib/aikahub-achi';
import type { D1Database } from '@cloudflare/workers-types/experimental';

export const prerender = false;

const HIDDEN_MASK = '???';

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return new Response('auth', { status: 401 });
  const db = getDB(c);
  if (!db) return new Response('no DB', { status: 500 });
  const input = await computeAchievementInput(db as unknown as D1Database, user.id);
  if (!input) return new Response('no player', { status: 404 });

  // Trigger unlock-checks (+ AikaHub-továbbítás, ha van kötés és kulcs).
  const newlyUnlocked = await checkAndUnlockAchievements(
    db as unknown as D1Database, user.id, input, { hub: hubFromLocals(c.locals) },
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

  const list = ACHIEVEMENTS.map((a) => {
    const have = unlocked.has(a.id);
    const masked = !!a.hidden && !have;
    return {
      id: masked ? 'hidden' : a.id,
      title: masked ? HIDDEN_MASK : a.title,
      description: masked ? '' : a.description,
      emoji: masked ? '❔' : a.emoji,
      hidden: !!a.hidden,
      unlocked: have,
      unlocked_at: unlocked.get(a.id) ?? null,
    };
  });

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
