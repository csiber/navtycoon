// src/lib/game/upgrade-effects.ts
// Hyperscales — a fejlesztések (upgrade-tree.ts) MÉRHETŐ játékhatása EGY helyen (2026-11-12, játékmag-kör).
//
// Korábban az effect_data csak szöveg volt: a fejlesztés pénzt vitt, de semmit nem változtatott. Most a tick
// (tick.ts), a műszak (api/shift/start.ts, shift-room DO), a kijelzés (runway.ts, kutatás-lap) és a
// szimulátor (economy-sim.ts) is ezt hívja, így amit a kártya mond, az történik is.
//
// A hatások összeadódnak (két −25%-os ticket-fejlesztés = −50%), de mindegyiknek van korlátja (EFFECT_LIMITS),
// hogy semmi ne nullázza ki teljesen a játék egy részét.

import type { EventType } from './types';
import { UPGRADE_SPECS } from './upgrade-tree';

/** A fejlesztések hatás-kulcsai. A számok százalékok (pct), kivéve a shift_slots és ai_calls (darab). */
export type EffectKey =
  | 'capacity_pct'   // több ügyfélhely gépenként
  | 'ticket_pct'     // kevesebb ticket (negatív)
  | 'churn_pct'      // kisebb lemorzsolódás (negatív)
  | 'fee_pct'        // olcsóbb szerver-havidíj (negatív)
  | 'acq_pct'        // több új ügyfél (SEO/PPC/ajánlás)
  | 'mrr_pct'        // több bevétel ügyfelenként
  | 'shift_slots'    // +N ticket fér egy műszakba
  | 'ai_calls'       // +N MI-hívás naponta
  | 'avoid_hardware' // a hardver-események (hűtés, áram) N%-a elmarad
  | 'avoid_security' // a betörés-események N%-a elmarad
  | 'avoid_network'  // a DDoS-események N%-a elmarad
  | 'avoid_dataloss';// az adatvesztés-események (gyakornok) N%-a elmarad

export const EFFECT_KEYS: readonly EffectKey[] = [
  'capacity_pct', 'ticket_pct', 'churn_pct', 'fee_pct', 'acq_pct', 'mrr_pct', 'shift_slots', 'ai_calls',
  'avoid_hardware', 'avoid_security', 'avoid_network', 'avoid_dataloss',
];

export type UpgradeEffects = Record<EffectKey, number>;

export const NO_EFFECTS: UpgradeEffects = Object.freeze(Object.fromEntries(EFFECT_KEYS.map((k) => [k, 0]))) as UpgradeEffects;

/** Az összegzett hatás korlátai: [min, max]. */
export const EFFECT_LIMITS: Record<EffectKey, [number, number]> = {
  capacity_pct: [0, 200],
  ticket_pct: [-60, 0],
  churn_pct: [-60, 0],
  fee_pct: [-50, 0],
  acq_pct: [0, 100],
  mrr_pct: [0, 50],
  shift_slots: [0, 10],
  ai_calls: [0, 100],
  avoid_hardware: [0, 90],
  avoid_security: [0, 90],
  avoid_network: [0, 90],
  avoid_dataloss: [0, 90],
};

/** Melyik eseményt melyik „elkerülés"-hatás véd ki. */
export const EVENT_AVOID_KEY: Partial<Record<EventType, EffectKey>> = {
  cooling_failure: 'avoid_hardware',
  electricity_spike: 'avoid_hardware',
  security_breach: 'avoid_security',
  ddos_attempt: 'avoid_network',
  intern_incident: 'avoid_dataloss',
};

const clampKey = (k: EffectKey, v: number): number => Math.max(EFFECT_LIMITS[k][0], Math.min(EFFECT_LIMITS[k][1], v));

/** A birtokolt fejlesztések összesített hatása (ismeretlen id-t és ismeretlen kulcsot kihagy). */
export function effectsOf(ownedIds: Iterable<string>): UpgradeEffects {
  const sum: UpgradeEffects = { ...NO_EFFECTS };
  const owned = new Set(ownedIds);
  for (const u of UPGRADE_SPECS) {
    if (!owned.has(u.id)) continue;
    for (const [k, v] of Object.entries(u.effect_data)) {
      if ((EFFECT_KEYS as readonly string[]).includes(k)) sum[k as EffectKey] += v;
    }
  }
  for (const k of EFFECT_KEYS) sum[k] = clampKey(k, sum[k]);
  return sum;
}

/** Szorzó egy pct-hatásból: −25 → 0,75; +50 → 1,5. */
export const pctFactor = (pct: number): number => Math.max(0, 1 + pct / 100);

/** Ekkora eséllyel marad el (véd ki egy fejlesztés) egy kisorsolt esemény (0..1). */
export function eventAvoidProb(type: EventType, eff: UpgradeEffects): number {
  const k = EVENT_AVOID_KEY[type];
  return k ? Math.max(0, Math.min(0.9, eff[k] / 100)) : 0;
}

/** A DB-ből: a játékos fejlesztései → hatások (egy lekérdezés). */
export async function loadUpgradeEffects(
  db: { prepare(sql: string): { bind(...a: unknown[]): { all<T = unknown>(): Promise<{ results?: T[] }> } } },
  playerId: string,
): Promise<UpgradeEffects> {
  const rows = (await db.prepare('SELECT upgrade_id FROM upgrades WHERE player_id = ?').bind(playerId)
    .all<{ upgrade_id: string }>()).results ?? [];
  return effectsOf(rows.map((r) => r.upgrade_id));
}

/** 2026-11-12 (csapat- és hálózat-kör): a fejlesztések hatásához hozzáadja a csapat (staff.ts) és a hálózat
 *  (network.ts) hatását ugyanazokon a kulcsokon, ugyanazokkal a korlátokkal. */
export function combineEffects(base: UpgradeEffects, ...extras: Array<Partial<UpgradeEffects>>): UpgradeEffects {
  const sum: UpgradeEffects = { ...base };
  let touched = false;
  for (const e of extras) {
    for (const [k, v] of Object.entries(e)) {
      if (!(EFFECT_KEYS as readonly string[]).includes(k) || !v) continue;
      sum[k as EffectKey] += v;
      touched = true;
    }
  }
  if (!touched) return base;
  for (const k of EFFECT_KEYS) sum[k] = clampKey(k, sum[k]);
  return sum;
}
