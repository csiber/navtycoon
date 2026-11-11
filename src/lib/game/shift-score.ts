// src/lib/game/shift-score.ts
// A műszak értékelése (1–3 csillag) és a záróképernyő tippje. Tiszta függvények: a ShiftRoomDO a
// shift_end üzenetbe teszi, a kliens (src/scripts/shift) ugyanezt használja, így a kettő nem csúszhat el.

export interface ShiftOutcome {
  /** Lezárt ticketek száma. */
  resolved: number;
  /** A műszakba felvett ticketek száma. */
  total: number;
  /** Az ügyfél-elégedettség változásainak összege a műszak alatt. */
  satisfaction_total: number;
  /** Kifizetett visszatérítés + eszkaláció, centben. */
  refunds_cents: number;
}

export type ShiftTip = 'unresolved' | 'mood' | 'refunds' | 'great' | 'empty';

/** Ticketenkénti „drága" határ: efölött a pénzszórás már a csillagokból is levon. */
export const COSTLY_PER_TICKET_CENTS = 500;

/**
 * Pontszám 0–100:
 *  - 60 pont: a lezárt ticketek aránya,
 *  - 30 pont: az átlagos elégedettség-változás ticketenként (−20 → 0 pont, +30 → 30 pont, lineárisan),
 *  - 10 pont: ha ticketenként átlagosan legfeljebb $5 ment el visszatérítésre/eszkalációra.
 */
export function shiftScore(o: ShiftOutcome): number {
  if (o.total <= 0 || o.resolved <= 0) return 0;
  const ratio = Math.min(1, o.resolved / o.total);
  const avgSat = o.satisfaction_total / o.resolved;
  const satPart = (Math.max(-20, Math.min(30, avgSat)) + 20) / 50;
  const thrifty = o.refunds_cents / o.resolved <= COSTLY_PER_TICKET_CENTS ? 1 : 0;
  return Math.round(ratio * 60 + satPart * 30 + thrifty * 10);
}

/** 3 csillag ≥ 88 pont (minden lezárva ÉS érezhetően jobb kedvű ügyfelek), 2 csillag ≥ 60, különben 1.
 *  A puszta „mindent lezárok” (+5/ticket) 85 pont → 2 csillag: a harmadikhoz beszélgetni kell. */
export function shiftStars(o: ShiftOutcome): 1 | 2 | 3 {
  const sc = shiftScore(o);
  return sc >= 88 ? 3 : sc >= 60 ? 2 : 1;
}

/** Egyetlen, a leggyengébb pontra mutató tipp a záróképernyőre. */
export function shiftTip(o: ShiftOutcome): ShiftTip {
  if (o.resolved <= 0) return 'empty';
  if (o.resolved < o.total) return 'unresolved';
  if (o.satisfaction_total / o.resolved < 0) return 'mood';
  if (o.refunds_cents / o.resolved > COSTLY_PER_TICKET_CENTS) return 'refunds';
  return 'great';
}

/** Másodpercek a következő napi műszak-keret visszaállásáig (UTC éjfél, lásd tick.ts 0. lépés). */
export function secondsUntilShiftReset(nowSec: number): number {
  return (Math.floor(nowSec / 86400) + 1) * 86400 - nowSec;
}
