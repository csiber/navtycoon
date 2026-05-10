// src/lib/game/__tests__/action-handler.test.ts
import { describe, it, expect } from 'vitest';
import { applyAction } from '../action-handler';
import type { ShiftCustomerState } from '../shift-state';

const c = (sat: number): ShiftCustomerState => ({
  ticket_id: 1, customer_id: 1, customer_name: 'X', archetype: 'karen',
  current_satisfaction: sat, ticket_subject: 't', conversation: [],
  status: 'active', satisfaction_delta_total: 0, refund_given_cents: 0,
});

describe('applyAction', () => {
  it('refund_30 hobby = -150 cents, +10 sat, not-resolved', () => {
    const r = applyAction(c(40), 'refund_30', 'hobby');
    expect(r.cash_delta_cents).toBe(-150);
    expect(r.satisfaction_delta).toBe(10);
    expect(r.resolves_ticket).toBe(false);
  });

  it('refund_100 resolves ticket', () => {
    const r = applyAction(c(50), 'refund_100', 'business');
    expect(r.resolves_ticket).toBe(true);
    expect(r.cash_delta_cents).toBe(-1500);
  });

  it('escalate: $50 fee, +15 sat, resolves', () => {
    const r = applyAction(c(20), 'escalate', 'hobby');
    expect(r.cash_delta_cents).toBe(-5000);
    expect(r.satisfaction_delta).toBe(15);
    expect(r.resolves_ticket).toBe(true);
  });

  it('close on low-sat customer = -30 sat penalty', () => {
    const r = applyAction(c(20), 'close', 'hobby');
    expect(r.satisfaction_delta).toBe(-30);
  });

  it('close on satisfied customer = +5', () => {
    const r = applyAction(c(70), 'close', 'hobby');
    expect(r.satisfaction_delta).toBe(5);
  });
});
