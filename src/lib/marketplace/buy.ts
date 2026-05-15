// src/lib/marketplace/buy.ts
// Pure buy-flow logic for marketplace leads. Keeping it framework-free
// makes it trivial to unit-test without spinning up D1 / Astro context.
// The Astro endpoint at /api/marketplace/purchase/[id] is a thin shell
// around these helpers.

import type { PersonaArchetype, PlanTier } from '../game/types';

export interface BuyableListing {
  id: number;
  category: string;
  effect_type: string | null;
  effect_payload: string | null;
  price_cents: number;
  sold_at: number | null;
}

export interface SpawnCustomerEffect {
  archetype: PersonaArchetype;
  name: string;
  plan_tier: PlanTier;
  starting_satisfaction: number;
}

export type BuyError = 'not_buyable' | 'sold' | 'insufficient_cash' | 'bad_payload';

export type BuyResult =
  | { ok: true }
  | { ok: false; error: BuyError };

const KNOWN_ARCHETYPES: readonly PersonaArchetype[] = [
  'newbie', 'pro', 'cheapskate', 'karen', 'loyalist', 'ghost', 'drama', 'crypto',
];
const KNOWN_TIERS: readonly PlanTier[] = ['hobby', 'business', 'vps', 'dedicated'];

export function validateBuy(listing: BuyableListing, cashCents: number): BuyResult {
  // Order: schema gates first (category, effect_type), then state (sold), then funds, then payload.
  if (listing.category !== 'leads') return { ok: false, error: 'not_buyable' };
  if (listing.effect_type !== 'spawn_customer') return { ok: false, error: 'not_buyable' };
  if (listing.sold_at !== null) return { ok: false, error: 'sold' };
  if (cashCents < listing.price_cents) return { ok: false, error: 'insufficient_cash' };
  const effect = parseEffect(listing.effect_payload);
  if (!effect) return { ok: false, error: 'bad_payload' };
  return { ok: true };
}

export function parseEffect(payload: string | null): SpawnCustomerEffect | null {
  if (!payload) return null;
  let obj: unknown;
  try { obj = JSON.parse(payload); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const archetype = o.archetype;
  const name = o.name;
  const plan_tier = o.plan_tier;
  const sat = o.starting_satisfaction;
  if (typeof archetype !== 'string' || !(KNOWN_ARCHETYPES as readonly string[]).includes(archetype)) return null;
  if (typeof name !== 'string' || name.length === 0) return null;
  if (typeof plan_tier !== 'string' || !(KNOWN_TIERS as readonly string[]).includes(plan_tier)) return null;
  if (typeof sat !== 'number' || sat < 0 || sat > 100) return null;
  return {
    archetype: archetype as PersonaArchetype,
    name,
    plan_tier: plan_tier as PlanTier,
    starting_satisfaction: sat,
  };
}
