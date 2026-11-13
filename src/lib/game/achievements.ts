// Hyperscales — achievement-rendszer.
// 18 idempotent, counts-driven unlock-check (2026-11-12: a Hub-lista szerint, hyperscales.md). A GET /api/game/achievements
// minden hívásnál újra-számolja az aktuális statisztikákat (customer count,
// resolved tickets, refund sum, shift count) és INSERT-elve az újakat.

import type { Player } from './types';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { notifyHubUnlocks, type HubCtx } from '../aikahub-achi';

export interface AchievementCheckInput {
  player: Player;
  customer_count: number;
  ticket_count: number;
  resolved_ticket_count: number;
  total_refund_cents: number;
  shift_count: number;
  /** A legjobb lezárt műszak csillagszáma (1–3; 0 = még nincs). A shift_end események adataiból (shift-score). */
  best_shift_stars?: number;
  /** A leghosszabb sorozat egymást követő UTC-napokból, amelyeken volt lezárt műszak. */
  shift_streak_days?: number;
  /** Az első DDoS-esemény lezárva, és a következő tickig az ügyfélszám legfeljebb 10%-ot esett (a tick jelöli). */
  ddos_survived?: boolean;
  /** A 30 napon belüli pénz-mélyponthoz (audit_log 'cash_low_point') képest legalább kétszeres MRR. */
  comeback?: boolean;
  /** 2026-11-13 (végjáték): felhőrégiók és edge POP-ok száma most; volt-e már nagyvállalati szerződés;
   *  a befejezés napja (null = még nem fejezte be; endgame.ts game_completed). */
  cloud_regions?: number;
  edge_pops?: number;
  enterprise_ever?: boolean;
  finished_days?: number | null;
}

/** Rejtett „gyors befejezés" achievement határa (napban, az alapítástól). A szimulátorban az aktív játékos
 *  mediánja ~150 nap, a leggyorsabb seed 126 nap alatt ért célba (120 alatt egy sem) — 2026-11-13: 120 → 140,
 *  hogy a nagyon jól játszó cég tényleg megszerezhesse. */
export const SPEEDRUN_DAYS = 140;

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
  /** Rejtett: amíg nincs meg, a listában „???” látszik (név és leírás nélkül). */
  hidden?: boolean;
  /** True if the player should now be granted this achievement. */
  check(input: AchievementCheckInput): boolean;
}

