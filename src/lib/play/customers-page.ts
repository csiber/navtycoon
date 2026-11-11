// src/lib/play/customers-page.ts
// Hyperscales — a /play/customers tartalma szerveroldalon, valós adatból (2026-11-11).
// Korábban: „All · 5 / Paying · 2 / Trial · 1 / Leads · 1" fix szűrők (miközben 3 ügyfél volt), LTV $0,
// Karen Holloway beszélgetése, és „comes online after first cron-tick LLM run" fejlesztői szöveg.
// Most: a játékos ügyfelei (aktív + távozott), valós szűrő-számok, becsült élettartam-érték,
// és a valódi ticket-előzmény beszélgetésként (az ügyfél üzenete + a te lezárásod), barátságos üres állapottal.

import { esc, usd, usd2, type ShellData } from './shell';
import { pt, type PlayLocale, type PlayKey } from './strings';
import { ago } from './events';
import { tip } from './dashboard';
import { localizePlaceholderTicket } from '../game/customer-spawn';

export interface CustRow {
  id: number; name: string; persona_archetype: string; plan_tier: string; joined_at: number;
  satisfaction: number; churn_risk: number; is_active: number;
}
export interface CustTicket {
  id: number; customer_id: number; summary: string; full_text: string; status: string;
  resolution: string | null; created_at: number; resolved_at: number | null;
}

export interface CustomersPageData {
  shell: ShellData;
  now: number;
  customers: CustRow[];
  tickets: CustTicket[];
  prices: { hobby: number; business: number };
}

const PERSONAS = ['karen', 'newbie', 'pro', 'cheapskate', 'ghost', 'loyalist', 'drama', 'crypto'] as const;
const PORTRAITS: Record<string, string> = {
  karen: '/img/persona-karen.webp', newbie: '/img/persona-loyalist.webp', pro: '/img/persona-pro.webp',
  cheapskate: '/img/persona-cheapskate.webp', ghost: '/img/persona-ghost.webp', loyalist: '/img/persona-loyalist.webp',
  drama: '/img/persona-drama.webp', crypto: '/img/persona-crypto.webp',
};

export function personaLabel(L: PlayLocale, p: string): string {
  return (PERSONAS as readonly string[]).includes(p) ? pt(L, (`persona.${p}`) as PlayKey) : p;
}

export function planPrice(plan: string, prices: { hobby: number; business: number }): number {
  return plan === 'hobby' ? prices.hobby : plan === 'business' ? prices.business : 0;
}

/**
 * Becsült élettartam-érték: a havidíj × eltelt hónapok (a tick folyamatosan, 5 percenként írja jóvá a bevételt).
 * A customers.lifetime_value_cents oszlopot semmi nem frissíti, ezért nem azt mutatjuk.
 */
export function estimateLtvCents(priceCents: number, joinedAt: number, until: number): number {
  return Math.max(0, Math.round(priceCents * Math.max(0, until - joinedAt) / (30 * 86400)));
}

type Filter = 'all' | 'hobby' | 'business' | 'risk' | 'left';

