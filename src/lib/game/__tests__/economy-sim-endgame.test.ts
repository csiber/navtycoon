// Hyperscales — a végjáték tempója a szimulátorral (2026-11-13). Hosszú (365 napos) futások, ezért külön fájlban és
// kevés seeden (a CT120-on egy aktív 365 napos futás ~2–3 s). A célok (Csaba): aktív játékos ~4–6 hónap alatt ér
// célba, az alkalmi (napi egy műszak) jóval később vagy soha, a tétlen soha; a 3. korszak nem jön korábban.
import { describe, it, expect } from 'vitest';
import { simulate, type ProfileId, type SimResult } from '../economy-sim';
import { ECONOMY } from '../economy';
import { GOAL } from '../endgame';

const T = { timeout: 240_000 };
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
  it('active player: finishes in ~4–6 months (median 120–190 days), every seed within the year', T, () => {
    const runs = ACTIVE_SEEDS.map((s) => sim('active', s));
    const fin = runs.map((r) => r.finished_day ?? Infinity);
    for (const f of fin) expect(f).toBeLessThanOrEqual(300);
    expect(median(fin)).toBeGreaterThanOrEqual(120);
    expect(median(fin)).toBeLessThanOrEqual(190);
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

  it('casual player (one shift a day, no upgrades): not within 8 months — or never', T, () => {
    for (const s of [1, 2]) {
      const r = sim('casual', s);
      expect(r.finished_day === null || r.finished_day >= 240).toBe(true);
      expect(r.broke_day).toBeNull();
    }
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
