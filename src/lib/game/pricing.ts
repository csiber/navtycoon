// Hyperscaler — pricing-clamp lib.
// Plan-tier-szintű árazás cents-ben, hard min/max bound-okkal: ha a játékos
// kívülre lőne, csendben befogjuk a tartományba (UX: nincs error, csak clamp).
//
// Kapcsolódó D1-mezők (players-tábla): pricing_hobby_cents, pricing_business_cents.

export const PRICING_BOUNDS = {
  hobby: { min: 300, max: 1000 },
  business: { min: 1000, max: 3000 },
};

export function clampPricing(hobby: number, business: number): { hobby: number; business: number } {
  return {
    hobby: Math.max(PRICING_BOUNDS.hobby.min, Math.min(PRICING_BOUNDS.hobby.max, hobby)),
    business: Math.max(PRICING_BOUNDS.business.min, Math.min(PRICING_BOUNDS.business.max, business)),
  };
}
