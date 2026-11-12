// Hyperscales — a Csapat szabályai (staff.ts) és a tick csapat-lépései (2026-11-12, csapat-kör).
import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { ECONOMY, STAFF_ROLES, LOW_CASH_WARN_CENTS } from '../economy';
import {
  type StaffMember, maxStaff, staffLevel, staffSalaryCents, staffEffects, supportShare, supportResolveSat, moraleStep,
  pickLeastUseful, generateCandidates, hireFeeCents, candidateSalaryCents, daysToNextLevel, loadStaff, STAFF_NAMES,
} from '../staff';
import { eventPoolForEra } from '../event-pool';
import { combineEffects, NO_EFFECTS } from '../upgrade-effects';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, getPlayer } from '../db';
import { tickPlayer } from '../tick';

const R = ECONOMY.staff!;
const DAY = 86400;
const NOW = 1_800_000_000;
const mk = (o: Partial<StaffMember> = {}): StaffMember => ({
  id: 1, role: 'support', name: 'Kovács Réka', trait: 'steady', level_start: 1, base_salary_cents: R.base_salary_cents.support,
  raise_pct: 0, morale: 70, hired_at: NOW, four_day: 0, ...o,
});

describe('staff rules', () => {
  it('limits: none in Era 1, 3 in Era 2, 6 from Era 3', () => {
    expect(maxStaff(R, 1)).toBe(0);
    expect(maxStaff(R, 2)).toBe(3);
    expect(maxStaff(R, 3)).toBe(6);
    expect(maxStaff(R, 4)).toBe(6);
    expect(maxStaff(null, 3)).toBe(0);
  });

  it('level grows with tenure and brings a raise; fast learners level twice as fast', () => {
    const m = mk();
    expect(staffLevel(R, m, NOW)).toBe(1);
    expect(staffLevel(R, m, NOW + 14 * DAY)).toBe(2);
    expect(staffLevel(R, m, NOW + 42 * DAY)).toBe(3);
    expect(staffLevel(R, m, NOW + 400 * DAY)).toBe(3);
    expect(staffLevel(R, mk({ trait: 'fast_learner' }), NOW + 7 * DAY)).toBe(2);
    expect(staffSalaryCents(R, m, NOW + 14 * DAY)).toBeGreaterThan(staffSalaryCents(R, m, NOW));
    expect(staffSalaryCents(R, mk({ raise_pct: 20 }), NOW)).toBe(Math.round(R.base_salary_cents.support * 1.2 / 100) * 100);
    expect(daysToNextLevel(R, m, NOW + 10 * DAY)).toBe(4);
    expect(daysToNextLevel(R, m, NOW + 50 * DAY)).toBeNull();
  });

  it('support resolves a few tickets per half day, weaker than the player and only for non-angry customers', () => {
    expect(supportShare(R, mk(), NOW)).toBe(R.support_tickets_per_day[0] / 2);
    expect(supportShare(R, mk({ role: 'sre' }), NOW)).toBe(0);
    // rossz hangulatban kevesebbet
    expect(supportShare(R, mk({ morale: 10 }), NOW)).toBeLessThan(supportShare(R, mk(), NOW));
    // +4 és lezárás: egy 50-es ügyfél 59 lesz; a te jó műszakod (~+8 és lezárás) többet adna
    expect(supportResolveSat(R, 50)).toBe(59);
    expect(supportResolveSat(R, 50)).toBeLessThan(50 + 8 + 5);
    expect(R.support_min_sat).toBe(30);
  });

  it('SRE and sales act through the existing effect keys, scaled by level and mood, within the limits', () => {
    const e = staffEffects(R, [mk({ role: 'sre' }), mk({ id: 2, role: 'sales' })], NOW);
    expect(e.ticket_pct).toBe(R.sre_ticket_pct[0]);
    expect(e.avoid_hardware).toBe(R.sre_avoid_hardware[0]);
    expect(e.acq_pct).toBe(R.sales_acq_pct[0]);
    const slump = staffEffects(R, [mk({ role: 'sre', morale: 10 })], NOW);
    expect(slump.ticket_pct!).toBeGreaterThan(R.sre_ticket_pct[0]); // kevésbé negatív
    const all = combineEffects(NO_EFFECTS, ...Array.from({ length: 10 }, () => staffEffects(R, [mk({ role: 'sre', hired_at: NOW - 100 * DAY })], NOW)));
    expect(all.ticket_pct).toBe(-60); // EFFECT_LIMITS
    expect(combineEffects(NO_EFFECTS, {})).toBe(NO_EFFECTS);
  });

  it('morale: overwork, debt and low cash hurt; otherwise it slowly recovers; steady people take it half as hard', () => {
    const ok = moraleStep(R, mk({ trait: 'fast_learner' }), { overworked: false, cash_cents: 100000 });
    expect(ok).toBe(70 + R.morale.drift);
    expect(moraleStep(R, mk({ trait: 'fast_learner', morale: 85 }), { overworked: false, cash_cents: 100000 })).toBe(85);
    const debt = moraleStep(R, mk({ trait: 'fast_learner' }), { overworked: true, cash_cents: -5000 });
    expect(debt).toBe(70 - R.morale.overwork - R.morale.debt);
    const steady = moraleStep(R, mk({ trait: 'steady' }), { overworked: true, cash_cents: -5000 });
    expect(70 - steady).toBe(Math.round((R.morale.overwork + R.morale.debt) / 2));
    expect(moraleStep(R, mk({ trait: 'frugal' }), { overworked: false, cash_cents: LOW_CASH_WARN_CENTS - 1 })).toBe(70 - R.morale.low_cash);
  });

  it('least useful goes first: sales when the fleet is full, otherwise the lowest level', () => {
    const team = [
      mk({ id: 1, role: 'support', hired_at: NOW - 50 * DAY }),
      mk({ id: 2, role: 'sales', hired_at: NOW - 50 * DAY, base_salary_cents: R.base_salary_cents.sales }),
      mk({ id: 3, role: 'sre', base_salary_cents: R.base_salary_cents.sre }),
    ];
    expect(pickLeastUseful(R, team, NOW, { fleet_full: false })).toBe(2);
    expect(pickLeastUseful(R, team, NOW, { fleet_full: true })).toBe(1);
    expect(pickLeastUseful(R, [], NOW, { fleet_full: false })).toBe(-1);
  });

  it('candidates: 3 a day, deterministic, at least two roles, valid names, no AI', () => {
    const a = generateCandidates(R, 'u-1', 100);
    expect(a).toEqual(generateCandidates(R, 'u-1', 100));
    expect(a).toHaveLength(3);
    expect(generateCandidates(R, 'u-1', 101)).not.toEqual(a);
    for (let d = 0; d < 60; d++) {
      const c = generateCandidates(R, 'u-x', d);
      expect(new Set(c.map((x) => x.role)).size).toBeGreaterThanOrEqual(2);
      expect(new Set(c.map((x) => x.name)).size).toBe(3);
      for (const x of c) {
        expect(STAFF_ROLES).toContain(x.role);
        expect(STAFF_NAMES).toContain(x.name);
        expect(x.key).toMatch(new RegExp(`^${d}\\.[0-2]$`));
        expect(Math.abs(hireFeeCents(R, x) - candidateSalaryCents(R, x) * R.hire_fee_months)).toBeLessThanOrEqual(100); // fél havi bér
      }
    }
  });

  it('staff_drama only comes when there is staff (live rules); the old pool is unchanged for old callers', () => {
    expect(eventPoolForEra(2, { has_staff: false })).not.toContain('staff_drama');
    expect(eventPoolForEra(2, { has_staff: true })).toContain('staff_drama');
    expect(eventPoolForEra(2)).toContain('staff_drama');
    expect(eventPoolForEra(1, { has_staff: true })).not.toContain('staff_drama');
  });
});

