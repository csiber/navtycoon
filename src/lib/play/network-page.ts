// src/lib/play/network-page.ts
// Hyperscales — a /play/network (Hálózat) tartalma szerveroldalon, valós adatból (2026-11-12, hálózat-kör).
// Három döntés: tranzit-csomag, peering, DDoS-védelem (network.ts). Az 1. korszakban a zárolt lap marad.

import { esc, usd, type ShellData } from './shell';
import { pt, type PlayKey } from './strings';
import { ECONOMY } from '../game/economy';
import { bandwidthUnits, networkMonthlyCents } from '../game/network';

export function renderNetworkContent(s: ShellData): string {
  const L = s.locale;
  const N = ECONOMY.network!;
  const t = s.team;
  const net = t.network;
  const pct = t.bandwidth > 0 ? Math.round((t.traffic / t.bandwidth) * 100) : 0;
  const status = t.slow ? 'slow' : pct >= 85 ? 'tight' : 'ok';

  const kpi = (k: string, v: string, sub: string, cls = '') =>
    `<div class="tm-kpi ${cls}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(sub)}</div></div>`;
  const kpis = `<div class="tm-kpis full">
      ${kpi(pt(L, 'nw.k.traffic'), pt(L, 'nw.units', { n: t.traffic }), pt(L, 'nw.traffic_note', { b: N.units.business, d: N.units.dedicated }))}
      ${kpi(pt(L, 'nw.k.bandwidth'), pt(L, 'nw.units', { n: t.bandwidth }), pt(L, (`nw.tier${net.transit_tier}`) as PlayKey))}
      ${kpi(pt(L, 'nw.k.cost'), t.networkMonthlyCents > 0 ? pt(L, 'tm.per_month', { v: usd(t.networkMonthlyCents) }) : pt(L, 'nw.free'), t.networkMonthlyCents > 0 ? pt(L, 'tm.per_day', { v: usd(Math.round(t.networkMonthlyCents / 30)) }) : '', t.networkMonthlyCents > 0 ? 'amber' : '')}
      ${kpi(pt(L, 'nw.k.status'), pt(L, (`nw.${status}`) as PlayKey), `${pct}%`, status === 'slow' ? 'red' : status === 'tight' ? 'amber' : 'green')}
    </div>`;
  const meter = `<div class="nw-meter full ${status}"><div class="nw-meter-bar"><i style="width:${Math.min(100, pct)}%"></i>${pct > 100 ? `<b style="left:${Math.round(10000 / pct)}%"></b>` : ''}</div>
      <div class="nw-meter-txt">${esc(t.slow ? pt(L, 'nw.slow_banner', { t: t.traffic, b: t.bandwidth }) : status === 'tight' ? pt(L, 'nw.tight_banner', { p: pct }) : pt(L, 'nw.units', { n: `${t.traffic} / ${t.bandwidth}` }) + ` (${pct}%)`)}</div></div>`;

  const curFits = !t.slow && pct < 85;
  const tiers = N.tiers.map((tier, i) => {
    const cur = i === net.transit_tier;
    const locked = tier.min_era > s.era;
    const fee = Math.round(tier.monthly_cents * (net.peering && i >= N.peering.min_tier ? 1 - N.peering.transit_discount_pct / 100 : 1));
    const bw = bandwidthUnits(N, { ...net, transit_tier: i, peering: i >= N.peering.min_tier ? net.peering : 0 });
    const fits = t.traffic <= bw;
    const btn = cur
      ? `<span class="nw-cur">${esc(pt(L, 'nw.current'))}</span>`
      : locked ? `<button class="btn sm" type="button" disabled>🔒</button>`
        : `<button class="btn sm${fits && !curFits && i > net.transit_tier ? ' primary' : ''}" type="button" data-net='${JSON.stringify({ transit_tier: i })}'>${esc(fee > 0 ? pt(L, 'nw.choose', { v: usd(fee) }) : pt(L, 'nw.choose_free'))}</button>`;
    return `
        <div class="nw-tier${cur ? ' cur' : ''}${fits ? ' fits' : ' short'}">
          <div class="nw-tier-h"><span class="nw-tier-name">${esc(pt(L, (`nw.tier${i}`) as PlayKey))}</span><span class="nw-tier-fee">${esc(fee > 0 ? pt(L, 'tm.per_month', { v: usd(fee) }) : pt(L, 'nw.free'))}</span></div>
          <div class="nw-tier-bw">${esc(pt(L, 'nw.units', { n: bw }))}</div>
          <div class="nw-tier-desc">${esc(pt(L, (`nw.tier_desc${i}`) as PlayKey))}</div>
          <div class="nw-tier-foot">${btn}</div>
        </div>`;
  }).join('');

  // Peering: mennyit spórol a mostani csomagon (a tranzit-kedvezmény − a havidíj).
  const peerCan = net.transit_tier >= N.peering.min_tier;
  const save = networkMonthlyCents(N, { ...net, peering: 0 }) - networkMonthlyCents(N, { ...net, peering: 1 });
  const peerNote = !peerCan ? pt(L, 'nw.peering_need') : save >= 0 ? pt(L, 'nw.peering_worth', { v: usd(save) }) : pt(L, 'nw.peering_notworth', { v: usd(-save) });
  const toggle = (on: number, key: 'peering' | 'ddos', enabled: boolean, costCents = 0) => on
    ? `<span class="nw-on">${esc(pt(L, 'nw.is_on'))}</span><button class="btn sm ghost" type="button" data-net='${JSON.stringify({ [key]: false })}'>${esc(pt(L, 'nw.turn_off'))}</button>`
    : `<span class="nw-off">${esc(pt(L, 'nw.is_off'))}</span><button class="btn sm${enabled ? ' primary' : ''}" type="button"${enabled ? ` data-net='${JSON.stringify({ [key]: true })}'${costCents ? ` data-cost="${costCents}"` : ''}` : ' disabled'}>${esc(costCents ? pt(L, 'nw.turn_on_cost', { v: usd(costCents) }) : pt(L, 'nw.turn_on'))}</button>`;
  const extras = `
        <div class="nw-extra">
          <div><div class="nw-extra-h">${esc(pt(L, 'nw.peering'))}</div>
            <div class="nw-extra-d">${esc(pt(L, 'nw.peering_desc', { b: N.peering.bandwidth_pct, d: N.peering.transit_discount_pct, s: usd(N.peering.setup_cents), m: usd(N.peering.monthly_cents) }))}</div>
            <div class="nw-extra-n">${esc(peerNote)}</div>
            ${net.peering && net.peering_monthly_cents != null
    ? `<div class="nw-extra-n">${esc(pt(L, 'nw.peering_deal', { m: usd(net.peering_monthly_cents), n: usd(N.peering.monthly_cents) }))}</div>`
    : !net.peering ? `<div class="nw-extra-n"><a href="/play/marketplace?category=peering">${esc(pt(L, 'nw.peering_market'))}</a></div>` : ''}</div>
          <div class="nw-extra-a">${toggle(net.peering, 'peering', peerCan && s.cashCents >= N.peering.setup_cents, N.peering.setup_cents)}</div>
        </div>
        <div class="nw-extra">
          <div><div class="nw-extra-h">${esc(pt(L, 'nw.ddos'))}</div>
            <div class="nw-extra-d">${esc(pt(L, 'nw.ddos_desc', { p: N.ddos.avoid_network, m: usd(N.ddos.monthly_cents) }))}</div></div>
          <div class="nw-extra-a">${toggle(net.ddos, 'ddos', true)}</div>
        </div>`;

  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, 'nav.network'))} <span class="count">${esc(pt(L, (`nw.tier${net.transit_tier}`) as PlayKey))}</span></h1>
        <div class="sub">${esc(pt(L, 'nw.sub2'))}</div>
      </div></div>
      ${kpis}
      ${meter}
      <section class="panel full tm-sec">
        <div class="ph"><h3>${esc(pt(L, 'nw.transit'))}</h3><span class="ph-sub">// ${esc(pt(L, 'nw.transit_sub'))}</span></div>
        <div class="nw-tiers">${tiers}</div>
      </section>
      <section class="panel full tm-sec">
        <div class="ph"><h3>${esc(pt(L, 'nw.extras'))}</h3><span class="ph-sub">// ${esc(pt(L, 'nw.extras_sub'))}</span></div>
        ${extras}
      </section>
      <section class="panel full tm-sec">
        <div class="ph"><h3>${esc(pt(L, 'tm.how'))}</h3></div>
        <ul class="tm-how"><li>${esc(pt(L, 'nw.how1'))}</li><li>${esc(pt(L, 'nw.how2'))}</li></ul>
      </section>
    </div>`;
}
