// Hyperscales — az economy.ts tiszta szabályai (2026-11-12, egyensúly-kör).
import { describe, it, expect } from 'vitest';
import {
  ECONOMY, LEGACY_RULES, ppcSpendPerTick, acquisitionProb, priceFactor, applyCashDelta, bridgeDue,
  scaleEventCash, rescaleMoneyLabel, eventCostFactor, churnProb, ticketSpawnProb, TICKS_PER_DAY,
} from '../economy';
import { EVENT_DEFINITIONS } from '../event-options';
import { localizeEvent } from '../event-i18n';

describe('PPC budget', () => {
  it('legacy: full cost or nothing (the old $95/day at 33%)', () => {
    expect(ppcSpendPerTick(LEGACY_RULES, { ppc_pct: 33, cash_cents: 100000, mrr_cents: 1500 }).cost_cents * TICKS_PER_DAY).toBe(9504);
    expect(ppcSpendPerTick(LEGACY_RULES, { ppc_pct: 33, cash_cents: 10, mrr_cents: 0 }).cost_cents).toBe(0);
  });
  it('v2: never more than income share + a slice of the cash above the reserve', () => {
    for (const cash of [0, 5000, 20000, 25000, 100000, 1_000_000]) {
      for (const mrr of [0, 1500, 30000]) {
        const s = ppcSpendPerTick(ECONOMY, { ppc_pct: 100, cash_cents: cash, mrr_cents: mrr });
        const b = ECONOMY.ppc_budget!;
        const capPerDay = (mrr / 30) * b.income_share + Math.max(0, cash - b.reserve_cents) * b.cash_share_per_day;
        expect(s.cost_cents * TICKS_PER_DAY).toBeLessThanOrEqual(capPerDay + 1e-9);
        expect(s.cost_cents).toBeLessThanOrEqual(Math.max(0, cash));
        expect(s.effective_pct).toBeLessThanOrEqual(100);
      }
    }
  });
  it('v2: a PPC point is worth more than a free SEO point, and only the money actually spent counts', () => {
    const base = { seo_pct: 50, referral_pct: 0, reputation: 50, era: 1, is_pro: false, age_days: 30 };
    const seoOnly = acquisitionProb(ECONOMY, { ...base, seo_pct: 100, ppc_effective_pct: 0 });
    const half = acquisitionProb(ECONOMY, { ...base, ppc_effective_pct: 50 });
    expect(half).toBeGreaterThan(seoOnly);
    // régen a PPC-pont pont annyit ért, mint az SEO-pont → a fizetett csatorna tiszta veszteség volt
    expect(acquisitionProb(LEGACY_RULES, { ...base, ppc_effective_pct: 50 }))
      .toBeCloseTo(acquisitionProb(LEGACY_RULES, { ...base, seo_pct: 100, ppc_effective_pct: 0 }), 12);
  });
});

describe('pricing', () => {
  it('default price = factor 1; max price cuts acquisition, cheap price raises it', () => {
    expect(priceFactor(ECONOMY, 500, 1500)).toBeCloseTo(1, 12);
    expect(priceFactor(ECONOMY, 1000, 3000)).toBeLessThan(0.4);
    expect(priceFactor(ECONOMY, 300, 1000)).toBeGreaterThan(1.5);
    expect(priceFactor(LEGACY_RULES, 1000, 3000)).toBe(1);
  });
});

