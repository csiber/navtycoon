// Hyperscales — a 2026-11-12-i (AikaHub) achievementek feltételei: three_star_shift, perfect_week, era_*, survived_first_ddos
// (tick-ítélet), comeback_kid (mélypont az audit_log-ban), rejtettek, HU/DE szövegek.

import { describe, it, expect, beforeEach } from 'vitest';
import { ACHIEVEMENTS, checkAndUnlockAchievements, type AchievementCheckInput } from '../achievements';
import {
  computeAchievementInput, longestDayStreak, comebackReached, starsFromShiftEnd, CASH_LOW_POINT_ACTION,
} from '../achievements-helper';
import { recordCashLowPoint, markDdosSurvival, tickAchievements, lowCashThresholdCents } from '../achievement-tick';
import { createPlayer } from '../db';
import type { D1Like } from '../db';
import type { Player } from '../types';
import { createTestDb } from '../../../../test-utils/d1-mock';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { ACHIEVEMENT_TRANSLATIONS, achievementCell, HIDDEN_TITLE } from '../../play/achievements-i18n';

const HUB_LIST = [
  'first_shift', 'first_blood', 'three_star_shift', 'ten_customers', 'shift_marathon', 'ticket_whisperer', 'era_colo',
  'first_k_mrr', 'perfect_week', 'high_rep', 'era_vps', 'hundred_customers', 'survived_first_ddos', 'first_10k_mrr',
  'era_dedicated', 'one_million_lifetime', 'refund_king', 'comeback_kid',
];

function base(p: Player, extra: Partial<AchievementCheckInput> = {}): AchievementCheckInput {
  return { player: p, customer_count: 0, ticket_count: 0, resolved_ticket_count: 0, total_refund_cents: 0, shift_count: 0, ...extra };
}
const check = (id: string, i: AchievementCheckInput) => ACHIEVEMENTS.find((a) => a.id === id)!.check(i);

describe('catalog = hyperscales.md (18)', () => {
  it('same ids in the Hub order', () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual(HUB_LIST);
  });
  it('hidden: only refund_king and comeback_kid', () => {
    expect(ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id).sort()).toEqual(['comeback_kid', 'refund_king']);
  });
  it('every achievement has HU and DE title + description', () => {
    for (const l of ['hu', 'de'] as const) {
      for (const id of HUB_LIST) {
        const t = ACHIEVEMENT_TRANSLATIONS[l][id];
        expect(t, `${l}:${id}`).toBeTruthy();
        expect(t[0].length).toBeGreaterThan(0);
        expect(t[1].length).toBeGreaterThan(0);
      }
    }
  });
  it('hidden + locked shows ??? (no name), unlocked shows the name', () => {
    for (const l of ['en', 'hu', 'de'] as const) {
      const locked = achievementCell(l, 'comeback_kid', false);
      expect(locked.title).toBe(HIDDEN_TITLE);
      expect(locked.desc).not.toMatch(/Comeback|Feltámadás/);
      expect(achievementCell(l, 'comeback_kid', true).title).not.toBe(HIDDEN_TITLE);
      expect(achievementCell(l, 'first_shift', false).title).not.toBe(HIDDEN_TITLE);
    }
  });
});

describe('pure helpers', () => {
  it('longestDayStreak', () => {
    expect(longestDayStreak([])).toBe(0);
    expect(longestDayStreak([5])).toBe(1);
    expect(longestDayStreak([1, 2, 3, 4, 5, 6, 7])).toBe(7);
    expect(longestDayStreak([7, 1, 3, 2, 2, 5, 6, 4])).toBe(7);
    expect(longestDayStreak([1, 2, 3, 5, 6, 7, 8, 9, 10])).toBe(6);
  });
  it('comebackReached: 2× the low-point MRR (at least 2× $10)', () => {
    expect(comebackReached(null, 1_000_000)).toBe(false);
    expect(comebackReached(5000, 9999)).toBe(false);
    expect(comebackReached(5000, 10000)).toBe(true);
    expect(comebackReached(0, 1999)).toBe(false);
    expect(comebackReached(0, 2000)).toBe(true);
  });
  it('starsFromShiftEnd uses shift-score (≥ 88 → 3 stars)', () => {
    expect(starsFromShiftEnd(JSON.stringify({ resolved: 5, total: 5, satisfaction_total: 150, refunds_cents: 0 }))).toBe(3);
    // „mindent lezárok” (+5/ticket) = 85 pont → 2 csillag
    expect(starsFromShiftEnd(JSON.stringify({ resolved: 5, total: 5, satisfaction_total: 25, refunds_cents: 0 }))).toBe(2);
    expect(starsFromShiftEnd('nem json')).toBe(0);
    expect(starsFromShiftEnd(null)).toBe(0);
  });
});

