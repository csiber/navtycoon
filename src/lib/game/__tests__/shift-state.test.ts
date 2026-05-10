// src/lib/game/__tests__/shift-state.test.ts
import { describe, it, expect } from 'vitest';
import { isShiftExpired, getActiveCustomer, advanceToNext, type ShiftState } from '../shift-state';

const baseState = (): ShiftState => ({
  shift_id: 's1', player_id: 'p1', started_at: 1000, expires_at: 2000,
  status: 'active', tickets_handled: 0, active_index: 0,
  queue: [
    { ticket_id: 1, customer_id: 1, customer_name: 'A', archetype: 'karen', current_satisfaction: 30, ticket_subject: 't', conversation: [], status: 'active', satisfaction_delta_total: 0, refund_given_cents: 0 },
    { ticket_id: 2, customer_id: 2, customer_name: 'B', archetype: 'newbie', current_satisfaction: 60, ticket_subject: 't', conversation: [], status: 'pending', satisfaction_delta_total: 0, refund_given_cents: 0 },
    { ticket_id: 3, customer_id: 3, customer_name: 'C', archetype: 'pro', current_satisfaction: 50, ticket_subject: 't', conversation: [], status: 'pending', satisfaction_delta_total: 0, refund_given_cents: 0 },
  ],
});

describe('shift-state', () => {
  it('isShiftExpired triggers after expires_at', () => {
    const s = baseState();
    expect(isShiftExpired(s, 1500)).toBe(false);
    expect(isShiftExpired(s, 2000)).toBe(true);
    s.status = 'completed';
    expect(isShiftExpired(s, 5000)).toBe(false);
  });

  it('getActiveCustomer returns active', () => {
    const s = baseState();
    expect(getActiveCustomer(s)?.customer_id).toBe(1);
    s.active_index = -1;
    expect(getActiveCustomer(s)).toBeNull();
  });

  it('advanceToNext moves to next pending and marks active', () => {
    const s = baseState();
    s.queue[0].status = 'resolved';
    const ok = advanceToNext(s);
    expect(ok).toBe(true);
    expect(s.active_index).toBe(1);
    expect(s.queue[1].status).toBe('active');
  });

  it('advanceToNext returns false when no more pending', () => {
    const s = baseState();
    s.queue.forEach(q => q.status = 'resolved');
    const ok = advanceToNext(s);
    expect(ok).toBe(false);
    expect(s.active_index).toBe(-1);
  });
});
