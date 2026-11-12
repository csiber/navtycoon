// src/lib/play/finance-page.ts
// Hyperscales — a /play/finance tartalma szerveroldalon, valós adatból (2026-11-11).
// Korábban: fix „$15/nap égés", 26 napos kifutás, $19-es kitalált számlák (#T-1000…), sablon-grafikon.
// Most: a pénzáramlás a tick valós szabályaiból (dailyCashFlow), napi bontás, és a valódi pénzmozgások
// (visszatérítések a műszakokból, döntések pénzhatása az eseményekből).

import { esc, usd, usd2, type ShellData } from './shell';
import { pt, type PlayKey } from './strings';
import { tip } from './dashboard';
import { ago, eventLine, type FeedEvent } from './events';
import { ECONOMY } from '../game/economy';

export interface FinanceData {
  shell: ShellData;
  now: number;
  activeCustomers: number;
  avgLtvCents: number;
  ppcPct: number;
  serverFeesListedCents: number;
  /** Fizetős (nem ingyenes) gépek száma. */
  paidServers?: number;
  /** Pénzzel járó események (legújabb elöl). */
  moneyEvents: Array<FeedEvent & { cash_delta_cents: number }>;
}

export function renderFinanceContent(d: FinanceData): string {
  const s = d.shell;
  const L = s.locale;
  const f = s.flow;
  const runway = f.runway_days === null ? pt(L, 'runway.safe') : pt(L, 'runway.days', { n: f.runway_days });
  const card = (cls: string, k: string, tipText: string, v: string, vCls: string, delta: string) => `
        <div class="kpi-card ${cls}">
          <div class="k">${esc(k)}${tip(tipText)}</div>
          <div class="v ${vCls}">${esc(v)}</div>
          <div class="delta flat">${esc(delta)}</div>
        </div>`;
  const kpis = `<div class="kpis full">
      ${card(f.runway_days !== null && f.runway_days < 14 ? 'red' : 'green', pt(L, 'top.cash'), pt(L, 'tip.cash'), usd(s.cashCents), '', pt(L, 'fin.runway', { v: runway }))}
      ${card('', 'MRR', pt(L, 'tip.mrr'), usd(s.mrrCents), '', pt(L, 'cust.count', { n: d.activeCustomers }))}
      ${card('green', pt(L, 'fin.income'), pt(L, 'fin.tip.income'), usd2(f.income_per_day_cents), 'good', pt(L, 'fin.per_day'))}
      ${card(f.cost_per_day_cents > 0 ? 'red' : '', pt(L, 'fin.spend'), pt(L, 'fin.tip.spend'), usd2(f.cost_per_day_cents), f.cost_per_day_cents > 0 ? 'bad' : '', pt(L, 'fin.per_day'))}
      ${card('', pt(L, 'fin.ltv'), pt(L, 'tip.ltv'), usd2(d.avgLtvCents), '', pt(L, 'fin.ltv_meta'))}
    </div>`;

  const row = (lbl: string, sub: string, v: string, cls: string) =>
    `<tr><td class="lbl">${esc(lbl)}${sub ? `<div class="fin-sub">${esc(sub)}</div>` : ''}</td><td class="${cls}">${esc(v)}</td></tr>`;
  const breakdown = `
      <section class="panel">
        <div class="ph"><h3>${esc(pt(L, 'fin.breakdown'))}</h3><span class="ph-sub">// ${esc(pt(L, 'fin.per_day'))}</span></div>
        <div class="pnl-table"><table>
          <thead><tr><th>${esc(pt(L, 'fin.item'))}</th><th>${esc(pt(L, 'fin.per_day'))}</th></tr></thead>
          <tbody>
            ${row(pt(L, 'fin.row.subs'), pt(L, 'fin.row.subs_sub', { n: d.activeCustomers }), '+' + usd2(f.income_per_day_cents), 'pos')}
            ${row(pt(L, 'fin.row.ppc'), pt(L, 'fin.row.ppc_sub', { p: d.ppcPct }), (f.ppc_per_day_cents > 0 ? '−' : '') + usd2(f.ppc_per_day_cents), f.ppc_per_day_cents > 0 ? 'neg' : 'dim')}
            ${row(pt(L, 'fin.row.servers'),
              d.serverFeesListedCents > 0
                ? pt(L, 'fin.row.servers_sub', { n: d.paidServers ?? 0, v: usd(d.serverFeesListedCents) })
                  + (s.effects.fee_pct < 0 ? pt(L, 'fin.row.servers_disc', { p: Math.abs(s.effects.fee_pct) }) : '')
                : pt(L, 'fin.row.servers_free'),
              (f.servers_per_day_cents > 0 ? '−' : '') + usd2(f.servers_per_day_cents), f.servers_per_day_cents > 0 ? 'neg' : 'dim')}
            ${s.team && (s.team.staff.length > 0 || f.staff_per_day_cents > 0) ? row(pt(L, 'fin.row.staff'), pt(L, 'fin.row.staff_sub', { n: s.team.staff.length }),
              (f.staff_per_day_cents > 0 ? '−' : '') + usd2(f.staff_per_day_cents), f.staff_per_day_cents > 0 ? 'neg' : 'dim') : ''}
            ${s.team?.netOn ? row(pt(L, 'fin.row.network'), pt(L, 'fin.row.network_sub', { t: pt(L, (`nw.tier${s.team.network.transit_tier}`) as PlayKey) }),
              (f.network_per_day_cents > 0 ? '−' : '') + usd2(f.network_per_day_cents), f.network_per_day_cents > 0 ? 'neg' : 'dim') : ''}
            <tr class="total grand"><td class="lbl">${esc(pt(L, 'fin.row.net'))}</td><td class="${f.net_per_day_cents >= 0 ? 'pos' : 'neg'}">${esc((f.net_per_day_cents >= 0 ? '+' : '') + usd2(f.net_per_day_cents))}</td></tr>
          </tbody>
        </table></div>
        <div class="fin-hint">${esc(pt(L, f.net_per_day_cents < 0 ? 'fin.hint_burn' : 'fin.hint_ok'))} <a href="/play/marketing">${esc(pt(L, 'nav.marketing'))} →</a></div>
        ${d.serverFeesListedCents > 0 || (s.team?.staff.length ?? 0) > 0 || (s.team?.networkMonthlyCents ?? 0) > 0 ? `<div class="fin-debt">${esc(pt(L, 'fin.debt_note', { limit: usd(ECONOMY.debt_limit_cents), pct: ECONOMY.auto_sell_refund_pct }))}</div>` : ''}
      </section>`;

  const moves = d.moneyEvents.length === 0
    ? `<div class="fin-empty">${esc(pt(L, 'fin.no_moves'))}</div>`
    : d.moneyEvents.map((e) => {
      const line = eventLine(L, e);
      const c = e.cash_delta_cents;
      return `<div class="inv-row"><div class="av">${esc(line.ico)}</div><div><div class="name">${esc(line.text)}</div><div class="meta">${esc(ago(L, d.now - e.spawned_at))}</div></div><div></div><div class="amt" style="color:${c < 0 ? 'var(--pink)' : 'var(--mint)'}">${esc((c < 0 ? '−' : '+') + usd2(Math.abs(c)))}</div></div>`;
    }).join('');
  const ledger = `
      <section class="panel">
        <div class="ph"><h3>${esc(pt(L, 'fin.moves'))}</h3><span class="ph-sub">// ${esc(pt(L, 'fin.moves_sub', { n: d.moneyEvents.length }))}</span></div>
        <div class="fin-moves">${moves}</div>
      </section>`;

  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, 'nav.finance'))} <span class="count">${esc(pt(L, 'nav.locked_era', { n: s.era }))}</span></h1>
        <div class="sub">${esc(pt(L, 'fin.sub'))}</div>
      </div></div>
      ${kpis}
      <div class="layout">${breakdown}${ledger}</div>
    </div>`;
}
