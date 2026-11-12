// src/lib/game/network.ts
// Hyperscales — a Hálózat szabályai EGY helyen (2026-11-12, hálózat-kör).
//
// Három döntés, nem tizenöt csúszka (a számok: economy.ts NETWORK_RULE_V3):
//  1. Tranzit-csomag (sávszélesség): ingyenes alap (80 egység) → 100 Mbit ($40/hó, 200) → 1 Gbit ($120/hó, 600).
//     Minden ügyfél forgalmat visz (hobbi 1, üzleti 2, nagy ügyfél 8 egység). Ha több a forgalom, mint a
//     sávszélesség, lassulnak az oldalak: több ticket (×1 + 1,5 × túllógás) és félnaponta −2 elégedettség —
//     ugyanúgy, mint a gépek túlterhelésénél. Kicsi csomag = lassulás, nagy csomag = kidobott havidíj.
//  2. Peering (IX-csatlakozás): $200 egyszer + $15/hó; +30% hasznos sávszélesség és 30%-kal olcsóbb tranzit.
//     A 100 Mbites csomagon alig hozza vissza a díját, az 1 Gbitesen megéri — ez a döntés.
//  3. DDoS-védelem: $30/hó, a DDoS-események 75%-a elmarad (az SRE-vel és a fejlesztésekkel együtt legfeljebb 90%).
//
// A CDN kimaradt: a Kutatás fában már van két CDN-fejlesztés (cdn_bind, cdn_global), egy harmadik CDN-gomb
// összezavarná. Az áramszünet-eseményeket az SRE és a hardver-fejlesztések védik.
// A hálózat csak a 2. korszaktól számít: az 1. korszakban senki nem lassul (az alap 80 egység ott elég is).
//
// Piactéri peering (2026-11-12, csapat-utókör): a piactér „enable_peering" hatású peering-hirdetése (NPC) ugyanezt
// a peeringet kapcsolja be, a hirdetés ára az egyszeri díj, a havidíj a hirdetés szerinti kedvezményes összeg
// (marketplace/buy.ts parsePeeringEffect, api/marketplace/purchase/[id]). Új oszlop (migráció) nélkül: a
// player_network.peering mező 0 = nincs, 1 = normál díjas, ≥ 2 = piactéri szerződés, és ekkor az érték maga a
// havidíj centben (a kedvezményes díj legalább $1 → 100, így nem ütközik az 1-gyel). Kikapcsoláskor (vagy ha a
// tranzit a min_tier alá csökken) a szerződés megszűnik; újra bekapcsolva a normál díj jár.

import type { NetworkRule } from './economy';
import type { UpgradeEffects } from './upgrade-effects';

export interface NetworkState {
  transit_tier: number;
  peering: number;
  ddos: number;
  /** Piactéri peering-szerződés havidíja (cent); null/hiányzik = a normál díj (rule.peering.monthly_cents). */
  peering_monthly_cents?: number | null;
}

export const NO_NETWORK: NetworkState = Object.freeze({ transit_tier: 0, peering: 0, ddos: 0 });

/** Él-e a hálózat-szabály ebben a korszakban. */
export function networkActive(rule: NetworkRule | null, era: number): rule is NetworkRule {
  return !!rule && era >= rule.min_era;
}

export function clampTier(rule: NetworkRule, tier: number): number {
  return Math.max(0, Math.min(rule.tiers.length - 1, Math.floor(Number(tier) || 0)));
}

/** A hasznos sávszélesség (egység): a csomag + a peering. */
export function bandwidthUnits(rule: NetworkRule, n: NetworkState): number {
  const base = rule.tiers[clampTier(rule, n.transit_tier)].bandwidth_units;
  return Math.floor(base * (n.peering ? 1 + rule.peering.bandwidth_pct / 100 : 1));
}

/** A forgalom (egység) az ügyfelekből. */
export function trafficUnits(rule: NetworkRule, c: { hobby: number; business: number; dedicated: number }): number {
  return c.hobby * rule.units.hobby + c.business * rule.units.business + c.dedicated * rule.units.dedicated;
}

/** A hálózat havidíja (cent): tranzit (peeringgel olcsóbb) + peering + DDoS-védelem. */
export function networkMonthlyCents(rule: NetworkRule | null, n: NetworkState): number {
  if (!rule) return 0;
  const transit = rule.tiers[clampTier(rule, n.transit_tier)].monthly_cents;
  const disc = n.peering ? 1 - rule.peering.transit_discount_pct / 100 : 1;
  const peer = n.peering ? (n.peering_monthly_cents ?? rule.peering.monthly_cents) : 0;
  return Math.round(transit * disc) + peer + (n.ddos ? rule.ddos.monthly_cents : 0);
}

/** A player_network.peering oszlop értéke → (be van-e kapcsolva, piactéri havidíj vagy null). */
export function decodePeering(raw: unknown): { peering: number; peering_monthly_cents: number | null } {
  const v = Math.floor(Number(raw) || 0);
  if (v <= 0) return { peering: 0, peering_monthly_cents: null };
  return { peering: 1, peering_monthly_cents: v >= 2 ? v : null };
}

/** A tárolandó peering-érték: 0, 1 (normál díj) vagy a piactéri havidíj centben (≥ 2). */
export function encodePeering(n: Pick<NetworkState, 'peering' | 'peering_monthly_cents'>): number {
  if (!n.peering) return 0;
  const m = n.peering_monthly_cents;
  return m != null && m >= 2 ? Math.round(m) : 1;
}

/** A lassulás aránya: (forgalom − sávszélesség) / sávszélesség, 0..1. */
export function slowdownRatio(traffic: number, bandwidth: number): number {
  if (traffic <= bandwidth) return 0;
  if (bandwidth <= 0) return 1;
  return Math.min(1, (traffic - bandwidth) / bandwidth);
}

/** A sima ügyfelek ticket-szorzója a lassulásból (1 = nincs). */
export function slowdownTicketFactor(rule: NetworkRule, ratio: number): number {
  return 1 + rule.slowdown.ticket_factor * Math.max(0, Math.min(1, ratio));
}

/** A hálózat hatása a meglévő hatás-kulcsokon: a DDoS-védelem. */
export function networkEffects(rule: NetworkRule | null, n: NetworkState): Partial<UpgradeEffects> {
  if (!rule || !n.ddos) return {};
  return { avoid_network: rule.ddos.avoid_network };
}

/** A hálózat a DB-ből. Ha a tábla még nincs (a migráció előtt élesített kód) vagy nincs sor: az ingyenes alap. */
export async function loadNetwork(
  db: { prepare(sql: string): { bind(...a: unknown[]): { first<T = unknown>(): Promise<T | null> } } },
  playerId: string,
): Promise<NetworkState> {
  try {
    const r = await db.prepare('SELECT transit_tier, peering, ddos FROM player_network WHERE player_id = ?')
      .bind(playerId).first<{ transit_tier: number; peering: number; ddos: number }>();
    if (!r) return { ...NO_NETWORK };
    const pe = decodePeering(r.peering);
    return {
      transit_tier: Math.max(0, Number(r.transit_tier) || 0), peering: pe.peering, ddos: Number(r.ddos) ? 1 : 0,
      // a piactéri díj csak akkor kerül bele, ha van (a normál peering állapota ugyanaz marad, mint eddig)
      ...(pe.peering_monthly_cents != null ? { peering_monthly_cents: pe.peering_monthly_cents } : {}),
    };
  } catch {
    return { ...NO_NETWORK };
  }
}
