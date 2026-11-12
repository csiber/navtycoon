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

/**
 * 2026-11-12 (csapat-kör): opts.has_staff === false → a staff_drama kimarad (csapat nélkül nincs kiről szólnia).
 * Ha a hívó nem mondja meg (régi szabályok, régi hívások), a régi készlet marad.
 */
export function eventPoolForEra(era: number, opts: { has_staff?: boolean } = {}): ReadonlyArray<EventType> {
  const era2 = opts.has_staff === false ? EVENT_POOL_ERA2.filter((e) => e !== 'staff_drama') : EVENT_POOL_ERA2;
  if (era >= 3) return [...EVENT_POOL_BASE, ...era2, ...EVENT_POOL_ERA3];
  if (era >= 2) return [...EVENT_POOL_BASE, ...era2];
  return EVENT_POOL_BASE;
}
