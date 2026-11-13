// GET /api/game/achievements — list all achievements + unlocked-state.
// Re-evaluates counts on every call and triggers unlock-checks (idempotent).
// Returns the full catalog so the frontend can render locked/unlocked badges.
// A rejtett (hidden) achievement, amíg nincs meg, „???”-ként jön: név, leírás és ikon nélkül.
// 2026-11-13: minden sor a játékos nyelvén is hozza a nevet és a leírást (`title_local`, `desc_local`; a rejtett,
// meg nem szerzett soron „???”) — a toast ebből veszi a frissen feloldott rejtett achievement valódi nevét, mert az
// oldalba ágyazott térkép (achievementMap) a rejtetteket nem tartalmazza.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import {
  ACHIEVEMENTS,
  checkAndUnlockAchievements,
} from '../../../lib/game/achievements';
import { computeAchievementInput } from '../../../lib/game/achievements-helper';
import { hubFromLocals } from '../../../lib/aikahub-achi';
import { achievementCell } from '../../../lib/play/achievements-i18n';
import { resolveLocale } from '../../../lib/i18n/server';
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

  const locale = await resolveLocale({ request: c.request, db: db as unknown as D1Database, userId: user.id });
  const list = ACHIEVEMENTS.map((a) => {
    const have = unlocked.has(a.id);
    const masked = !!a.hidden && !have;
    const cell = achievementCell(locale, a.id, have);
    return {
      id: masked ? 'hidden' : a.id,
      title: masked ? HIDDEN_MASK : a.title,
      description: masked ? '' : a.description,
      title_local: cell.title,
      desc_local: masked ? '' : cell.desc,
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
