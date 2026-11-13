// Hyperscales — végjáték (2026-11-13): végcél, befejezés, nagyvállalati szerződés, 3–4. korszak gépei, új achievementek.

import { describe, it, expect, beforeEach } from 'vitest';
import { GOAL, goalProgress, maybeCompleteGame, loadCompletion, recordMrrPeak, loadMrrPeak } from '../endgame';
import { bigClientFeeCents, enterpriseEligible, isDedicatedCustomer, ENTERPRISE_TIER } from '../dedicated';
import { ECONOMY } from '../economy';
import { meetsServerRequirements, edgeUnits, EDGE_POP_BANDWIDTH_UNITS, SERVER_SPECS } from '../server-types';
import { bandwidthUnits } from '../network';
import { ACHIEVEMENTS, checkAndUnlockAchievements } from '../achievements';
import { computeAchievementInput } from '../achievements-helper';
import { fastestFinishers, LEADERBOARD_SQL } from '../leaderboard';
import { restartCompany } from '../restart';
import { createPlayer, type D1Like } from '../db';
import { createTestDb } from '../../../../test-utils/d1-mock';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { ACHIEVEMENT_TRANSLATIONS } from '../../play/achievements-i18n';
import { renderFinaleContent, type FinaleStats } from '../../play/finale-page';
import { PLAY_STRINGS } from '../../play/strings';

const full = { era: 4, goal_mrr_cents: GOAL.min_mrr_cents, reputation: GOAL.min_reputation, cloud_regions: GOAL.min_cloud_regions, edge_pops: GOAL.min_edge_pops, enterprise_clients: 1 };

describe('goalProgress', () => {
  it('all six requirements met → met', () => {
    const g = goalProgress(full);
    expect(g.total).toBe(6);
    expect(g.met).toBe(true);
    expect(g.reqs.every((r) => r.pct === 100)).toBe(true);
  });
  it('any one missing → not met (each requirement really counts)', () => {
    const misses: Array<Partial<typeof full>> = [
      { era: 3 }, { goal_mrr_cents: GOAL.min_mrr_cents - 1 }, { reputation: GOAL.min_reputation - 1 },
      { cloud_regions: GOAL.min_cloud_regions - 1 }, { edge_pops: GOAL.min_edge_pops - 1 }, { enterprise_clients: 0 },
    ];
    for (const m of misses) {
      const g = goalProgress({ ...full, ...m });
      expect(g.met, JSON.stringify(m)).toBe(false);
      expect(g.met_count).toBe(5);
    }
  });
});

describe('big clients: enterprise', () => {
  it('enterprise is a big client with its own (bigger) fee band, deterministic by id', () => {
    expect(isDedicatedCustomer(ENTERPRISE_TIER)).toBe(true);
    const E = ECONOMY.enterprise!;
    for (let id = 1; id < 40; id++) {
      const f = bigClientFeeCents(ECONOMY, id, ENTERPRISE_TIER);
      expect(f).toBeGreaterThanOrEqual(E.fee_min_cents);
      expect(f).toBeLessThanOrEqual(E.fee_max_cents);
      expect(f).toBe(bigClientFeeCents(ECONOMY, id, ENTERPRISE_TIER));
      expect(bigClientFeeCents(ECONOMY, id, 'dedicated')).toBeLessThanOrEqual(ECONOMY.dedicated!.fee_max_cents);
    }
  });
  it('eligible only in Era 4 with a global footprint and enough reputation', () => {
    const E = ECONOMY.enterprise!;
    const ok = { era: 4, reputation: E.min_reputation, cloud_regions: E.min_cloud_regions, edge_pops: E.min_edge_pops };
    expect(enterpriseEligible(E, ok)).toBe(true);
    expect(enterpriseEligible(E, { ...ok, era: 3 })).toBe(false);
    expect(enterpriseEligible(E, { ...ok, reputation: E.min_reputation - 1 })).toBe(false);
    expect(enterpriseEligible(E, { ...ok, edge_pops: E.min_edge_pops - 1 })).toBe(false);
    expect(enterpriseEligible(null, ok)).toBe(false);
  });
});

