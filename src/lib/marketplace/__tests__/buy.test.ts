import { describe, it, expect } from 'vitest';
import { validateBuy, parseEffect, type BuyableListing } from '../buy';

const baseListing: BuyableListing = {
  id: 42,
  category: 'leads',
  effect_type: 'spawn_customer',
  effect_payload: JSON.stringify({
    archetype: 'loyalist',
    name: 'Sarah Chen',
    plan_tier: 'hobby',
    starting_satisfaction: 75,
  }),
  price_cents: 20000, // $200
  sold_at: null,
};

describe('validateBuy', () => {
  it('passes for a fresh leads listing with spawn_customer effect and enough cash', () => {
    const r = validateBuy(baseListing, 25000);
    expect(r.ok).toBe(true);
  });

  it('rejects when listing is already sold', () => {
    const r = validateBuy({ ...baseListing, sold_at: 1700000000 }, 25000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('sold');
  });

  it('rejects when cash is below price', () => {
    const r = validateBuy(baseListing, 15000); // $150 < $200
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('insufficient_cash');
  });

  it('rejects when category is not leads', () => {
    const r = validateBuy({ ...baseListing, category: 'hardware' }, 25000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('not_buyable');
  });

  it('rejects when effect_type is not spawn_customer', () => {
    const r = validateBuy({ ...baseListing, effect_type: null }, 25000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('not_buyable');
  });

  it('rejects when effect_payload is malformed JSON', () => {
    const r = validateBuy({ ...baseListing, effect_payload: 'not json' }, 25000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad_payload');
  });

  it('accepts when cash exactly equals price', () => {
    const r = validateBuy(baseListing, baseListing.price_cents);
    expect(r.ok).toBe(true);
  });
});

describe('parseEffect', () => {
  it('parses a valid spawn_customer payload', () => {
    const e = parseEffect(baseListing.effect_payload);
    expect(e).toEqual({
      archetype: 'loyalist',
      name: 'Sarah Chen',
      plan_tier: 'hobby',
      starting_satisfaction: 75,
    });
  });

  it('returns null on malformed JSON', () => {
    expect(parseEffect('not json')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseEffect('{"name":"x"}')).toBeNull();
  });

  it('returns null when archetype is not a known persona', () => {
    expect(parseEffect('{"archetype":"alien","name":"x","plan_tier":"hobby","starting_satisfaction":50}')).toBeNull();
  });

  it('accepts boundary satisfaction values 0 and 100', () => {
    const lo = parseEffect(JSON.stringify({ archetype: 'pro', name: 'X', plan_tier: 'hobby', starting_satisfaction: 0 }));
    const hi = parseEffect(JSON.stringify({ archetype: 'pro', name: 'X', plan_tier: 'hobby', starting_satisfaction: 100 }));
    expect(lo?.starting_satisfaction).toBe(0);
    expect(hi?.starting_satisfaction).toBe(100);
  });

  it('rejects out-of-range satisfaction (-1 and 101)', () => {
    expect(parseEffect(JSON.stringify({ archetype: 'pro', name: 'X', plan_tier: 'hobby', starting_satisfaction: -1 }))).toBeNull();
    expect(parseEffect(JSON.stringify({ archetype: 'pro', name: 'X', plan_tier: 'hobby', starting_satisfaction: 101 }))).toBeNull();
  });
});

// 2026-11-12 (csapat-utókör): kedvezményes peering-hirdetés.
import { parsePeeringEffect, peeringBlock, isPeeringListing, type PeeringBuyCtx } from '../buy';
import { MARKETPLACE_SEEDS } from '../npc-seeds';

describe('peering-hirdetés', () => {
  const ok: PeeringBuyCtx = { era: 2, min_era: 2, ready: true, has_peering: false, transit_tier: 1, min_tier: 1, cash_cents: 50000 };

  it('a payload: kedvezményes havidíj, legalább $1 és kevesebb a normálnál', () => {
    expect(parsePeeringEffect('{"monthly_cents":900}', 1500)).toEqual({ monthly_cents: 900 });
    expect(parsePeeringEffect('{"monthly_cents":1500}', 1500)).toBeNull();
    expect(parsePeeringEffect('{"monthly_cents":50}', 1500)).toBeNull();
    expect(parsePeeringEffect('{"monthly_cents":"900"}', 1500)).toBeNull();
    expect(parsePeeringEffect(null, 1500)).toBeNull();
    expect(parsePeeringEffect('x', 1500)).toBeNull();
  });

  it('mikor vehető: 2. korszak, kész tábla, még nincs peering, van tranzit, van pénz — ebben a sorrendben', () => {
    expect(peeringBlock(15000, ok)).toBeNull();
    expect(peeringBlock(15000, { ...ok, era: 1, ready: false })).toBe('era_locked');
    expect(peeringBlock(15000, { ...ok, ready: false })).toBe('not_ready');
    expect(peeringBlock(15000, { ...ok, has_peering: true })).toBe('has_peering');
    expect(peeringBlock(15000, { ...ok, transit_tier: 0 })).toBe('needs_transit');
    expect(peeringBlock(15000, { ...ok, cash_cents: 14999 })).toBe('insufficient_cash');
  });

  it('a seedben van legalább két megvehető peering-hirdetés, érvényes payloaddal, a normál $200-nál olcsóbb díjjal', () => {
    const peers = MARKETPLACE_SEEDS.filter((s) => isPeeringListing({ category: s.category, effect_type: s.effect_type ?? null }));
    expect(peers.length).toBeGreaterThanOrEqual(2);
    for (const s of peers) {
      expect(s.price_unit).toBe('one_time');
      expect(s.price_cents).toBeLessThan(20000);
      expect(parsePeeringEffect(s.effect_payload ?? null, 1500)).not.toBeNull();
    }
  });

  it('a lead-vásárlás útja változatlan: peering-hirdetés ott nem vehető', () => {
    expect(validateBuy({ id: 1, category: 'peering', effect_type: 'enable_peering', effect_payload: '{"monthly_cents":900}', price_cents: 100, sold_at: null }, 99999).ok).toBe(false);
  });
});
