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
// TODO(hálózat): a piactér „peering"-hirdetései még csak díszek. Egy egyszerű bekötés: a hirdetés megvétele
// a fenti peeringet kapcsolná be kedvezményes egyszeri díjjal — a vásárlási út (api/marketplace/purchase)
// ma csak lead-et tud, ezért ez külön kör.

import type { NetworkRule } from './economy';
import type { UpgradeEffects } from './upgrade-effects';

export interface NetworkState {
  transit_tier: number;
  peering: number;
  ddos: number;
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
  return Math.round(transit * disc) + (n.peering ? rule.peering.monthly_cents : 0) + (n.ddos ? rule.ddos.monthly_cents : 0);
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
    return { transit_tier: Math.max(0, Number(r.transit_tier) || 0), peering: Number(r.peering) ? 1 : 0, ddos: Number(r.ddos) ? 1 : 0 };
  } catch {
    return { ...NO_NETWORK };
  }
}
