// src/lib/game/event-pool.ts
// Véletlen események: korszakonkénti készlet (az esély: economy.ts random_event_prob_per_tick). A tick.ts és a szimulátor (economy-sim.ts) is innen
// veszi, hogy a kettő ne csúszhasson el (2026-11-12: a tick.ts-ből kiemelve, változatlan értékekkel).
//
// Era 1: alap események; Era 2+: compliance_audit + staff_drama; Era 3+: competitor_buyout.

import type { EventType } from './types';


const EVENT_POOL_BASE: ReadonlyArray<EventType> = [
  'ddos_attempt',
  'viral_blog',
  'electricity_spike',
  'recruit_ad',
  'intern_incident',
  'dmca',
  'cooling_failure',
  'security_breach',
];
const EVENT_POOL_ERA2: ReadonlyArray<EventType> = ['compliance_audit', 'staff_drama'];
const EVENT_POOL_ERA3: ReadonlyArray<EventType> = ['competitor_buyout'];

export function eventPoolForEra(era: number): ReadonlyArray<EventType> {
  if (era >= 3) return [...EVENT_POOL_BASE, ...EVENT_POOL_ERA2, ...EVENT_POOL_ERA3];
  if (era >= 2) return [...EVENT_POOL_BASE, ...EVENT_POOL_ERA2];
  return EVENT_POOL_BASE;
}