export function renderCustomersContent(d: CustomersPageData): string {
  const s = d.shell;
  const L = s.locale;
  const sorted = [...d.customers].sort((a, b) => (b.is_active - a.is_active) || (a.satisfaction - b.satisfaction));
  const active = sorted.filter((c) => c.is_active === 1);
  const counts: Record<Filter, number> = {
    all: sorted.length,
    hobby: active.filter((c) => c.plan_tier === 'hobby').length,
    business: active.filter((c) => c.plan_tier === 'business').length,
    risk: active.filter((c) => c.churn_risk >= 50).length,
    left: sorted.filter((c) => c.is_active !== 1).length,
  };
  const filters = (Object.keys(counts) as Filter[])
    .filter((f) => f === 'all' || counts[f] > 0)
    .map((f, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-cf="${f}">${esc(pt(L, (`cust.f.${f}`) as PlayKey))} · ${counts[f]}</button>`)
    .join('');

  const byCust = new Map<number, CustTicket[]>();
  for (const t of d.tickets) {
    const arr = byCust.get(t.customer_id) ?? [];
    arr.push(t);
    byCust.set(t.customer_id, arr);
  }

  const rows = sorted.map((c, i) => {
    const mood = c.satisfaction - 50;
    const moodCls = c.is_active !== 1 ? 'muted' : mood >= 20 ? 'good' : mood >= 0 ? 'warn' : 'bad';
    const tags = [c.is_active !== 1 ? 'left' : '', c.churn_risk >= 50 && c.is_active === 1 ? 'risk' : '', c.plan_tier].filter(Boolean).join(' ');
    const price = planPrice(c.plan_tier, d.prices);
    return `<button type="button" class="cust-row${i === 0 ? ' selected' : ''}" data-cust="${c.id}" data-tags="${esc(tags)}">
            <div class="av av-${esc(c.name.charAt(0).toUpperCase())}${mood < -20 ? ' angry' : mood < 0 ? ' warn' : ''}">${esc(c.name.charAt(0).toUpperCase())}</div>
            <div><div class="name">${esc(c.name)}</div><div class="meta">${esc(pt(L, (`plan.${c.plan_tier}`) as PlayKey))} · ${esc(personaLabel(L, c.persona_archetype))}</div></div>
            <div class="right"><div class="mrr">${c.is_active === 1 ? esc(pt(L, 'srv.per_month', { v: usd(price) })) : '—'}</div><div class="mood ${moodCls}">${c.is_active === 1 ? (mood > 0 ? '+' : '') + mood : esc(pt(L, 'cust.left'))}</div></div>
          </button>`;
  }).join('');

  const profiles = sorted.map((c, i) => {
    const mood = c.satisfaction - 50;
    const price = c.is_active === 1 ? planPrice(c.plan_tier, d.prices) : 0;
    const ltv = estimateLtvCents(planPrice(c.plan_tier, d.prices), c.joined_at, d.now);
    const tks = (byCust.get(c.id) ?? []).sort((a, b) => a.created_at - b.created_at);
    const open = tks.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
    const pill = c.is_active !== 1 ? pt(L, 'cust.left') : c.churn_risk >= 50 ? pt(L, 'cust.pill.risk') : mood < 0 ? pt(L, 'cust.pill.watch') : pt(L, 'cust.pill.ok');
    const chat = tks.length === 0
      ? `<div class="cust-empty">${esc(pt(L, 'empty.no_history'))}</div>`
      : tks.slice(-6).map((t) => {
        const them = `<div class="msg"><div class="av-mini">${esc(c.name.charAt(0).toUpperCase())}</div><div><div class="bubble">${esc(localizePlaceholderTicket(t.full_text || t.summary, L))}</div><div class="ts">${esc(ago(L, d.now - t.created_at))}</div></div></div>`;
        const me = t.resolution
          ? `<div class="msg me"><div><div class="bubble">${esc(t.resolution)}</div><div class="ts">${esc(t.resolved_at ? ago(L, d.now - t.resolved_at) : '')}</div></div><div class="av-mini">${esc(s.initials)}</div></div>`
          : t.status === 'resolved' ? `<div class="cust-note">${esc(pt(L, 'cust.closed_in_shift'))}</div>` : `<div class="cust-note">${esc(pt(L, 'cust.waiting'))}</div>`;
        return them + me;
      }).join('');
    return `<div class="cust-prof" data-cust-prof="${c.id}"${i === 0 ? '' : ' hidden'}>
          <div class="prof-head">
            <div class="av" style="background-image:url(${PORTRAITS[c.persona_archetype] ?? '/img/persona-anon.webp'});background-size:cover;background-position:center;color:transparent">${esc(c.name.charAt(0))}</div>
            <div>
              <h2>${esc(c.name)} <span class="pill">${esc(pill)}</span></h2>
              <div class="org">${esc(pt(L, 'cust.org', { plan: pt(L, (`plan.${c.plan_tier}`) as PlayKey), persona: personaLabel(L, c.persona_archetype), day: Math.max(1, Math.floor((c.joined_at - (s.nextDayAt - s.day * 86400)) / 86400) + 1) }))}</div>
            </div>
            ${open > 0 && c.is_active === 1 ? `<div class="prof-actions"><a class="btn sm primary" href="/play/shift" data-open-shift="1">${esc(pt(L, 'cust.answer'))}</a></div>` : ''}
          </div>
          <div class="stats-row">
            <div class="pstat"><div class="k">MRR${tip(pt(L, 'tip.mrr'))}</div><div class="v">${esc(usd(price))}</div><div class="meta">${esc(pt(L, (`plan.${c.plan_tier}`) as PlayKey))}</div></div>
            <div class="pstat"><div class="k">LTV${tip(pt(L, 'tip.ltv'))}</div><div class="v">${esc(usd2(ltv))}</div><div class="meta">${esc(pt(L, 'cust.ltv_meta'))}</div></div>
            <div class="pstat"><div class="k">${esc(pt(L, 'cust.k.mood'))}${tip(pt(L, 'tip.mood'))}</div><div class="v ${mood >= 0 ? 'good' : 'bad'}">${mood > 0 ? '+' : ''}${mood}</div><div class="meta">${esc(pt(L, 'cust.sat', { n: c.satisfaction }))}</div></div>
            <div class="pstat"><div class="k">${esc(pt(L, 'cust.k.churn'))}${tip(pt(L, 'tip.churn'), 'tip-left')}</div><div class="v ${c.churn_risk >= 50 ? 'bad' : c.churn_risk >= 25 ? 'warn' : 'good'}">${c.churn_risk}%</div><div class="meta">${esc(pt(L, c.churn_risk >= 50 ? 'cust.churn_high' : 'cust.churn_low'))}</div></div>
            <div class="pstat"><div class="k">${esc(pt(L, 'nav.tickets'))}</div><div class="v">${tks.length}</div><div class="meta">${esc(pt(L, 'cust.tickets_meta', { open, closed: tks.length - open }))}</div></div>
          </div>
          <div class="col">
            <h4 class="sec">${esc(pt(L, 'cust.history'))}</h4>
            <div class="chat">${chat}</div>
          </div>
        </div>`;
  }).join('');

  return `<div class="content">
      <div class="pagehead">
        <div class="h-left">
          <h1>${esc(pt(L, 'nav.customers'))} <span class="count">${esc(pt(L, 'cust.count', { n: active.length }))}</span></h1>
          <div class="sub">${esc(pt(L, 'cust.sub'))}</div>
        </div>
      </div>
      ${sorted.length === 0 ? `<section class="panel cust-none"><div class="cust-empty">🌱 ${esc(pt(L, 'cust.none'))}</div></section>` : `
      <div class="layout">
        <section class="panel cust-list">
          <div class="cust-search"><div class="cust-filters">${filters}</div></div>
          ${rows}
        </section>
        <section class="panel">${profiles}</section>
      </div>`}
    </div>`;
}
