// src/lib/game/shift-state.ts
import type { PersonaArchetype } from './types';

export interface ShiftCustomerState {
  ticket_id: number;
  customer_id: number;
  customer_name: string;
  archetype: PersonaArchetype;
  current_satisfaction: number;
  ticket_subject: string;
  conversation: { role: 'customer' | 'player'; text: string; ts: number }[];
  status: 'pending' | 'active' | 'resolved' | 'abandoned';
  satisfaction_delta_total: number;
  refund_given_cents: number;
}

export interface ShiftState {
  shift_id: string;
  player_id: string;
  started_at: number;
  expires_at: number;
  status: 'active' | 'completed' | 'expired' | 'abandoned';
  queue: ShiftCustomerState[];
  active_index: number;
  tickets_handled: number;
}

export const SHIFT_DURATION_SEC = 30 * 60;

export function isShiftExpired(s: ShiftState, now: number): boolean {
  return now >= s.expires_at && s.status === 'active';
}

export function getActiveCustomer(s: ShiftState): ShiftCustomerState | null {
  if (s.active_index < 0 || s.active_index >= s.queue.length) return null;
  return s.queue[s.active_index];
}

// A következő megoldatlan ticket (pending VAGY félbehagyott active), körbefordulva a sor végén.
// Korábban csak előre és csak 'pending'-et keresett: ha a játékos átkattintott egy későbbi ticketre és azt
// zárta le, a korábbi (és az otthagyott 'active') ticketek kimaradtak, a műszak idő előtt véget ért.
export function advanceToNext(s: ShiftState): boolean {
  const n = s.queue.length;
  const from = s.active_index >= 0 ? s.active_index : -1;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (i === s.active_index) continue;
    const st = s.queue[i].status;
    if (st === 'pending' || st === 'active') {
      s.active_index = i;
      s.queue[i].status = 'active';
      return true;
    }
  }
  s.active_index = -1;
  return false;
}

/** A műszak végén megoldatlanul maradt ticketek (ezeket a DB-ben vissza kell nyitni 'open'-re). */
export function unresolvedTicketIds(s: ShiftState): number[] {
  return s.queue.filter((c) => c.status === 'pending' || c.status === 'active').map((c) => c.ticket_id);
}

/** Kézi ticket-váltás: a cél aktív lesz, az előző (ha nem zárult le) visszakerül a várakozók közé. */
export function switchTo(s: ShiftState, index: number): boolean {
  if (index < 0 || index >= s.queue.length) return false;
  const target = s.queue[index];
  if (target.status !== 'pending' && target.status !== 'active') return false;
  const prev = s.queue[s.active_index];
  if (prev && prev !== target && prev.status === 'active') prev.status = 'pending';
  target.status = 'active';
  s.active_index = index;
  return true;
}
