// Hyperscales — a fejlesztések mérhető hatása (upgrade-effects.ts, 2026-11-12 játékmag).
import { describe, it, expect } from 'vitest';
import { UPGRADE_SPECS } from '../upgrade-tree';
import { effectsOf, EFFECT_KEYS, EFFECT_LIMITS, eventAvoidProb, NO_EFFECTS } from '../upgrade-effects';
import { ECONOMY, BALANCE_V2_RULES, ticketSpawnProb, churnProb, acquisitionProb, pickServerToSell, applyServerFee } from '../economy';
import { serverCapacity, SERVER_SPECS } from '../server-types';

describe('upgrade effects', () => {
  it('every upgrade has at least one real, known effect (no flavour-only upgrades)', () => {
    for (const u of UPGRADE_SPECS) {
      const keys = Object.keys(u.effect_data);
      expect(keys.length, u.id).toBeGreaterThan(0);
      for (const k of keys) expect(EFFECT_KEYS as readonly string[], `${u.id}.${k}`).toContain(k);
    }
  });
  it('effects add up and are clamped', () => {
    const e = effectsOf(['cpanel_license', 'cdn_bind', 'mod_pagespeed']);
    expect(e.ticket_pct).toBe(-35);
    expect(e.acq_pct).toBe(35);
    const all = effectsOf(UPGRADE_SPECS.map((u) => u.id));
    for (const k of EFFECT_KEYS) {
      expect(all[k]).toBeGreaterThanOrEqual(EFFECT_LIMITS[k][0]);
      expect(all[k]).toBeLessThanOrEqual(EFFECT_LIMITS[k][1]);
    }
    expect(effectsOf(['nope'])).toEqual(NO_EFFECTS);
  });
  it('the effects change the live formulas (and not the v2 ones)', () => {
    expect(ticketSpawnProb(ECONOMY, 50, -25)).toBeCloseTo(ticketSpawnProb(ECONOMY, 50) * 0.75, 12);
    expect(ticketSpawnProb(BALANCE_V2_RULES, 50, -25)).toBe(ticketSpawnProb(BALANCE_V2_RULES, 50));
    expect(churnProb(ECONOMY, 50, false, -20)).toBeCloseTo(churnProb(ECONOMY, 50, false) * 0.8, 12);
    const a = { seo_pct: 50, ppc_effective_pct: 0, referral_pct: 50, reputation: 50, era: 1, is_pro: false, age_days: 30 };
    expect(acquisitionProb(ECONOMY, { ...a, acq_pct: 15 })).toBeCloseTo(acquisitionProb(ECONOMY, a) * 1.15, 12);
    expect(serverCapacity('lamp_box', 30, 50)).toBe(Math.floor(SERVER_SPECS.lamp_box.capacity * 1.5));
    expect(eventAvoidProb('security_breach', effectsOf(['mod_security']))).toBeCloseTo(0.4, 12);
    expect(eventAvoidProb('viral_blog', effectsOf(['mod_security']))).toBe(0);
  });
  it('server capacity comes from the type (tuning applies to existing rows), unknown type falls back to the row', () => {
    expect(serverCapacity('lamp_box', 30)).toBe(SERVER_SPECS.lamp_box.capacity);
    expect(serverCapacity('mystery', 7)).toBe(7);
  });
  it('auto-sell picks the most expensive empty paid server, never a free one', () => {
    expect(pickServerToSell([{ monthly_cost_cents: 0, load: 0 }])).toBe(-1);
    expect(pickServerToSell([
      { monthly_cost_cents: 0, load: 0 }, { monthly_cost_cents: 3000, load: 5 },
      { monthly_cost_cents: 3000, load: 0 }, { monthly_cost_cents: 10000, load: 2 },
    ])).toBe(2);
    expect(pickServerToSell([{ monthly_cost_cents: 3000, load: 5 }, { monthly_cost_cents: 10000, load: 2 }])).toBe(1);
  });
  it('fees stop at the debt limit', () => {
    expect(applyServerFee(ECONOMY, 500, 200)).toEqual({ cash: 300, over_limit: false });
    expect(applyServerFee(ECONOMY, -ECONOMY.debt_limit_cents + 50, 200)).toEqual({ cash: -ECONOMY.debt_limit_cents, over_limit: true });
  });
});
