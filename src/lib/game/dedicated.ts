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

import { TICKS_PER_DAY, type DedicatedRule, type EconomyRules } from './economy';

export const DEDICATED_SERVER_TYPE = 'dedicated_box';
export const DEDICATED_TIER = 'dedicated';

export const isDedicatedServer = (type: string): boolean => type === DEDICATED_SERVER_TYPE;
export const isDedicatedCustomer = (planTier: string | null | undefined): boolean => planTier === DEDICATED_TIER;

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
export function pickDedicatedClient(r: () => number = Math.random): { name: string; archetype: 'pro' | 'karen' } {
  const name = DEDICATED_CLIENT_NAMES[Math.floor(r() * DEDICATED_CLIENT_NAMES.length)];
  return { name, archetype: r() < 0.7 ? 'pro' : 'karen' };
}
