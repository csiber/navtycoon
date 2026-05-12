// Hyperscaler — achievement-rendszer.
// 12 idempotent, counts-driven unlock-check. A GET /api/game/achievements
// minden hívásnál újra-számolja az aktuális statisztikákat (customer count,
// resolved tickets, refund sum, shift count) és INSERT-elve az újakat.

import type { Player } from './types';
import type { D1Database } from '@cloudflare/workers-types/experimental';

export interface AchievementCheckInput {
  player: Player;
  customer_count: number;
  ticket_count: number;
  resolved_ticket_count: number;
  total_refund_cents: number;
  shift_count: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
  /** True if the player should now be granted this achievement. */
  check(input: AchievementCheckInput): boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_blood',
    title: 'First Blood',
    description: 'Onboarded your first customer.',
    emoji: '🩸',
    check: (i) => i.customer_count >= 1,
  },
  {
    id: 'ten_customers',
    title: 'The Long Tail',
    description: 'Reached 10 active customers.',
    emoji: '📈',
    check: (i) => i.customer_count >= 10,
  },
  {
    id: 'hundred_customers',
    title: 'Centurion',
    description: 'Reached 100 active customers.',
    emoji: '💯',
    check: (i) => i.customer_count >= 100,
  },
  {
    id: 'first_k_mrr',
    title: 'First $1k',
    description: 'Hit $1,000 MRR.',
    emoji: '💵',
    check: (i) => i.player.mrr_usd_cents >= 100000,
  },
  {
    id: 'first_10k_mrr',
    title: 'First $10k',
    description: 'Hit $10,000 MRR.',
    emoji: '💸',
    check: (i) => i.player.mrr_usd_cents >= 1000000,
  },
  {
    id: 'one_million_lifetime',
    title: 'Polyák Award',
    description: 'Lifetime $1M MRR (annualized).',
    emoji: '🏆',
    check: (i) => i.player.mrr_usd_cents * 12 >= 100000000,
  },
  {
    id: 'ticket_whisperer',
    title: 'Ticket Whisperer',
    description: 'Resolved 50 tickets.',
    emoji: '🎫',
    check: (i) => i.resolved_ticket_count >= 50,
  },
  {
    id: 'refund_king',
    title: 'Refund King',
    description: 'Gave out $1k in refunds. (Honorary villain.)',
    emoji: '💀',
    check: (i) => i.total_refund_cents >= 100000,
  },
  {
    id: 'first_shift',
    title: 'First Shift',
    description: 'Completed your first support shift.',
    emoji: '🕯️',
    check: (i) => i.shift_count >= 1,
  },
  {
    id: 'shift_marathon',
    title: 'Shift Marathon',
    description: 'Completed 10 shifts.',
    emoji: '🏃',
    check: (i) => i.shift_count >= 10,
  },
  {
    id: 'survived_first_ddos',
    title: 'Survived First DDoS',
    description: 'Resolved your first DDoS event.',
    emoji: '🛡️',
    // Counts-driven check can't see event-history; triggered separately
    // by event-resolve flow when first ddos_attempt is resolved.
    check: () => false,
  },
  {
    id: 'high_rep',
    title: 'Trusted Operator',
    description: 'Reputation hit 90+.',
    emoji: '✨',
    check: (i) => i.player.reputation >= 90,
  },
];

/**
 * Idempotent: skip already-owned IDs. Returns newly-unlocked IDs.
 * Race-safe: insert is INSERT (PK collision is silently swallowed).
 */
export async function checkAndUnlockAchievements(
  db: D1Database,
  playerId: string,
  input: AchievementCheckInput,
): Promise<string[]> {
  const owned = new Set(
    (
      await db
        .prepare('SELECT achievement_id FROM achievements WHERE player_id = ?')
        .bind(playerId)
        .all<{ achievement_id: string }>()
    ).results?.map((r) => r.achievement_id) ?? [],
  );

  const newlyUnlocked: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (const a of ACHIEVEMENTS) {
    if (owned.has(a.id)) continue;
    if (!a.check(input)) continue;
    try {
      await db
        .prepare(
          'INSERT INTO achievements (player_id, achievement_id, unlocked_at) VALUES (?, ?, ?)',
        )
        .bind(playerId, a.id, now)
        .run();
      newlyUnlocked.push(a.id);
    } catch {
      // PK collision (race) — already owned, ignore.
    }
  }
  return newlyUnlocked;
}

/**
 * Force-unlock a specific achievement (used by event-resolve for
 * narrative achievements like `survived_first_ddos`). Idempotent.
 */
export async function unlockAchievement(
  db: D1Database,
  playerId: string,
  achievementId: string,
): Promise<boolean> {
  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) return false;
  const now = Math.floor(Date.now() / 1000);
  try {
    const r = await db
      .prepare(
        'INSERT INTO achievements (player_id, achievement_id, unlocked_at) VALUES (?, ?, ?)',
      )
      .bind(playerId, achievementId, now)
      .run();
    return (r.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}
