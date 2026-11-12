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

// ─── Kedvezményes peering (2026-11-12, csapat-utókör) ───
// A „peering" kategóriájú, enable_peering hatású NPC-hirdetés megvétele bekapcsolja a peeringet a player_network-ben
// (game/network.ts): a hirdetés ára az egyszeri díj, a havidíj a hirdetés payloadja szerinti kedvezményes összeg.
// Csak a 2. korszaktól, legalább a peering min_tier tranzit-csomagjával, és csak ha még nincs peering. A hirdetés
// ugyanúgy elkel (egyszer vehető meg), mint a leadek.

export interface PeeringEffect {
  /** A kedvezményes havidíj (cent), legalább $1, és kevesebb, mint a normál díj. */
  monthly_cents: number;
}

export function parsePeeringEffect(payload: string | null, normalMonthlyCents: number): PeeringEffect | null {
  if (!payload) return null;
  let obj: unknown;
  try { obj = JSON.parse(payload); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const m = (obj as Record<string, unknown>).monthly_cents;
  if (typeof m !== 'number' || !Number.isInteger(m) || m < 100 || m >= normalMonthlyCents) return null;
  return { monthly_cents: m };
}

export type PeeringBlock = 'era_locked' | 'not_ready' | 'has_peering' | 'needs_transit' | 'insufficient_cash';

export interface PeeringBuyCtx {
  era: number;
  min_era: number;
  /** Megvan-e a player_network tábla (a 0013-as migráció lefutott). */
  ready: boolean;
  has_peering: boolean;
  transit_tier: number;
  min_tier: number;
  cash_cents: number;
}

/** Miért nem vehető most (null = megvehető). A sorrend a felirat miatt számít: ami előbb oldandó, az jön előbb. */
export function peeringBlock(price_cents: number, c: PeeringBuyCtx): PeeringBlock | null {
  if (c.era < c.min_era) return 'era_locked';
  if (!c.ready) return 'not_ready';
  if (c.has_peering) return 'has_peering';
  if (c.transit_tier < c.min_tier) return 'needs_transit';
  if (c.cash_cents < price_cents) return 'insufficient_cash';
  return null;
}

export function isPeeringListing(l: Pick<BuyableListing, 'category' | 'effect_type'>): boolean {
  return l.category === 'peering' && l.effect_type === 'enable_peering';
}