describe('Era 3-4 machines', () => {
  it('a cloud region needs at least 1 Gbit transit; other machines do not', () => {
    expect(meetsServerRequirements('cloud_region', 1)).toBe(false);
    expect(meetsServerRequirements('cloud_region', 2)).toBe(true);
    expect(meetsServerRequirements('edge_pop', 0)).toBe(true);
    expect(meetsServerRequirements('lamp_box', 0)).toBe(true);
  });
  it('edge POPs add bandwidth on top of the transit plan; 10 Gbit exists from Era 3', () => {
    const NR = ECONOMY.network!;
    expect(edgeUnits([{ type: 'edge_pop' }, { type: 'lamp_box' }, { type: 'edge_pop' }])).toBe(2 * EDGE_POP_BANDWIDTH_UNITS);
    const base = bandwidthUnits(NR, { transit_tier: 2, peering: 0, ddos: 0 });
    expect(bandwidthUnits(NR, { transit_tier: 2, peering: 0, ddos: 0, edge_units: 500 })).toBe(base + 500);
    expect(NR.tiers[3].min_era).toBe(3);
    expect(NR.tiers[3].bandwidth_units).toBeGreaterThan(NR.tiers[2].bandwidth_units);
    expect(SERVER_SPECS.cloud_region.capacity).toBeGreaterThan(SERVER_SPECS.vps_node.capacity);
  });
});