// A sorrend = a megjelenítési sorrend = a Hub-definíció (hyperscales.md, 18 db + 2026-11-13: 5 végjáték-achievement).
// A Hub-id: hubAchievementId (aikahub-achi.ts).
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_shift',
    title: 'First Shift',
    description: 'Completed your first support shift.',
    emoji: '🕯️',
    check: (i) => i.shift_count >= 1,
  },
  {
    id: 'first_blood',
    title: 'First Blood',
    description: 'Onboarded your first customer.',
    emoji: '🩸',
    check: (i) => i.customer_count >= 1,
  },
  {
    id: 'three_star_shift',
    title: 'Three Stars',
    description: 'Finished a shift with three stars.',
    emoji: '⭐',
    check: (i) => (i.best_shift_stars ?? 0) >= 3,
  },
  {
    id: 'ten_customers',
    title: 'The Long Tail',
    description: 'Reached 10 active customers.',
    emoji: '📈',
    check: (i) => i.customer_count >= 10,
  },
  {
    id: 'shift_marathon',
    title: 'Shift Marathon',
    description: 'Completed 10 shifts.',
    emoji: '🏃',
    check: (i) => i.shift_count >= 10,
  },
  {
    id: 'ticket_whisperer',
    title: 'Ticket Whisperer',
    description: 'Resolved 50 tickets.',
    emoji: '🎫',
    check: (i) => i.resolved_ticket_count >= 50,
  },
  {
    id: 'era_colo',
    title: 'Your Own Cage',
    description: 'Reached the Colo era.',
    emoji: '🏢',
    check: (i) => i.player.current_era >= 2,
  },
  {
    id: 'first_k_mrr',
    title: 'First $1k',
    description: 'Hit $1,000 MRR.',
    emoji: '💵',
    check: (i) => i.player.mrr_usd_cents >= 100000,
  },
  {
    id: 'perfect_week',
    title: 'Perfect Week',
    description: 'Worked a shift seven days in a row.',
    emoji: '🗓️',
    check: (i) => (i.shift_streak_days ?? 0) >= 7,
  },
  {
    id: 'high_rep',
    title: 'Trusted Operator',
    description: 'Reputation hit 90+.',
    emoji: '✨',
    check: (i) => i.player.reputation >= 90,
  },
  {
    id: 'era_vps',
    title: 'Into the Cloud',
    description: 'Reached the VPS era.',
    emoji: '☁️',
    check: (i) => i.player.current_era >= 3,
  },
  {
    id: 'hundred_customers',
    title: 'Centurion',
    description: 'Reached 100 active customers.',
    emoji: '💯',
    check: (i) => i.customer_count >= 100,
  },
  {
    id: 'survived_first_ddos',
    title: 'Survived First DDoS',
    description: 'Weathered your first DDoS.',
    emoji: '🛡️',
    // A lezáráskor (events/[id]/resolve) az esemény eltárolja az akkori ügyfélszámot, a következő tick
    // (tick.ts markDdosSurvival) pedig beírja, hogy az ügyfélszám legfeljebb 10%-ot esett-e.
    check: (i) => i.ddos_survived === true,
  },
  {
    id: 'first_10k_mrr',
    title: 'First $10k',
    description: 'Hit $10,000 MRR.',
    emoji: '💸',
    check: (i) => i.player.mrr_usd_cents >= 1000000,
  },
  {
    id: 'era_dedicated',
    title: 'Own Iron',
    description: 'Reached the Dedicated era.',
    emoji: '🏭',
    check: (i) => i.player.current_era >= 4,
  },
  {
    id: 'one_million_lifetime',
    // A játékon belül húsvéti tojás marad; a Hubon a semleges „Hyperscaler” név fut.
    title: 'Polyák Award',
    description: 'Lifetime $1M MRR (annualized).',
    emoji: '🏆',
    check: (i) => i.player.mrr_usd_cents * 12 >= 100000000,
  },
  {
    id: 'refund_king',
    title: 'Refund King',
    description: 'Gave out $1k in refunds. (Honorary villain.)',
    emoji: '💀',
    hidden: true,
    check: (i) => i.total_refund_cents >= 100000,
  },
  {
    id: 'comeback_kid',
    title: 'Comeback Kid',
    description: 'From the brink to double the revenue.',
    emoji: '🔥',
    hidden: true,
    check: (i) => i.comeback === true,
  },
  // 2026-11-13 (végjáték, Csaba jóváhagyásával): a 3–4. korszak és a befejezés. A Hub-definíciót claude-3 tölti be;
  // addig a retry-sor (aikahub-achi.ts, 404 → újrapróbál) tartja őket.
  {
    id: 'first_cloud_region',
    title: 'Multi-AZ',
    description: 'Opened your first cloud region.',
    emoji: '🌩️',
    check: (i) => (i.cloud_regions ?? 0) >= 1,
  },
  {
    id: 'first_edge_pop',
    title: 'Closer to the Edge',
    description: 'Lit up your first edge POP.',
    emoji: '📡',
    check: (i) => (i.edge_pops ?? 0) >= 1,
  },
  {
    id: 'enterprise_contract',
    title: 'Enterprise Grade',
    description: 'Signed your first enterprise contract.',
    emoji: '🤝',
    check: (i) => i.enterprise_ever === true,
  },
  {
    id: 'hyperscaled',
    title: 'Hyperscaled',
    description: 'Reached the final goal: you are a hyperscaler.',
    emoji: '🌐',
    check: (i) => i.finished_days != null,
  },
  {
    id: 'speedrun_hyperscaler',
    title: 'Blitzscaling',
    description: `Reached the final goal within ${SPEEDRUN_DAYS} days.`,
    emoji: '⚡',
    hidden: true,
    check: (i) => i.finished_days != null && i.finished_days <= SPEEDRUN_DAYS,
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
  opts: { hub?: HubCtx } = {},
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
  // AikaHub-továbbítás (kulcs/kötés/hatókör nélkül csendben kihagyja; hibát nem dob).
  await notifyHubUnlocks(db, opts.hub, playerId, newlyUnlocked);
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
  opts: { hub?: HubCtx } = {},
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
    const isNew = (r.meta?.changes ?? 0) > 0;
    if (isNew) await notifyHubUnlocks(db, opts.hub, playerId, [achievementId]);
    return isNew;
  } catch {
    return false;
  }
}
