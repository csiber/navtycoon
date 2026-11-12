// src/lib/game/runway.ts
// Hyperscales — pénzáramlás és kifutás (runway) EGY helyen számolva (2026-11-11, UX-javítás).
//
// Korábban a sidebar „26 days"-t írt (sablon), a pénzügyi lap fix $15/nap égéssel számolt, a vezérlő a
// sablonból hozta. Most mindenki ezt hívja, és ugyanazt a szabályt követi, mint a tick (src/lib/game/tick.ts):
//   bevétel / nap = MRR / 30  (a tick 5 percenként MRR × 5 / (60·24·30)-at ír jóvá)
//   kiadás  / nap = PPC-hirdetés: PPC_FULL_COST_PER_TICK_CENTS × ppc% × (napi tickek száma)
//                 + szerver-havidíj / 30 (2026-11-12 óta a tick levonja; a fejlesztések fee_pct-jével)
//
// 2026-11-12 (egyensúly): a PPC-költés a megfizethetőhöz igazodik (economy.ppcSpendPerTick), és a $200-os
// tartalék alá sosem visz. A kifutás ezért „hány nap múlva éri el a pénz a tartalékot", nem a nullát; a
// tartalékon a hirdetés legfeljebb a bevétel felét költi, így ott már nem fogy a pénz.
//
// 2026-11-12 (játékmag): a havidíj a tartalék alatt is fogy, egészen a tartozás-határig (−debt_limit). Ha a
// nettó negatív, a kifutás a tartalékig (vagy, ha a havidíj magában is több a bevételnél, a tartozás-határig)
// hátralévő napok száma.
//
// 2026-11-12 (csapat- és hálózat-kör): a bérek és a hálózat havidíja ugyanúgy fix költség, mint a szerver-havidíj
// (a tick együtt vonja le őket), ezért a kiadásban és a kifutásban is benne vannak.

import { ECONOMY, TICKS_PER_DAY, ppcSpendPerTick, effectiveMonthlyFees, type EconomyRules } from './economy';

export { TICKS_PER_DAY };

export interface CashFlowInput {
  cash_usd_cents: number;
  mrr_usd_cents: number;
  marketing_ppc_pct: number;
  /** A gépek listázott havidíja összesen (servers.monthly_cost_cents összege; a kezdőgépé 0). */
  server_monthly_cents?: number;
  /** A fejlesztések fee_pct-je (negatív = olcsóbb). */
  fee_pct?: number;
  /** A csapat havi bére összesen (cent). */
  staff_monthly_cents?: number;
  /** A hálózat havidíja (cent). */
  network_monthly_cents?: number;
}

export interface CashFlow {
  /** Napi bevétel (centben). */
  income_per_day_cents: number;
  /** Napi kiadás (centben) a mostani pénz- és bevételi szinten (hirdetés + havidíj). */
  cost_per_day_cents: number;
  /** Ebből a hirdetés (centben / nap). */
  ppc_per_day_cents: number;
  /** Ebből a szerver-havidíj (centben / nap, a fejlesztésekkel csökkentve). */
  servers_per_day_cents: number;
  /** Ebből a bérek és a hálózat (centben / nap). */
  staff_per_day_cents: number;
  network_per_day_cents: number;
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
  const ppc = spend.cost_cents * TICKS_PER_DAY;
  const servers = rules.server_fees
    ? Math.round(effectiveMonthlyFees(p.server_monthly_cents ?? 0, rules.upgrade_effects ? p.fee_pct ?? 0 : 0) / 30)
    : 0;
  const staff = rules.server_fees ? Math.round(Math.max(0, p.staff_monthly_cents ?? 0) / 30) : 0;
  const network = rules.server_fees ? Math.round(Math.max(0, p.network_monthly_cents ?? 0) / 30) : 0;
  const fixed = servers + staff + network;
  const cost = ppc + fixed;
  const net = income - cost;
  let runway: number | null = null;
  if (net < 0) {
    // A tartalék alatt a hirdetés leáll, csak a havidíj fogy tovább: ha a bevétel fedezi, a tartalékig számolunk,
    // különben a tartozás-határig.
    const reserve = rules.ppc_budget?.reserve_cents ?? 0;
    const feesOutrunIncome = income - fixed < 0;
    const floor = feesOutrunIncome ? -rules.debt_limit_cents : reserve;
    runway = Math.max(0, Math.floor(Math.max(0, p.cash_usd_cents - floor) / -net));
  }
  return {
    income_per_day_cents: income, cost_per_day_cents: cost, net_per_day_cents: net,
    ppc_per_day_cents: ppc, servers_per_day_cents: servers, staff_per_day_cents: staff, network_per_day_cents: network,
    runway_days: runway, ppc_throttled: spend.throttled,
  };
}
