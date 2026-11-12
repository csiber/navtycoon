// Hyperscales — a gazdaság regressziós tesztje a determinisztikus szimulátorral (economy-sim.ts).
// A szimulátor a valódi tick képleteit (economy.ts) használja; több seeden fut, hogy ne egy szerencsés dobás döntsön.
import { describe, it, expect } from 'vitest';
import { simulate, type ProfileId, type SimResult } from '../economy-sim';
import { ECONOMY, LEGACY_RULES } from '../economy';

const SEEDS = [1, 2, 3, 4, 5];
const run = (rules: typeof ECONOMY, profile: ProfileId, days = 60): SimResult[] =>
  SEEDS.map((seed) => simulate(rules, profile, { days, seed }));
const at = (r: SimResult, day: number) => r.days.find((d) => d.day === day)!;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('economy simulator', () => {
  it('is deterministic: the same seed gives the same curve', () => {
    expect(simulate(ECONOMY, 'casual', { days: 20, seed: 7 })).toEqual(simulate(ECONOMY, 'casual', { days: 20, seed: 7 }));
  });

  it('reproduces the old death spiral (legacy rules): idle is broke by day ~10, the players who act go negative', () => {
    for (const r of run(LEGACY_RULES, 'idle', 30)) {
      expect(r.broke_day).not.toBeNull();
      expect(r.broke_day!).toBeLessThanOrEqual(12);
      expect(at(r, 30).cash_cents).toBeLessThan(100); // csak az MRR-csordogálás centjei
    }
    for (const r of [...run(LEGACY_RULES, 'casual', 30), ...run(LEGACY_RULES, 'active', 30)]) {
      expect(r.min_cash_cents).toBeLessThan(0);
    }
  });
});

describe('balance v2 (live rules)', () => {
  it('60 days idle: money never goes below the ad reserve, and the 3 core customers keep paying', () => {
    for (const r of run(ECONOMY, 'idle')) {
      expect(r.min_cash_cents).toBeGreaterThanOrEqual(ECONOMY.ppc_budget!.reserve_cents - 100);
      expect(r.broke_day).toBeNull();
      for (const d of r.days) expect(d.customers).toBeGreaterThanOrEqual(ECONOMY.churn_floor_customers);
      expect(at(r, 60).mrr_cents).toBeGreaterThanOrEqual(1500);
      expect(at(r, 60).era).toBe(1); // tétlenül nem jár korszak-lépés
    }
  });

  it('no profile ever goes negative or broke', () => {
    for (const profile of ['idle', 'casual', 'active'] as const) {
      for (const r of run(ECONOMY, profile)) {
        expect(r.min_cash_cents).toBeGreaterThanOrEqual(0);
        expect(r.broke_day).toBeNull();
      }
    }
  });

  it('casual player grows slowly but surely: MRR keeps rising and ends well above the start', () => {
    for (const r of run(ECONOMY, 'casual')) {
      expect(at(r, 14).mrr_cents).toBeGreaterThan(at(r, 3).mrr_cents);
      expect(at(r, 60).mrr_cents).toBeGreaterThan(at(r, 14).mrr_cents);
      expect(at(r, 60).mrr_cents).toBeGreaterThanOrEqual(15000); // ≥ $150 MRR 60 nap alatt (kezdés: $15)
    }
    // a medián a második hónapban is nő (nem áll be platóra)
    const casual = run(ECONOMY, 'casual');
    expect(median(casual.map((r) => at(r, 60).mrr_cents))).toBeGreaterThan(median(casual.map((r) => at(r, 30).mrr_cents)));
  });

  it('active player grows faster than casual, but not trivially (Era 2 earlier; Era 3 needs most of the 60 days)', () => {
    const casual = run(ECONOMY, 'casual');
    const active = run(ECONOMY, 'active');
    expect(median(active.map((r) => at(r, 60).mrr_cents))).toBeGreaterThan(1.3 * median(casual.map((r) => at(r, 60).mrr_cents)));
    const eraDay = (r: SimResult, era: number) => r.days.find((d) => d.era >= era)?.day ?? 999;
    for (const r of active) expect(eraDay(r, 2)).toBeGreaterThanOrEqual(7); // a 7 napos kapu előtt senki
    expect(median(active.map((r) => eraDay(r, 2)))).toBeLessThan(median(casual.map((r) => eraDay(r, 2))));
    expect(median(active.map((r) => eraDay(r, 3)))).toBeGreaterThanOrEqual(35);
    for (const r of casual) expect(at(r, 60).era).toBeLessThanOrEqual(2);
  });

  it('the bridge investor is the safety net, not a habit: idle and casual never need it, nobody gets it twice', () => {
    for (const profile of ['idle', 'casual'] as const) {
      for (const r of run(ECONOMY, profile)) expect(r.bridge_day).toBeNull();
    }
    // (kétszer nem is kaphatja: a simulate a bridgeUsed jelzőt, a tick az events-sort nézi)
  });
});

// Görbék a grafikonhoz: SIM_DUMP=1 npx vitest run src/lib/game/__tests__/economy-sim.test.ts
describe.runIf(!!process.env.SIM_DUMP)('dump', () => {
  it('prints the curves as JSON', () => {
    const outRows: unknown[] = [];
    for (const rules of [LEGACY_RULES, ECONOMY]) {
      for (const profile of ['idle', 'casual', 'active'] as const) {
        for (const seed of SEEDS) {
          const r = simulate(rules, profile, { days: 60, seed });
          outRows.push({ rules: r.rules, profile, seed, broke_day: r.broke_day, min_cash: r.min_cash_cents, bridge_day: r.bridge_day, churned: r.churned_total, acquired: r.acquired_total, days: r.days });
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('SIMJSON' + JSON.stringify(outRows) + 'SIMJSON');
  });
});