describe('check() of the new achievements', () => {
  let db: D1Database;
  let p: Player;
  beforeEach(async () => {
    db = await createTestDb();
    p = await createPlayer(db as unknown as D1Like, { user_id: 'c1', company_name: 'X', city: null });
  });
  it('eras: colo ≥ 2, vps ≥ 3, dedicated ≥ 4', () => {
    for (const [era, colo, vps, ded] of [[1, false, false, false], [2, true, false, false], [3, true, true, false], [4, true, true, true]] as const) {
      const i = base({ ...p, current_era: era as Player['current_era'] });
      expect([check('era_colo', i), check('era_vps', i), check('era_dedicated', i)]).toEqual([colo, vps, ded]);
    }
  });
  it('three_star_shift / perfect_week / ddos / comeback flags', () => {
    expect(check('three_star_shift', base(p, { best_shift_stars: 2 }))).toBe(false);
    expect(check('three_star_shift', base(p, { best_shift_stars: 3 }))).toBe(true);
    expect(check('perfect_week', base(p, { shift_streak_days: 6 }))).toBe(false);
    expect(check('perfect_week', base(p, { shift_streak_days: 7 }))).toBe(true);
    expect(check('survived_first_ddos', base(p))).toBe(false);
    expect(check('survived_first_ddos', base(p, { ddos_survived: true }))).toBe(true);
    expect(check('comeback_kid', base(p))).toBe(false);
    expect(check('comeback_kid', base(p, { comeback: true }))).toBe(true);
  });
});

describe('computeAchievementInput from the DB', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = await createTestDb();
    await createPlayer(db as unknown as D1Like, { user_id: 'd1', company_name: 'X', city: null });
  });

  it('best_shift_stars from shift_end events', async () => {
    const ins = (d: object) => db.prepare("INSERT INTO events (player_id, event_type, data_json, spawned_at, resolved_at) VALUES ('d1', 'shift_end', ?, 1, 1)").bind(JSON.stringify(d)).run();
    await ins({ resolved: 3, total: 5, satisfaction_total: 0, refunds_cents: 0 });
    expect((await computeAchievementInput(db, 'd1'))!.best_shift_stars).toBe(1);
    await ins({ resolved: 5, total: 5, satisfaction_total: 150, refunds_cents: 0 });
    const i = (await computeAchievementInput(db, 'd1'))!;
    expect(i.best_shift_stars).toBe(3);
    expect(await checkAndUnlockAchievements(db, 'd1', i)).toContain('three_star_shift');
  });

  it('perfect_week: 7 consecutive UTC days with a completed shift (expired/other days do not count)', async () => {
    const day0 = 20000;
    const shift = (day: number, outcome = 'completed') => db.prepare(
      'INSERT INTO shift_history (player_id, started_at, ended_at, tickets_handled, outcome) VALUES (?, ?, ?, 1, ?)',
    ).bind('d1', day * 86400 + 3600, day * 86400 + 4000, outcome).run();
    for (let d = 0; d < 6; d++) await shift(day0 + d);
    await shift(day0 + 6, 'expired');
    await shift(day0 + 2); // ugyanazon a napon kétszer
    expect((await computeAchievementInput(db, 'd1'))!.shift_streak_days).toBe(6);
    await shift(day0 + 6);
    const i = (await computeAchievementInput(db, 'd1'))!;
    expect(i.shift_streak_days).toBe(7);
    expect(await checkAndUnlockAchievements(db, 'd1', i)).toContain('perfect_week');
  });
});

