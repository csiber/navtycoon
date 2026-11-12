// src/lib/play/dashboard.ts
// Hyperscales — a vezérlő (/play) tartalma szerveroldalon, valós adatból, a játékos nyelvén (2026-11-11).
//
// Korábban a vezérlő egy dizájn-sablon volt kitalált számokkal („Forum mentions 4", „Last review ★★★",
// „SLA 99.61%", „TEMP 24°C", „$180 · in stock", hamis sparkline-ok), amit a kliens-JS próbált felülírni —
// ami kimaradt, hamis maradt. Most minden érték az adatbázisból jön; ahol nincs adat, őszinte üres állapot.
// A CSS-osztályok a régi sablonéi (index.astro pageCss), így a kinézet változatlan.

import { esc, usd, usd2, type ShellData, renderEraReqs } from './shell';
import { pt, type PlayLocale, type PlayKey } from './strings';
import { eventLine, ago, type FeedEvent } from './events';
import { serverName, upgradeName } from './catalog';
import { SERVER_SPECS, affordableServerTypes } from '../game/server-types';
import type { EraId } from '../game/types';
import { rackUnitStates, unit2d } from './rack-model';
import { localizePlaceholderTicket } from '../game/customer-spawn';

export interface DashCustomer {
  id: number; name: string; satisfaction: number; churn_risk: number; plan_tier: string;
}
export interface DashTicket {
  id: number; summary: string; created_at: number; cust_name: string | null; persona: string | null;
}
export interface DashServer { id: number; type: string; capacity: number; current_load: number }

export interface GettingStarted {
  ticket: boolean; server: boolean; price: boolean; marketing: boolean; research: boolean;
}

export interface DashboardData {
  shell: ShellData;
  now: number;
  customersAll: DashCustomer[];
  /** Az összes valaha volt ügyfél száma (aktív + távozott) — a lemorzsolódáshoz. */
  customersEver: number;
  tickets: DashTicket[];
  servers: DashServer[];
  /** Nyitott incidens-események típusa (a 3D rackkel egyező „leállt" gép a 2D-ben is). */
  openIncidents?: string[];
  events: FeedEvent[];
  shiftsLeftToday: number;
  gettingStarted: GettingStarted;
  cheapestUpgrade: { id: string; cost_cents: number } | null;
}

const ERA_NAME_KEYS: Record<number, PlayKey> = { 1: 'dash.era.name1', 2: 'dash.era.name2', 3: 'dash.era.name3', 4: 'dash.era.name4' };
const ERA_DESC_KEYS: Record<number, PlayKey> = { 1: 'dash.era.desc1', 2: 'dash.era.desc2', 3: 'dash.era.desc3', 4: 'dash.era.desc4' };

export function tip(text: string, extraCls = ''): string {
  return `<span class="tip${extraCls ? ' ' + extraCls : ''}" tabindex="0" role="note" aria-label="${esc(text)}" data-tip="${esc(text)}">?</span>`;
}

/** Nettó hangulat (−50…+50) az ügyfelek átlagos elégedettségéből. */
export function netMood(customers: Array<{ satisfaction: number }>): number {
  if (customers.length === 0) return 0;
  return Math.round(customers.reduce((a, c) => a + (c.satisfaction - 50), 0) / customers.length);
}

/** A hangulat-gyűrű színe: piros 0 alatt, borostyán 0–9, zöld 10 fölött (korábban −10-nél is zöld volt). */
export function moodColor(mood: number): string {
  if (mood < 0) return '#f43f5e';
  if (mood < 10) return '#f59e0b';
  return '#34d399';
}

