// Hyperscales — a kifutás (runway) EGY függvényben (src/lib/game/runway.ts), a tick szabályait követve.
import { describe, it, expect } from 'vitest';
import { dailyCashFlow, TICKS_PER_DAY } from '../runway';
import { PPC_FULL_COST_PER_TICK_CENTS } from '../tick';
import { ECONOMY, LEGACY_RULES } from '../economy';

describe('dailyCashFlow', () => {
  it('income = MRR/30, cost = PPC per tick × ticks per day', () => {
    const f = dailyCashFlow({ cash_usd_cents: 100000, mrr_usd_cents: 1500, marketing_ppc_pct: 33 });
    expect(TICKS_PER_DAY).toBe(288);
    expect(f.income_per_day_cents).toBe(50);
    expect(f.cost_per_day_cents).toBe(Math.round(PPC_FULL_COST_PER_TICK_CENTS * 0.33) * 288);
    expect(f.net_per_day_cents).toBe(f.income_per_day_cents - f.cost_per_day_cents);
    expect(f.ppc_throttled).toBe(false);
  });
  it('runway = (cash − reserve) / net burn, floored', () => {
    const f = dailyCashFlow({ cash_usd_cents: 100000, mrr_usd_cents: 1500, marketing_ppc_pct: 33 });
    const reserve = ECONOMY.ppc_budget!.reserve_cents;
    expect(f.runway_days).toBe(Math.floor((100000 - reserve) / (f.cost_per_day_cents - 50)));
  });
  it('no burn (no PPC) → runway null (money does not run out)', () => {
    const f = dailyCashFlow({ cash_usd_cents: 500, mrr_usd_cents: 1500, marketing_ppc_pct: 0 });
    expect(f.cost_per_day_cents).toBe(0);
    expect(f.runway_days).toBeNull();
  });
  it('broke → the ad budget drops to zero, money stops burning (no negative spiral)', () => {
    const f = dailyCashFlow({ cash_usd_cents: -100, mrr_usd_cents: 0, marketing_ppc_pct: 100 });
    expect(f.cost_per_day_cents).toBe(0);
    expect(f.runway_days).toBeNull();
    expect(f.ppc_throttled).toBe(true);
  });
  it('at the reserve the ads spend at most half of the income → not burning', () => {
    const f = dailyCashFlow({ cash_usd_cents: ECONOMY.ppc_budget!.reserve_cents, mrr_usd_cents: 30000, marketing_ppc_pct: 100 });
    expect(f.cost_per_day_cents).toBeLessThanOrEqual(f.income_per_day_cents / 2);
    expect(f.runway_days).toBeNull();
  });
  it('clamps silly PPC percentages', () => {
    expect(dailyCashFlow({ cash_usd_cents: 10_000_000, mrr_usd_cents: 0, marketing_ppc_pct: 250 }).cost_per_day_cents)
      .toBe(PPC_FULL_COST_PER_TICK_CENTS * 288);
  });
  it('legacy rules (for the simulator): full PPC cost, runway to zero', () => {
    const f = dailyCashFlow({ cash_usd_cents: 100000, mrr_usd_cents: 1500, marketing_ppc_pct: 33 }, LEGACY_RULES);
    expect(f.cost_per_day_cents).toBe(33 * 288);
    expect(f.runway_days).toBe(Math.floor(100000 / (33 * 288 - 50)));
  });
});

import { assignLoad } from '../capacity';
describe('assignLoad (customers spread over servers)', () => {
  it('fills servers in order up to capacity and reports overflow', () => {
    const r = assignLoad([{ id: 1, capacity: 2 }, { id: 2, capacity: 3 }], 4);
    expect(r.servers.map((s) => s.load)).toEqual([2, 2]);
    expect(r.servers.map((s) => s.util)).toEqual([100, 67]);
    expect(r.overflow).toBe(0);
    expect(assignLoad([{ id: 1, capacity: 2 }], 5).overflow).toBe(3);
  });
});