describe('survived_first_ddos (resolve → next tick)', () => {
  let db: D1Database;
  const addCustomers = async (n: number) => {
    for (let k = 0; k < n; k++) {
      await db.prepare("INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at) VALUES ('dd', ?, 'karen', 'hobby', 1)").bind(`c${k}`).run();
    }
  };
  const ddos = (data: object | null, resolved: number | null, spawned = 100) => db.prepare(
    "INSERT INTO events (player_id, event_type, data_json, spawned_at, resolved_at) VALUES ('dd', 'ddos_attempt', ?, ?, ?)",
  ).bind(data ? JSON.stringify(data) : null, spawned, resolved).run();
  beforeEach(async () => {
    db = await createTestDb();
    await createPlayer(db as unknown as D1Like, { user_id: 'dd', company_name: 'X', city: null });
  });

  it('≤ 10% drop → survived, unlocked by the tick step', async () => {
    await addCustomers(9);
    await ddos({ customers_at_resolve: 10 }, 200);
    expect(await markDdosSurvival(db, 'dd')).toBe(true);
    expect(await markDdosSurvival(db, 'dd')).toBeNull(); // egyszer dönt
    const r = await tickAchievements(db, 'dd', 300);
    expect(r).toContain('survived_first_ddos');
  });

  it('> 10% drop → not survived, and a later DDoS does not count (only the first)', async () => {
    await addCustomers(8);
    await ddos({ customers_at_resolve: 10 }, 200, 100);
    await ddos({ customers_at_resolve: 8, ddos_survived: true }, 900, 800);
    expect(await markDdosSurvival(db, 'dd')).toBe(false);
    expect((await computeAchievementInput(db, 'dd'))!.ddos_survived).toBe(false);
    expect(await tickAchievements(db, 'dd', 1000)).not.toContain('survived_first_ddos');
  });

  it('unresolved first DDoS → nothing to decide', async () => {
    await ddos(null, null);
    expect(await markDdosSurvival(db, 'dd')).toBeNull();
  });
});

describe('comeback_kid (low point in audit_log, no migration)', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = await createTestDb();
    await createPlayer(db as unknown as D1Like, { user_id: 'cb', company_name: 'X', city: null });
  });
  const player = async () => (await db.prepare("SELECT * FROM players WHERE user_id = 'cb'").first<Player>())!;

  it('records the low point at most once a day, only below the low-cash threshold', async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE players SET cash_usd_cents = 5000, mrr_usd_cents = 3000, marketing_ppc_pct = 0 WHERE user_id = 'cb'").run();
    const p = await player();
    expect(p.cash_usd_cents).toBeLessThan(lowCashThresholdCents(p));
    expect(await recordCashLowPoint(db, p, now)).toBe(true);
    expect(await recordCashLowPoint(db, p, now + 3600)).toBe(false);
    expect(await recordCashLowPoint(db, p, now + 86400 + 1)).toBe(true);
    await db.prepare("UPDATE players SET cash_usd_cents = 1000000 WHERE user_id = 'cb'").run();
    expect(await recordCashLowPoint(db, await player(), now + 3 * 86400)).toBe(false);
  });

  it('unlocks when MRR doubles within 30 days of the low point; hidden until then', async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE players SET cash_usd_cents = 5000, mrr_usd_cents = 3000 WHERE user_id = 'cb'").run();
    await recordCashLowPoint(db, await player(), now);
    expect(await tickAchievements(db, 'cb', now)).not.toContain('comeback_kid');
    await db.prepare("UPDATE players SET cash_usd_cents = 900000, mrr_usd_cents = 6000 WHERE user_id = 'cb'").run();
    expect(await tickAchievements(db, 'cb', now + 600)).toContain('comeback_kid');
  });

  it('a low point older than 30 days does not count', async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare('INSERT INTO audit_log (player_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?)')
      .bind('cb', CASH_LOW_POINT_ACTION, JSON.stringify({ mrr_cents: 1000 }), now - 31 * 86400).run();
    await db.prepare("UPDATE players SET mrr_usd_cents = 100000 WHERE user_id = 'cb'").run();
    expect((await computeAchievementInput(db, 'cb'))!.comeback).toBe(false);
  });
});