function renderGettingStarted(L: PlayLocale, gs: GettingStarted): string {
  const items: Array<[keyof GettingStarted, PlayKey, string]> = [
    ['ticket', 'gs.ticket', '/play/shift'],
    ['server', 'gs.server', '/play/servers'],
    ['price', 'gs.price', '/play/pricing'],
    ['marketing', 'gs.marketing', '/play/marketing'],
    ['research', 'gs.research', '/play/research'],
  ];
  const done = items.filter(([k]) => gs[k]).length;
  const rows = items.map(([k, key, href]) => `
        <a class="gs-item${gs[k] ? ' done' : ''}" href="${href}"${k === 'ticket' ? ' data-open-shift="1"' : ''}>
          <span class="gs-check" aria-hidden="true"></span><span class="gs-lbl">${esc(pt(L, key))}</span><span class="gs-go">→</span>
        </a>`).join('');
  return `
    <section class="panel gs-panel" id="getting-started" data-done="${done}" data-total="${items.length}" hidden>
      <div class="ph">
        <h3>🧭 ${esc(pt(L, 'gs.title'))}</h3>
        <span class="ph-sub">// ${esc(pt(L, 'gs.progress', { done, total: items.length }))}</span>
        <div class="ph-right"><button type="button" class="gs-dismiss">${esc(pt(L, 'gs.dismiss'))}</button></div>
      </div>
      <div class="gs-bar"><i style="width:${Math.round((done / items.length) * 100)}%"></i></div>
      <div class="gs-body">${rows}
        ${done === items.length ? `<div class="gs-all">${esc(pt(L, 'gs.done_all'))}</div>` : ''}
      </div>
    </section>`;
}

