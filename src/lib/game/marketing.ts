// Hyperscaler — marketing-mix-normalize lib.
// A user tetszőleges súlyokat ad meg (seo / ppc / referral); mi 100%-ra
// normalizáljuk és kerekítjük úgy, hogy a 3 tag pontosan 100-at adjon ki.
// Üres / mind-zéró input → balanced default (33/33/34).
//
// Kapcsolódó D1-mezők (players-tábla):
//   marketing_seo_pct, marketing_ppc_pct, marketing_referral_pct.

export interface MarketingMix { seo: number; ppc: number; referral: number; }

export function normalizeMix(mix: Partial<MarketingMix>): MarketingMix {
  const seo = Math.max(0, mix.seo ?? 0);
  const ppc = Math.max(0, mix.ppc ?? 0);
  const referral = Math.max(0, mix.referral ?? 0);
  const total = seo + ppc + referral;
  if (total === 0) return { seo: 33, ppc: 33, referral: 34 };
  const seoPct = Math.round((seo / total) * 100);
  const ppcPct = Math.round((ppc / total) * 100);
  return { seo: seoPct, ppc: ppcPct, referral: 100 - seoPct - ppcPct };
}