describe('staff in the tick', { timeout: 30_000 }, () => {
  async function setup(uid: string, opts: { era?: number; cash?: number } = {}): Promise<D1Database> {
    const d = await createTestDb();
    await createPlayer(d, { user_id: uid, company_name: 'Team', city: null });
    await d.prepare('UPDATE players SET current_era = ?, cash_usd_cents = ?, mrr_usd_cents = 0, marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0, last_ticked_at = ? WHERE user_id = ?')
      .bind(opts.era ?? 2, opts.cash ?? 100000, NOW - 43200, uid).run();
    await d.prepare("INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at) VALUES (?, 1, 'lamp_box', 15, 0, 0, 0)").bind(uid).run();
    return d;
  }
  const addStaff = (d: D1Database, uid: string, o: { role: string; morale?: number; hired_at?: number; salary?: number }) =>
    d.prepare('INSERT INTO staff (player_id, role, name, trait, level_start, base_salary_cents, raise_pct, morale, four_day, hired_at) VALUES (?, ?, ?, ?, 1, ?, 0, ?, 0, ?)')
      .bind(uid, o.role, 'Teszt ' + o.role, 'fast_learner', o.salary ?? 7500, o.morale ?? 70, o.hired_at ?? NOW - DAY).run();

  it('pays salaries with the other monthly costs, time-proportionally', async () => {
    const d = await setup('u-sal');
    await addStaff(d, 'u-sal', { role: 'sre', salary: 864000 }); // nagy bér, hogy egy tickben is látsszon
    const p = (await getPlayer(d, 'u-sal'))!;
    const r = await tickPlayer(d, p, NOW);
    expect(r.salaries_cents!).toBeGreaterThan(0);
    const cash = (await d.prepare('SELECT cash_usd_cents AS c FROM players WHERE user_id = ?').bind('u-sal').first<{ c: number }>())!.c;
    expect(cash).toBe(100000 - r.salaries_cents! - (r.server_fees_cents ?? 0) - (r.network_fees_cents ?? 0) + r.money_added_cents);
  });

  it('support resolves the oldest open tickets of non-angry customers at the half-day turn', async () => {
    const d = await setup('u-sup');
    await addStaff(d, 'u-sup', { role: 'support' });
    for (const [sat, age] of [[60, 30], [55, 20], [10, 40], [50, 10]] as const) {
      const c = await d.prepare("INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES (?, 'C', 'pro', 'hobby', 0, ?) RETURNING id")
        .bind('u-sup', sat).first<{ id: number }>();
      await d.prepare("INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) VALUES (?, ?, 's', 'f', 'open', ?)")
        .bind(c!.id, 'u-sup', NOW - age * 3600).run();
    }
    const p = (await getPlayer(d, 'u-sup'))!;
    const r = await tickPlayer(d, p, NOW);
    expect(r.staff_resolved).toBe(R.support_tickets_per_day[0] / 2); // 2
    const left = (await d.prepare("SELECT c.satisfaction AS s FROM tickets t JOIN customers c ON c.id = t.customer_id WHERE t.player_id = ? AND t.status = 'open' ORDER BY c.satisfaction").bind('u-sup').all<{ s: number }>()).results!.map((x) => x.s);
    // a morcos (10) marad neked, és a legfrissebb (50) is vár
    expect(left).toEqual([10, 50]);
    const ev = await d.prepare("SELECT data_json FROM events WHERE player_id = ? AND event_type = 'staff_work'").bind('u-sup').first<{ data_json: string }>();
    expect(JSON.parse(ev!.data_json).count).toBe(2);
  });

  it('a very unhappy person quits; a low-mood one raises a staff drama about themselves', async () => {
    const d = await setup('u-mood', { cash: -5000 });
    await addStaff(d, 'u-mood', { role: 'sre', morale: 22 });
    await addStaff(d, 'u-mood', { role: 'sales', morale: 40 });
    const p = (await getPlayer(d, 'u-mood'))!;
    const r = await tickPlayer(d, p, NOW);
    expect(r.staff_quit).toBe(1);
    const left = (await d.prepare('SELECT role, morale FROM staff WHERE player_id = ?').bind('u-mood').all<{ role: string; morale: number }>()).results!;
    expect(left.map((x) => x.role)).toEqual(['sales']);
    expect(left[0].morale).toBeLessThan(R.morale.drama_below);
    const drama = await d.prepare("SELECT data_json, resolved_at FROM events WHERE player_id = ? AND event_type = 'staff_drama'").bind('u-mood').first<{ data_json: string; resolved_at: number | null }>();
    expect(drama?.resolved_at).toBeNull();
    expect(JSON.parse(drama!.data_json).role).toBe('sales');
    expect(await d.prepare("SELECT 1 FROM events WHERE player_id = ? AND event_type = 'staff_quit'").bind('u-mood').first()).toBeTruthy();
  });

  it('at the debt limit the least useful person goes first, before any machine', async () => {
    const d = await setup('u-debt', { cash: -ECONOMY.debt_limit_cents });
    await d.prepare("INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at) VALUES (?, 1, 'lamp_box', 15, 0, 3000, 1)").bind('u-debt').run();
    await addStaff(d, 'u-debt', { role: 'support', hired_at: NOW - 50 * DAY });
    await addStaff(d, 'u-debt', { role: 'sales' });
    const p = (await getPlayer(d, 'u-debt'))!;
    const r = await tickPlayer(d, p, NOW + 600);
    expect(r.staff_cut).toBe(1);
    expect(r.servers_auto_sold).toBe(0);
    expect((await d.prepare('SELECT COUNT(*) AS n FROM servers WHERE player_id = ?').bind('u-debt').first<{ n: number }>())!.n).toBe(2);
    const ev = await d.prepare("SELECT data_json FROM events WHERE player_id = ? AND event_type = 'staff_cut_debt'").bind('u-debt').first<{ data_json: string }>();
    expect(JSON.parse(ev!.data_json).role).toBe('sales'); // az 1. szintű értékesítő a legkevésbé hasznos
  });

  it('before the migration (no staff / player_network table) the tick still runs: empty team, base network', async () => {
    const d = await setup('u-old');
    await d.prepare('DROP TABLE staff').run();
    await d.prepare('DROP TABLE player_network').run();
    expect(await loadStaff(d, 'u-old')).toEqual([]);
    const p = (await getPlayer(d, 'u-old'))!;
    const r = await tickPlayer(d, p, NOW);
    expect(r.salaries_cents ?? 0).toBe(0);
    expect(r.network_fees_cents ?? 0).toBe(0);
  });
});
