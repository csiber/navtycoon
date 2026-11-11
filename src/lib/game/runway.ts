// src/lib/game/runway.ts
// Hyperscales — pénzáramlás és kifutás (runway) EGY helyen számolva (2026-11-11, UX-javítás).
//
// Korábban a sidebar „26 days"-t írt (sablon), a pénzügyi lap fix $15/nap égéssel számolt, a vezérlő a
// sablonból hozta. Most mindenki ezt hívja, és ugyanazt a szabályt követi, mint a tick (src/lib/game/tick.ts):
//   bevétel / nap = MRR / 30  (a tick 5 percenként MRR × 5 / (60·24·30)-at ír jóvá)
//   kiadás  / nap = PPC-hirdetés: PPC_FULL_COST_PER_TICK_CENTS × ppc% × (napi tickek száma)
// A szerverek havidíja (monthly_cost_cents) jelenleg NEM vonódik le a tickben — ezért itt sem számoljuk.
// TODO: ha a tick elkezdi levonni a szerver-havidíjat, itt is vegyük fel (serverMonthlyCents).

import { PPC_FULL_COST_PER_TICK_CENTS, TICK_MINUTES } from './tick';

export const TICKS_PER_DAY = (24 * 60) / TICK_MINUTES;

export interface CashFlowInput {
  cash_usd_cents: number;
  mrr_usd_cents: number;
  marketing_ppc_pct: number;
}

export interface CashFlow {
  /** Napi bevétel (centben). */
  income_per_day_cents: number;
  /** Napi kiadás (centben). */
  cost_per_day_cents: number;
  /** income − cost (centben); negatív = fogy a pénz. */
  net_per_day_cents: number;
  /** Ennyi nap múlva fogy el a pénz; null, ha nem fogy (nettó ≥ 0). */
  runway_days: number | null;
}

export function dailyCashFlow(p: CashFlowInput): CashFlow {
  const income = Math.round(p.mrr_usd_cents / 30);
  const ppcPct = Math.max(0, Math.min(100, p.marketing_ppc_pct || 0));
  const cost = Math.round(PPC_FULL_COST_PER_TICK_CENTS * (ppcPct / 100) * TICKS_PER_DAY);
  const net = income - cost;
  let runway: number | null = null;
  if (net < 0) runway = Math.max(0, Math.floor(Math.max(0, p.cash_usd_cents) / -net));
  return { income_per_day_cents: income, cost_per_day_cents: cost, net_per_day_cents: net, runway_days: runway };
}