export function renderDashboardContent(d: DashboardData): string {
  const s = d.shell;
  const L = s.locale;
  const active = d.customersAll;
  const paying = active.filter((c) => c.plan_tier === 'hobby' || c.plan_tier === 'business');
  const hobby = active.filter((c) => c.plan_tier === 'hobby').length;
  const business = active.filter((c) => c.plan_tier === 'business').length;
  const atRisk = active.filter((c) => c.churn_risk >= 50).length;
  const arpuCents = paying.length > 0 ? Math.round(s.mrrCents / paying.length) : 0;
  const churned = Math.max(0, d.customersEver - active.length);
  const churnPct = d.customersEver > 0 ? Math.round((churned / d.customersEver) * 100) : 0;
  const net = s.flow.net_per_day_cents;
  const runwayTxt = s.flow.runway_days === null ? pt(L, 'runway.safe') : pt(L, 'runway.days', { n: s.flow.runway_days });
  const repNeeded = s.era2?.reqs.find((r) => r.key === 'reputation')?.needed;

  // ─── KPI tiles (no fake sparklines: we keep no history yet) ───
  const kpis = `
      <div class="kpi cash">
        <div class="k">${esc(pt(L, 'top.cash'))}${tip(pt(L, 'tip.cash'))}</div>
        <div class="v"><span data-cash-cents="${s.cashCents}">${esc(usd(s.cashCents))}</span> <small class="${net < 0 ? 'dn' : ''}">${esc((net >= 0 ? '+' : '') + pt(L, 'top.per_day', { v: usd2(net).replace('−', '-') }))}</small></div>
        <div class="meta">${esc(pt(L, 'runway.label'))} <b>${esc(runwayTxt)}</b>${tip(pt(L, 'tip.runway'))}</div>
      </div>
      <div class="kpi mrr">
        <div class="k">MRR${tip(pt(L, 'tip.mrr'))}</div>
        <div class="v">${esc(usd2(s.mrrCents))}</div>
        <div class="meta">ARPU <b>${esc(usd2(arpuCents))}</b>${tip(pt(L, 'tip.arpu'))} · ${esc(pt(L, 'dash.kpi.churn'))} <b>${churnPct}%</b>${tip(pt(L, 'tip.churn'), 'tip-left')}</div>
      </div>
      <div class="kpi rep">
        <div class="k">${esc(pt(L, 'dash.kpi.rep'))}${tip(pt(L, 'tip.reputation'))}</div>
        <div class="v">${s.rep}<small>/100</small></div>
        <div class="meta">${repNeeded !== undefined
          ? esc(pt(L, 'dash.kpi.rep_next', { n: repNeeded, era: s.era2!.target_era }))
          : esc(pt(L, 'era.max'))}</div>
      </div>
      <div class="kpi cust">
        <div class="k">${esc(pt(L, 'top.customers'))}${tip(pt(L, 'tip.customers'))}</div>
        <div class="v">${active.length}${s.counts.newCustomers24h > 0 ? ` <small>${esc(pt(L, 'dash.kpi.new24', { n: s.counts.newCustomers24h }))}</small>` : ''}</div>
        <div class="meta">${esc(pt(L, 'dash.kpi.cust_meta', { h: hobby, b: business }))} · ${esc(pt(L, 'dash.kpi.at_risk'))} <b>${atRisk}</b></div>
      </div>`;

  // ─── Live event feed (last 24 h, translated on render) ───
  const recent = d.events.filter((e) => d.now - e.spawned_at <= 86400);
  const feedRows = recent.length === 0
    ? `<div class="feed-empty">${esc(pt(L, 'empty.no_events'))}</div>`
    : recent.map((e) => {
      const line = eventLine(L, e);
      return `<div class="event ${line.tone}"><div class="ts">${esc(ago(L, d.now - e.spawned_at))}</div><div class="ico">${esc(line.ico)}</div><div class="body">${esc(line.text)}</div><div class="impact">${esc(line.tag)}</div></div>`;
    }).join('');
  const feed = `
      <section class="panel feed">
        <div class="ph">
          <h3>${esc(pt(L, 'dash.feed.title'))}</h3>
          <span class="ph-sub">// ${esc(pt(L, 'dash.feed.sub', { n: recent.length }))}</span>
          <div class="ph-right"><a class="more" href="/play/devlog">${esc(pt(L, 'dash.feed.all'))}</a></div>
        </div>
        <div class="feed-body" id="feed">${feedRows}</div>
      </section>`;

  // ─── Fleet (real servers) ───
  // Állapot a 3D rackkel közös függvényből (rack-model): ≥ 70% borostyán, piros csak túlcsordulás / incidens.
  const { loaded, units: rackStates } = rackUnitStates(d.servers, active.length, d.openIncidents ?? []);
  const totalCap = loaded.totalCapacity;
  const rows: string[] = [];
  for (let i = 0; i < Math.max(5, d.servers.length) && i < 8; i++) {
    const sv = loaded.servers[i];
    const lbl = 'U' + (24 - i); // ugyanaz a számozás, mint a Szerverek lapon és a 3D racken
    if (sv) {
      const { util, state } = rackStates[i];
      const v = unit2d(state);
      rows.push(`<div class="u${v.row}" data-state="${state}"><span class="lbl">${lbl}</span><span class="name">${esc(serverName(L, sv.type, SERVER_SPECS[sv.type as keyof typeof SERVER_SPECS]?.display_name ?? sv.type))}</span><span class="leds"><i class="${v.leds[0]}"></i><i class="${v.leds[1]}"></i><i class="${v.leds[2]}"></i></span><span class="util">${util}%</span></div>`);
    } else {
      rows.push(`<div class="u empty"><span class="lbl">${lbl}</span><span class="name">${esc(pt(L, 'dash.fleet.empty'))}</span><span class="leds"><i></i><i></i><i></i></span><span class="util">—</span></div>`);
    }
  }
  const perServer = d.servers.length > 0 ? (active.length / d.servers.length).toFixed(1) : '0';
  const fleet = `
        <section class="panel">
          <div class="ph">
            <h3>${esc(pt(L, 'dash.fleet.title'))}</h3>
            <span class="ph-sub">// ${esc(pt(L, 'dash.fleet.sub', { n: d.servers.length }))}</span>
            <div class="ph-right"><a class="more" href="/play/servers">${esc(pt(L, 'dash.fleet.open'))}</a><button class="rack3d-toggle" type="button" data-rack3d-toggle hidden aria-pressed="false">3D</button></div>
          </div>
          <div class="rack3d-host" data-rack3d hidden style="--rack3d-h:300px"><span class="rack3d-hint">${esc(pt(L, 'r3.hint'))}</span></div>
          <div class="rack-body">${rows.join('')}</div>
          <div class="rack-foot">
            <div class="mini-stat"><div class="k">${esc(pt(L, 'dash.fleet.slots'))}</div><div class="v">${totalCap}</div></div>
            <div class="mini-stat"><div class="k">${esc(pt(L, 'dash.fleet.customers'))}</div><div class="v">${active.length}</div></div>
            <div class="mini-stat"><div class="k">${esc(pt(L, 'dash.fleet.per_server'))}</div><div class="v">${perServer}</div></div>
          </div>
        </section>`;

  // ─── Customer mood ───
  const mood = netMood(active);
  const moodSorted = [...active].sort((a, b) => a.satisfaction - b.satisfaction).slice(0, 6);
  const ring = 264;
  const offset = Math.round(ring - (ring * Math.max(0, Math.min(100, mood + 50))) / 100);
  const moodList = moodSorted.length === 0
    ? `<div class="mood-empty">${esc(pt(L, 'dash.mood.empty'))}</div>`
    : moodSorted.map((c) => {
      const m = c.satisfaction - 50;
      const cls = m >= 30 ? 'good' : m >= 0 ? 'ok' : m >= -30 ? 'warn' : 'bad';
      return `<div class="row"><span>${esc(c.name)}</span><div class="b"><i class="${cls}" style="width:${Math.max(8, Math.min(100, 50 + m))}%"></i></div><span class="v">${m > 0 ? '+' : ''}${m}</span></div>`;
    }).join('');
  const moodPanel = `
        <section class="panel">
          <div class="ph">
            <h3>${esc(pt(L, 'dash.mood.title'))}${tip(pt(L, 'tip.mood'), 'tip-left')}</h3>
            <span class="ph-sub">// ${esc(pt(L, 'dash.mood.sub', { n: active.length }))}</span>
          </div>
          <div class="mood-body">
            <div class="mood-ring">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="#1e2338" stroke-width="10" fill="none"/>
                <circle cx="50" cy="50" r="42" stroke="${moodColor(mood)}" stroke-width="10" fill="none" stroke-dasharray="${ring}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
              </svg>
              <div class="center"><div><div class="big" style="color:${moodColor(mood)}">${mood > 0 ? '+' : ''}${mood}</div><div class="lbl">${esc(pt(L, 'dash.mood.net'))}</div></div></div>
            </div>
            <div class="mood-list">${moodList}</div>
          </div>
        </section>`;

  // ─── Open tickets ───
  const tRows = d.tickets.length === 0
    ? `<div class="tickets-empty">${esc(pt(L, 'dash.tickets.empty'))}</div>`
    : d.tickets.map((t, i) => {
      const nm = t.cust_name ?? '?';
      const avCls = ['av-K', 'av-D', 'av-A', 'av-M', 'av-R'][i % 5];
      return `<a class="ticket-row" href="/play/tickets"><div class="av ${avCls}">${esc(nm.trim().charAt(0).toUpperCase() || '?')}</div><div class="info"><div class="who">${esc(nm)}</div><div class="msg">${esc(localizePlaceholderTicket(t.summary, L).slice(0, 90))}</div></div><span class="age">${esc(ago(L, d.now - t.created_at))}</span></a>`;
    }).join('');
  const ticketsPanel = `
      <section class="panel tickets-panel">
        <div class="ph">
          <h3>${esc(pt(L, 'dash.tickets.title'))}</h3>
          <span class="ph-sub">// ${esc(pt(L, 'dash.tickets.sub', { n: s.counts.openTickets }))}</span>
          <div class="ph-right"><a class="more" href="/play/tickets">${esc(pt(L, 'dash.tickets.inbox'))}</a></div>
        </div>
        <div class="tickets-body">${tRows}</div>
      </section>`;

  // ─── Quick actions (real prices) ───
  const buyable = affordableServerTypes(s.era as EraId).sort((a, b) => a.purchase_cost_cents - b.purchase_cost_cents);
  const cheapest = buyable[0];
  const canBuy = cheapest ? s.cashCents >= cheapest.purchase_cost_cents : false;
  const quick = `
      <section class="panel quick-panel">
        <div class="ph"><h3>${esc(pt(L, 'dash.quick.title'))}</h3></div>
        <div class="quick-body">
          <a class="quick buy" href="/play/servers">
            <div class="qico">+</div>
            <div class="body"><div class="title">${esc(pt(L, 'dash.quick.buy'))}</div>
              <div class="desc">${cheapest ? esc(serverName(L, cheapest.type, cheapest.display_name)) + ' · ' + esc(pt(L, 'dash.quick.slots', { n: cheapest.capacity })) : '—'}</div>
              <div class="price">${cheapest ? esc(usd(cheapest.purchase_cost_cents)) + ' · ' + esc(pt(L, canBuy ? 'dash.quick.affordable' : 'dash.quick.need_cash')) : ''}</div></div>
            <div class="arrow">→</div>
          </a>
          <a class="quick shift" href="/play/shift" data-open-shift="1">
            <div class="qico">▶</div>
            <div class="body"><div class="title">${esc(pt(L, 'dash.quick.shift'))}</div>
              <div class="desc">${esc(pt(L, 'dash.quick.shift_desc', { n: s.counts.openTickets }))}</div>
              <div class="price">${esc(pt(L, 'dash.quick.shifts_left', { n: d.shiftsLeftToday }))}</div></div>
            <div class="arrow">→</div>
          </a>
          <a class="quick market" href="/play/marketplace">
            <div class="qico">◈</div>
            <div class="body"><div class="title">${esc(pt(L, 'nav.marketplace'))}</div>
              <div class="desc">${esc(pt(L, 'dash.quick.market_desc'))}</div></div>
            <div class="arrow">→</div>
          </a>
          <a class="quick research" href="/play/research">
            <div class="qico">⚙</div>
            <div class="body"><div class="title">${esc(pt(L, 'nav.research'))}</div>
              <div class="desc">${d.cheapestUpgrade ? esc(upgradeName(L, d.cheapestUpgrade.id)) : esc(pt(L, 'dash.quick.research_none'))}</div>
              <div class="price">${d.cheapestUpgrade ? esc(usd(d.cheapestUpgrade.cost_cents)) : ''}</div></div>
            <div class="arrow">→</div>
          </a>
        </div>
      </section>`;

  // ─── Era progress (same source as the sidebar box) ───
  const ep = s.era2;
  const eraPanel = `
      <section class="panel era-panel">
        <div class="ph">
          <h3>${esc(pt(L, 'dash.era.title'))}</h3>
          ${ep ? `<span class="ph-sub">// ${esc(pt(L, 'era.title', { n: ep.target_era, name: ep.target_display }))}</span>` : ''}
          <div class="ph-right"><a class="more" href="/play/research">${esc(pt(L, 'dash.era.tree'))}</a></div>
        </div>
        <div class="era-body">
          <div class="era-hero">
            <div class="era-badge">${s.era}</div>
            <div>
              <div class="name">${esc(pt(L, ERA_NAME_KEYS[s.era] ?? 'dash.era.name1'))}</div>
              <div class="sub">${esc(pt(L, ERA_DESC_KEYS[s.era] ?? 'dash.era.desc1'))}</div>
              <div class="year">${esc(pt(L, 'company.sub', { year: s.founded, era: s.era, day: s.day }))}</div>
            </div>
          </div>
          ${ep ? `<div class="era-reqs era-reqs-card" style="margin:0;max-width:none">
            <div class="era-req-title">${esc(pt(L, 'era.requirements', { met: ep.met_count, total: ep.total }))}</div>
            ${renderEraReqs(L, ep)}
          </div>
          <div class="next-era">
            <div class="lock">🔒</div>
            <div class="name">${esc(pt(L, 'era.title', { n: ep.target_era, name: ep.target_display }))}</div>
            <div class="sub">${esc(pt(L, ERA_DESC_KEYS[ep.target_era] ?? 'dash.era.desc2'))}</div>
            <div class="progress"><i style="width:${Math.round((ep.met_count / Math.max(1, ep.total)) * 100)}%"></i></div>
            <div class="pct">${esc(pt(L, 'dash.era.pct', { met: ep.met_count, total: ep.total }))}</div>
          </div>` : `<div class="next-era"><div class="name">🏁 ${esc(pt(L, 'era.max'))}</div></div>`}
        </div>
      </section>`;

  // ─── Shift CTA (real numbers, no fake "3:42 AM") ───
  const shiftCta = `
      <section class="shift-cta">
        <div class="clock-big">${s.counts.openTickets}<small>${esc(pt(L, 'dash.shift.open'))}</small></div>
        <div>
          <h3>${esc(pt(L, s.counts.openTickets > 0 ? 'dash.shift.title' : 'dash.shift.title_none', { n: s.counts.openTickets }))}</h3>
          <p>${esc(pt(L, 'dash.shift.desc', { n: d.shiftsLeftToday }))}</p>
        </div>
        <button class="start" type="button" data-open-shift="1"${d.shiftsLeftToday <= 0 ? ' disabled' : ''}>▶ ${esc(pt(L, 'dash.shift.start'))}</button>
      </section>`;

  return `<div class="content">
      ${renderGettingStarted(L, d.gettingStarted)}
      ${kpis}
      ${feed}
      <div class="side-stack">${fleet}${moodPanel}</div>
      ${ticketsPanel}
      ${quick}
      ${eraPanel}
      ${shiftCta}
    </div>`;
}

export { applyContent as applyDashboardContent } from './shell';
