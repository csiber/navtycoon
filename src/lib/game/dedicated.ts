// src/lib/game/dedicated.ts
// Hyperscales — a dedikált gép és a „dedikált ügyfél" szabályai EGY helyen (2026-11-12, dedikált-kör).
//
// A dedikált gép (dedicated_box) 1 helyére csak egy nagy, üzleti/nagyvállalati ügyfél jöhet: a customers
// sorban plan_tier = 'dedicated' (a PlanTier típus eddig is ismerte, így nincs új oszlop). Saját beszerzési útja
// van: ha van szabad dedikált gép és elég a hírnév, naponta arrival_per_day eséllyel jelentkezik egy.
// A havidíját az azonosítójából számoljuk (fee_min..fee_max, step lépésekben), így sincs szükség oszlopra.
//
// Elvárás: ticket_factor-szor annyi ticket, a műszakban a jó válasz kevesebbet ér, a lezárás csak akkor nem
// árt, ha már elégedett; a 24 óránál régebbi megválaszolatlan ticket 12 óránként elégedettséget és hírnevet
// visz, 25 alatti elégedettségnél felmond, és bárhogy megy el, 15 hírnevet visz magával, utána pedig 30 napig (2026-11-12 este: 21 → 30) nem
// jelentkezik új nagy ügyfél (a gép közben üresen fizeti a díját).
//
// A tick (tick.ts), a műszak (api/shift/start.ts, shift-room DO), a felület és a szimulátor (economy-sim.ts)
// mind ezeket a függvényeket hívja.

import { TICKS_PER_DAY, type DedicatedRule, type EconomyRules, type EnterpriseRule } from './economy';

export const DEDICATED_SERVER_TYPE = 'dedicated_box';
export const DEDICATED_TIER = 'dedicated';
/** 2026-11-13 (végjáték): a nagyvállalati ügyfél is egy dedikált gépen ül, ugyanazokkal a gondozási szabályokkal
 *  (DedicatedRule); csak a szerződése nagyobb, és csak a 4. korszakban, globális jelenléttel jön (EnterpriseRule). */
export const ENTERPRISE_TIER = 'enterprise';
/** A „nagy ügyfél" sorok SQL-szűrője (dedikált + nagyvállalati). Konstans, nem felhasználói adat. */
export const BIG_TIERS_SQL = "('dedicated', 'enterprise')";

export const isDedicatedServer = (type: string): boolean => type === DEDICATED_SERVER_TYPE;
/** Nagy ügyfél-e (dedikált VAGY nagyvállalati): saját gépen ül, SLA-ja van, a korszak-MRR-be nem számít. */
export const isDedicatedCustomer = (planTier: string | null | undefined): boolean =>
  planTier === DEDICATED_TIER || planTier === ENTERPRISE_TIER;
export const isEnterpriseCustomer = (planTier: string | null | undefined): boolean => planTier === ENTERPRISE_TIER;

/** A havidíj-lépcsők száma (min..max, step-enként, mindkét vég benne). */
export function feeSteps(rule: DedicatedRule): number {
  return Math.max(1, Math.floor((rule.fee_max_cents - rule.fee_min_cents) / Math.max(1, rule.fee_step_cents)) + 1);
}

/** A dedikált ügyfél havidíja az azonosítójából (determinisztikus, oszlop nélkül). */
export function dedicatedFeeCents(rule: DedicatedRule, customerId: number): number {
  // Knuth-féle szorzásos hash: a szomszédos id-k ne ugyanazt a díjat kapják.
  const h = Math.imul((customerId | 0) ^ 0x5bd1e995, 2654435761) >>> 0;
  return rule.fee_min_cents + (h % feeSteps(rule)) * rule.fee_step_cents;
}

/** Egy nagy ügyfél havidíja a tier szerint: a nagyvállalati a saját sávjából (EnterpriseRule), különben a dedikált. */
export function bigClientFeeCents(rules: Pick<EconomyRules, 'dedicated' | 'enterprise'>, customerId: number, planTier: string | null | undefined): number {
  const e = rules.enterprise;
  if (isEnterpriseCustomer(planTier) && e) {
    return dedicatedFeeCents({ fee_min_cents: e.fee_min_cents, fee_max_cents: e.fee_max_cents, fee_step_cents: e.fee_step_cents } as DedicatedRule, customerId);
  }
  return rules.dedicated ? dedicatedFeeCents(rules.dedicated, customerId) : 0;
}