describe('completion in the DB', () => {
  let db: D1Database;
  const uid = 'eg1';
  beforeEach(async () => {
    db = await createTestDb();
    await createPlayer(db as unknown as D1Like, { user_id: uid, company_name: 'Endgame Inc', city: null });
  });
  const setup = async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare('UPDATE players SET current_era = 4, reputation = 95, founded_at = ? WHERE user_id = ?').bind(now - 150 * 86400, uid).run();
    for (const t of ['cloud_region', 'cloud_region', 'edge_pop', 'edge_pop', 'edge_pop', 'dedicated_box']) {
      await db.prepare('INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at) VALUES (?, 4, ?, 1, 0, 100, ?)').bind(uid, t, now).run();
    }
    await db.prepare("INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES (?, 'Polaris Retail Holdings', 'pro', 'enterprise', ?, 70)").bind(uid, now).run();
    await db.prepare("INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) VALUES (?, 'dedicated_signed', ?, ?, 'positive', ?)")
      .bind(uid, JSON.stringify({ customer_name: 'Polaris Retail Holdings', fee_cents: 150000, enterprise: true }), now, now).run();
    return now;
  };

  it('records the completion exactly once, with the day count', async () => {
    const now = await setup();
    const p = { user_id: uid, founded_at: now - 150 * 86400, current_era: 4, reputation: 95, mrr_usd_cents: 2000000 };
    expect(await maybeCompleteGame(db, p, GOAL.min_mrr_cents - 1, now)).toBe(false);
    expect(await loadCompletion(db, uid)).toBeNull();
    expect(await maybeCompleteGame(db, p, GOAL.min_mrr_cents, now)).toBe(true);
    expect(await maybeCompleteGame(db, p, GOAL.min_mrr_cents, now + 300)).toBe(false);
    const c = await loadCompletion(db, uid);
    expect(c?.days).toBe(150);
    const n = await db.prepare("SELECT COUNT(*) AS n FROM events WHERE player_id = ? AND event_type = 'game_completed'").bind(uid).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('unlocks the endgame achievements (and the hidden speedrun only when fast enough)', async () => {
    const now = await setup();
    await maybeCompleteGame(db, { user_id: uid, founded_at: now - 150 * 86400, current_era: 4, reputation: 95, mrr_usd_cents: 2000000 }, GOAL.min_mrr_cents, now);
    const i = (await computeAchievementInput(db, uid))!;
    expect(i.cloud_regions).toBe(2);
    expect(i.edge_pops).toBe(3);
    expect(i.enterprise_ever).toBe(true);
    expect(i.finished_days).toBe(150);
    const got = await checkAndUnlockAchievements(db, uid, i);
    for (const id of ['first_cloud_region', 'first_edge_pop', 'enterprise_contract', 'hyperscaled']) expect(got).toContain(id);
    expect(got).not.toContain('speedrun_hyperscaler');
    const fast = ACHIEVEMENTS.find((a) => a.id === 'speedrun_hyperscaler')!;
    expect(fast.check({ ...i, finished_days: 100 })).toBe(true);
  });

  it('the peak MRR only goes up; restart clears it and the completion', async () => {
    const now = await setup();
    await recordMrrPeak(db, uid, 5000, now);
    await recordMrrPeak(db, uid, 3000, now);
    expect(await loadMrrPeak(db, uid)).toBe(5000);
    await recordMrrPeak(db, uid, 9000, now);
    expect(await loadMrrPeak(db, uid)).toBe(9000);
    await maybeCompleteGame(db, { user_id: uid, founded_at: now - 150 * 86400, current_era: 4, reputation: 95, mrr_usd_cents: 2000000 }, GOAL.min_mrr_cents, now);
    await restartCompany(db as unknown as D1Like, uid);
    expect(await loadMrrPeak(db, uid)).toBe(0);
    expect(await loadCompletion(db, uid)).toBeNull();
  });

  it('the leaderboard query carries the finish day', async () => {
    const now = await setup();
    await maybeCompleteGame(db, { user_id: uid, founded_at: now - 150 * 86400, current_era: 4, reputation: 95, mrr_usd_cents: 2000000 }, GOAL.min_mrr_cents, now);
    await createPlayer(db as unknown as D1Like, { user_id: 'eg2', company_name: 'Not Yet', city: null });
    const rows = (await db.prepare(LEADERBOARD_SQL).all<{ user_id: string; finished_days: number | null }>()).results ?? [];
    expect(rows.find((r) => r.user_id === uid)?.finished_days).toBe(150);
    expect(rows.find((r) => r.user_id === 'eg2')?.finished_days ?? null).toBeNull();
    const fast = fastestFinishers(rows.map((r) => ({ ...r, company_name: '', mrr_usd_cents: 0, cash_usd_cents: 0, reputation: 0, current_era: 1, founded_at: 0 })));
    expect(fast.map((r) => r.user_id)).toEqual([uid]);
  });
});

describe('texts', () => {
  it('the five new achievements have HU and DE texts', () => {
    for (const id of ['first_cloud_region', 'first_edge_pop', 'enterprise_contract', 'hyperscaled', 'speedrun_hyperscaler']) {
      expect(ACHIEVEMENTS.find((a) => a.id === id), id).toBeDefined();
      for (const l of ['hu', 'de'] as const) expect(ACHIEVEMENT_TRANSLATIONS[l][id]?.[0], `${l}:${id}`).toBeTruthy();
    }
  });
  it('no "Phase 2" / "later update" placeholder is left for the Era 3-4 machines', () => {
    for (const l of ['en', 'hu', 'de'] as const) {
      const t = PLAY_STRINGS[l];
      expect(t['dash.era.f3'] + t['dash.era.f4']).not.toMatch(/Phase 2|fázis/);
    }
    expect(SERVER_SPECS.cloud_region.display_name).not.toMatch(/Phase/);
  });
  it('the finale renders the story and the credits once finished, and the goal before', () => {
    const shell = {
      locale: 'hu', company: 'Endgame Inc', era: 4,
      goal: goalProgress(full), completed: { at: 1, days: 150, mrr_cents: 2000000 },
    } as unknown as Parameters<typeof renderFinaleContent>[0];
    const st: FinaleStats = {
      founded_at: 0, completed_at: 150 * 86400, days: 150, peak_mrr_cents: 2100000, mrr_cents: 2000000, customers_total: 1500,
      customers_active: 1000, shifts: 140, tickets_resolved: 3000, staff: 7, servers: 20, cloud_regions: 2, edge_pops: 3, achievements: 20, achievements_total: 23,
    };
    const html = renderFinaleContent(shell, st, 'https://hyperscales.app/u/x');
    expect(html).toContain('Hyperscaler lettél!');
    expect(html).toContain('$21,000');
    expect(html).toContain('Aika');
    expect(html).toContain('/play/settings#restart');
    const pre = renderFinaleContent({ ...shell, completed: null } as never, { ...st, days: null }, '');
    expect(pre).not.toContain('Hyperscaler lettél!');
    expect(pre).toContain('era-req');
  });
});