describe('cash safety', () => {
  it('costs never push cash below zero (v2), income always counts', () => {
    expect(applyCashDelta(ECONOMY, 3000, -50000)).toBe(0);
    expect(applyCashDelta(ECONOMY, 0, -5000)).toBe(0);
    expect(applyCashDelta(ECONOMY, -700, -5000)).toBe(-700); // a régi negatív állás nem mélyül tovább
    expect(applyCashDelta(ECONOMY, 3000, 2000)).toBe(5000);
    expect(applyCashDelta(LEGACY_RULES, 3000, -50000)).toBe(-47000);
  });
  it('bridge investor: only below the threshold, after day 1, once', () => {
    expect(bridgeDue(ECONOMY, { cash_cents: 4000, age_days: 2, already_used: false })).toBe(true);
    expect(bridgeDue(ECONOMY, { cash_cents: 4000, age_days: 2, already_used: true })).toBe(false);
    expect(bridgeDue(ECONOMY, { cash_cents: 4000, age_days: 0.5, already_used: false })).toBe(false);
    expect(bridgeDue(ECONOMY, { cash_cents: 60000, age_days: 2, already_used: false })).toBe(false);
    expect(bridgeDue(LEGACY_RULES, { cash_cents: 0, age_days: 9, already_used: false })).toBe(false);
  });
  it('happy customers: fewer tickets and more patience', () => {
    expect(ticketSpawnProb(ECONOMY, 80)).toBeLessThan(ticketSpawnProb(ECONOMY, 50));
    expect(churnProb(ECONOMY, 80, false)).toBeLessThan(churnProb(ECONOMY, 50, false));
    expect(churnProb(ECONOMY, 50, true)).toBeLessThan(churnProb(ECONOMY, 50, false));
  });
});

describe('event cost scaling', () => {
  it('small companies pay a fraction, from $1000 MRR the full price; income is never scaled', () => {
    expect(eventCostFactor(ECONOMY, 1500)).toBe(ECONOMY.event_cost_scale!.min_factor);
    expect(eventCostFactor(ECONOMY, 50000)).toBeCloseTo(0.5, 12);
    expect(eventCostFactor(ECONOMY, 500000)).toBe(1);
    expect(scaleEventCash(ECONOMY, -30000, 1500)).toBe(-3000);
    expect(scaleEventCash(ECONOMY, -5000, 1500)).toBe(-500);
    expect(scaleEventCash(ECONOMY, 2500000, 1500)).toBe(2500000);
    expect(scaleEventCash(LEGACY_RULES, -30000, 1500)).toBe(-30000);
  });
  it('every localized label that names a price shows the scaled price (EN/HU/DE)', () => {
    for (const [type, def] of Object.entries(EVENT_DEFINITIONS)) {
      for (const locale of ['en', 'hu', 'de'] as const) {
        const loc = localizeEvent(def, locale);
        def.options.forEach((o, i) => {
          if (o.id === 'counter_offer') return;
          const nominal = o.apply().cash_delta_cents;
          if (nominal >= 0) return;
          const scaled = scaleEventCash(ECONOMY, nominal, 1500);
          const label = rescaleMoneyLabel(loc.options[i].label, nominal, scaled);
          const usd = Math.abs(nominal) / 100;
          const mentions = new RegExp('\\$' + usd.toLocaleString('en-US').replace(/,/g, ',?') + '(?!\\d)').test(loc.options[i].label);
          if (mentions) {
            expect(label, `${type}.${o.id} (${locale})`).toContain('$' + Math.abs(scaled) / 100);
            expect(label, `${type}.${o.id} (${locale})`).not.toMatch(new RegExp('\\$' + usd.toLocaleString('en-US') + '(?!\\d)'));
          } else {
            expect(label).toBe(loc.options[i].label);
          }
        });
      }
    }
    // pl. „Pay $300 for Cloudflare mitigation" → „Pay $30 …" egy kezdő cégnél
    expect(rescaleMoneyLabel('Pay $300 for Cloudflare mitigation', -30000, -3000)).toBe('Pay $30 for Cloudflare mitigation');
    expect(rescaleMoneyLabel('Hire a Big 4 auditor ($1,200)', -120000, -12000)).toBe('Hire a Big 4 auditor ($120)');
    expect(rescaleMoneyLabel('Give the raise (-$800)', -80000, -8000)).toBe('Give the raise (-$80)');
  });
});
