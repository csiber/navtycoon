// src/lib/game/action-handler.ts
import type { ShiftCustomerState } from './shift-state';

export type ShiftAction = 'refund_30' | 'refund_50' | 'refund_100' | 'escalate' | 'investigate' | 'close';

export interface ActionResult {
  success: boolean;
  satisfaction_delta: number;
  cash_delta_cents: number;
  resolves_ticket: boolean;
  message: string;
}

const TIER_PRICE_CENTS = { hobby: 500, business: 1500, vps: 2500, dedicated: 12000 };

export function applyRefundAction(_c: ShiftCustomerState, percent: 30 | 50 | 100, planPriceCents: number): ActionResult {
  const refund = Math.round(planPriceCents * (percent / 100));
  const delta = percent === 100 ? 35 : percent === 50 ? 20 : 10;
  return {
    success: true,
    satisfaction_delta: delta,
    cash_delta_cents: -refund,
    resolves_ticket: percent === 100,
    message: `Refunded $${(refund / 100).toFixed(2)} (${percent}%)`,
  };
}

export function applyEscalateAction(_c: ShiftCustomerState): ActionResult {
  return {
    success: true,
    satisfaction_delta: 15,
    cash_delta_cents: -5000,
    resolves_ticket: true,
    message: 'Escalated to senior engineer ($50)',
  };
}

export function applyInvestigateAction(_c: ShiftCustomerState): ActionResult {
  return {
    success: true,
    satisfaction_delta: 5,
    cash_delta_cents: 0,
    resolves_ticket: false,
    message: 'Logs scanned. Findings shared.',
  };
}

export function applyCloseAction(c: ShiftCustomerState): ActionResult {
  const delta = c.current_satisfaction >= 50 ? 5 : c.current_satisfaction >= 30 ? 0 : -30;
  return {
    success: true,
    satisfaction_delta: delta,
    cash_delta_cents: 0,
    resolves_ticket: true,
    message: c.current_satisfaction < 30 ? 'Closed without resolution. They are FURIOUS.' : 'Ticket closed.',
  };
}

export function applyAction(c: ShiftCustomerState, action: ShiftAction, planTier: keyof typeof TIER_PRICE_CENTS): ActionResult {
  const price = TIER_PRICE_CENTS[planTier] ?? TIER_PRICE_CENTS.hobby;
  switch (action) {
    case 'refund_30': return applyRefundAction(c, 30, price);
    case 'refund_50': return applyRefundAction(c, 50, price);
    case 'refund_100': return applyRefundAction(c, 100, price);
    case 'escalate':  return applyEscalateAction(c);
    case 'investigate': return applyInvestigateAction(c);
    case 'close': return applyCloseAction(c);
  }
}
