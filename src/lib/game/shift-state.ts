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

export function advanceToNext(s: ShiftState): boolean {
  for (let i = s.active_index + 1; i < s.queue.length; i++) {
    if (s.queue[i].status === 'pending') {
      s.active_index = i;
      s.queue[i].status = 'active';
      return true;
    }
  }
  s.active_index = -1;
  return false;
}
