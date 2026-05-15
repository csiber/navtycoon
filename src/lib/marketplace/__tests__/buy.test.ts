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
