// src/lib/game/runway.ts
// Hyperscales — pénzáramlás és kifutás (runway) EGY helyen számolva (2026-11-11, UX-javítás).
//
// Korábban a sidebar „26 days"-t írt (sablon), a pénzügyi lap fix $15/nap égéssel számolt, a vezérlő a
// sablonból hozta. Most mindenki ezt hívja, és ugyanazt a szabályt követi, mint a tick (src/lib/game/tick.ts):
//   bevétel / nap = MRR / 30  (a tick 5 percenként MRR × 5 / (60·24·30)-at ír jóvá)
//   kiadás  / nap = PPC-hirdetés: PPC_FULL_COST_PER_TICK_CENTS × ppc% × (napi tickek száma)
// A szerverek havidíja (monthly_cost_cents) jelenleg NEM vonódik le a tickben — ezért itt sem számoljuk.
// TODO: ha a tick elkezdi levonni a szerver-havidíjat, itt is vegyük fel (serverMonthlyCents).
//
// 2026-11-12 (egyensúly): a PPC-költés a megfizethetőhöz igazodik (economy.ppcSpendPerTick), és a $200-os
// tartalék alá sosem visz. A kifutás ezért „hány nap múlva éri el a pénz a tartalékot", nem a nullát; a
// tartalékon a hirdetés legfeljebb a bevétel felét költi, így ott már nem fogy a pénz.

import { ECONOMY, TICKS_PER_DAY, ppcSpendPerTick, type EconomyRules } from './economy';

export { TICKS_PER_DAY };

export interface CashFlowInput {
  cash_usd_cents: number;
  mrr_usd_cents: number;
  marketing_ppc_pct: number;
}

export interface CashFlow {
  /** Napi bevétel (centben). */
  income_per_day_cents: number;
  /** Napi kiadás (centben) a mostani pénz- és bevételi szinten. */
  cost_per_day_cents: number;
  /** income − cost (centben); negatív = fogy a pénz. */
  net_per_day_cents: number;
  /** Ennyi nap múlva éri el a pénz a tartalékot; null, ha nem fogy (nettó ≥ 0). */
  runway_days: number | null;
  /** true, ha a költségkeret miatt a hirdetés most kevesebbet költ, mint a beállított PPC-arány kérné. */
  ppc_throttled: boolean;
}

export function dailyCashFlow(p: CashFlowInput, rules: EconomyRules = ECONOMY): CashFlow {
  const income = Math.round(p.mrr_usd_cents / 30);
  const spend = ppcSpendPerTick(rules, {
    ppc_pct: p.marketing_ppc_pct, cash_cents: p.cash_usd_cents, mrr_cents: p.mrr_usd_cents,
  });
  const cost = spend.cost_cents * TICKS_PER_DAY;
  const net = income - cost;
  const floor = rules.ppc_budget?.reserve_cents ?? 0;
  let runway: number | null = null;
  if (net < 0) runway = Math.max(0, Math.floor(Math.max(0, p.cash_usd_cents - floor) / -net));
  return {
    income_per_day_cents: income, cost_per_day_cents: cost, net_per_day_cents: net,
    runway_days: runway, ppc_throttled: spend.throttled,
  };
}
