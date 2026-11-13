// Hyperscales — a végjáték tempója a szimulátorral (2026-11-13). Hosszú (365 napos) futások, ezért külön fájlban és
// kevés seeden (a CT120-on egy 365 napos futás ~5–25 s). A célok (Csaba): aktív játékos ~5 hónap alatt (medián ~150 nap)
// ér célba, a 3. korszak nem jön korábban és nem pörög át gyorsan; 2026-11-13 (lezárás, era_ticket_factor): az alkalmi
// (napi egy műszak, fejlesztés nélkül) is célba ér, de jóval később (~250–365. nap); a tétlen és a „soha nem vesz” soha.
import { describe, it, expect } from 'vitest';
import { simulate, type ProfileId, type SimResult } from '../economy-sim';
import { ECONOMY, eraTicketFactor } from '../economy';
import { SPEEDRUN_DAYS } from '../achievements';
import { GOAL } from '../endgame';

const T = { timeout: 240_000 };
const T_LONG = { timeout: 600_000 };
const memo = new Map<string, SimResult>();
const sim = (profile: ProfileId, seed: number, days = 365): SimResult => {
  const k = `${profile}:${seed}:${days}`;
  if (!memo.has(k)) memo.set(k, simulate(ECONOMY, profile, { days, seed }));
  return memo.get(k)!;
};
const eraDay = (r: SimResult, e: number) => r.days.find((d) => d.era >= e)?.day ?? Infinity;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ACTIVE_SEEDS = [1, 2, 3, 4, 5, 6];

describe('endgame pacing (365 days)', () => {
  it('active player: finishes in ~5 months (median 140–165 days), every seed within the year', T, () => {
    const runs = ACTIVE_SEEDS.map((s) => sim('active', s));
    const fin = runs.map((r) => r.finished_day ?? Infinity);
    for (const f of fin) expect(f).toBeLessThanOrEqual(300);
    expect(median(fin)).toBeGreaterThanOrEqual(140);
    expect(median(fin)).toBeLessThanOrEqual(165);
    // a befejezés a 4. korszak után jön, és tényleg kell hozzá nagyvállalati szerződés
    for (const r of runs) {
      expect(r.finished_day!).toBeGreaterThan(eraDay(r, 4));
      expect(r.enterprise_signed).toBeGreaterThanOrEqual(1);
      const d = r.days.find((x) => x.day === r.finished_day)!;
      expect(d.cloud_regions).toBeGreaterThanOrEqual(GOAL.min_cloud_regions);
      expect(d.edge_pops).toBeGreaterThanOrEqual(GOAL.min_edge_pops);
      expect(r.broke_day).toBeNull();
    }
  });

  it('Era 3 is not faster than before the endgame round (Era 1–2 are unchanged): median ≥ 55 days', T, () => {
    expect(median(ACTIVE_SEEDS.map((s) => eraDay(sim('active', s), 3)))).toBeGreaterThanOrEqual(55);
  });

  it('the speedrun threshold (≤ 140 days) stays meaningful: at most a third of the active seeds make it', T, () => {
    const fin = ACTIVE_SEEDS.map((s) => sim('active', s).finished_day ?? Infinity);
    expect(fin.filter((f) => f <= SPEEDRUN_DAYS).length).toBeLessThanOrEqual(2);
    expect(Math.min(...fin)).toBeGreaterThanOrEqual(120);
  });

  it('casual player (one shift a day, no upgrades) gets there too, but much later: ~250–365 days, never before 240', T_LONG, () => {
    const runs = ACTIVE_SEEDS.map((s) => sim('casual', s));
    const fin = runs.map((r) => r.finished_day ?? Infinity);
    for (const f of fin) expect(f).toBeGreaterThanOrEqual(240);
    expect(fin.filter((f) => Number.isFinite(f)).length).toBeGreaterThanOrEqual(4);
    expect(median(fin)).toBeGreaterThanOrEqual(250);
    expect(median(fin)).toBeLessThanOrEqual(365);
    for (const r of runs) expect(r.broke_day).toBeNull();
  });

  it('Era 3 tickets are much lighter (era_ticket_factor), Era 1–2 unchanged', () => {
    expect(eraTicketFactor(ECONOMY, 1)).toBe(1);
    expect(eraTicketFactor(ECONOMY, 2)).toBe(1);
    expect(eraTicketFactor(ECONOMY, 3)).toBeLessThan(0.2);
    expect(eraTicketFactor(ECONOMY, 4)).toBeLessThan(eraTicketFactor(ECONOMY, 3));
  });

  it('the never-buy player never finishes', T, () => {
    for (const s of [1, 2]) expect(sim('never_buy', s).finished_day).toBeNull();
  });

  it('idle player never finishes and never leaves Era 1', T, () => {
    for (const s of [1, 2]) {
      const r = sim('idle', s);
      expect(r.finished_day).toBeNull();
      expect(r.days[r.days.length - 1].era).toBe(1);
    }
  });

  it('the dedicated-box player also gets there (the enterprise comes to a second box)', T, () => {
    const r = sim('dedicated', 2);
    expect(r.finished_day).not.toBeNull();
    expect(r.enterprise_signed).toBeGreaterThanOrEqual(1);
  });
});