/** Jelentkezhet-e most nagyvállalati ügyfél (a szabad dedikált gépet és a várakozást a hívó nézi). */
export function enterpriseEligible(
  rule: EnterpriseRule | null | undefined,
  p: { era: number; reputation: number; cloud_regions: number; edge_pops: number },
): boolean {
  return !!rule && p.era >= rule.min_era && p.reputation >= rule.min_reputation
    && p.cloud_regions >= rule.min_cloud_regions && p.edge_pops >= rule.min_edge_pops;
}

/** Kitalált nagyvállalat-nevek (nyelvfüggetlenek). */
export const ENTERPRISE_CLIENT_NAMES = [
  'Polaris Retail Holdings', 'Quantum Ledger Payments', 'Transoceanic Logistics', 'Helios Mobility', 'Aurora Media Network',
  'Caldera Health Systems', 'Skyward Airlines', 'Evergreen Foods International', 'Lighthouse Learning', 'Continental Telecom Group',
] as const;

/** A sáv közepe (a katalógus „~$X/hó" felirata). */
export function dedicatedFeeMid(rule: DedicatedRule): number {
  return Math.round((rule.fee_min_cents + rule.fee_max_cents) / 2);
}

/** Tickenkénti esély, hogy jelentkezik egy nagy ügyfél (0, ha nincs szabad dedikált gép vagy kevés a hírnév). */
export function dedicatedArrivalProb(
  rules: EconomyRules,
  p: { free_boxes: number; reputation: number; now?: number; last_lost_at?: number | null },
): number {
  const d = rules.dedicated;
  if (!d || p.free_boxes <= 0 || p.reputation < d.min_reputation) return 0;
  // Rossz referencia: egy távozott nagy ügyfél után leave_cooldown_days napig senki nem jelentkezik.
  if (p.last_lost_at != null && p.now != null && p.now - p.last_lost_at < d.leave_cooldown_days * 86400) return 0;
  // Több szabad gép = több esély (de egy tickben legfeljebb egy jön).
  return Math.min(1, (d.arrival_per_day * p.free_boxes) / TICKS_PER_DAY);
}

/** A műszakbeli MI-értékelés (válasz) hatása a dedikált ügyfélre. */
export function dedicatedReplyDelta(rule: DedicatedRule, delta: number): number {
  return Math.round(delta >= 0 ? delta * rule.reply_gain_factor : delta * rule.reply_loss_factor);
}

/** A lezárás („close") hatása a dedikált ügyfélre. */
export function dedicatedCloseDelta(rule: DedicatedRule, satisfaction: number): number {
  const c = rule.close;
  if (satisfaction >= c.happy_at) return c.happy;
  if (satisfaction >= c.ok_at) return c.ok;
  if (satisfaction >= c.meh_at) return c.meh;
  return c.angry;
}

/** Hány dedikált gép van, és hány szabad (a dedikált ügyfelek számához képest). */
export function dedicatedBoxes(servers: Array<{ type: string }>, dedicatedCustomers: number): { boxes: number; free: number } {
  const boxes = servers.reduce((a, s) => a + (isDedicatedServer(s.type) ? 1 : 0), 0);
  return { boxes, free: Math.max(0, boxes - Math.max(0, dedicatedCustomers)) };
}

/** Kitalált cégnevek a nagy ügyfeleknek (nyelvfüggetlenek). */
export const DEDICATED_CLIENT_NAMES = [
  'Northwind Logistics', 'Brightline Media', 'Halcyon Insurance', 'Vantage Retail Group', 'Keystone Clinics',
  'Meridian Freight', 'Blue Harbor Bank', 'Atlas Ticketing', 'Copperleaf Foods', 'Silverpine Software',
  'Orion Travel', 'Granite Legal', 'Lumen Energy', 'Pioneer Pharma', 'Redwood Publishing',
] as const;

/** Nagy ügyfél jelleme: többnyire szakember („pro"), néha követelőző („karen"). */
export function pickDedicatedClient(r: () => number = Math.random, enterprise = false): { name: string; archetype: 'pro' | 'karen' } {
  const list: readonly string[] = enterprise ? ENTERPRISE_CLIENT_NAMES : DEDICATED_CLIENT_NAMES;
  const name = list[Math.floor(r() * list.length)];
  return { name, archetype: r() < 0.7 ? 'pro' : 'karen' };
}
