// src/lib/play/servers-page.ts
// Hyperscales — a /play/servers tartalma szerveroldalon, valós adatból (2026-11-11).
// Korábban sablon volt: „srv-02 · primary db", CPU 88%, „bought Day 4", 8d 04h uptime, Budapest 22°C,
// Pentium 4 specifikáció, kitalált workloadok. Most: a játékos valódi szerverei, a rájuk jutó ügyfelek
// (assignLoad), vásárlási nap, havidíj, a katalógus és a fejlesztések a valós árakkal, lefordítva.

import { esc, usd, type ShellData } from './shell';
import { pt } from './strings';
import { serverName, serverFlavor, upgradeName, upgradeEffect } from './catalog';
import { rackUnitStates, unit2d } from './rack-model';
import { daysAlive } from '../game/era-progress';
import { serverCapacity } from '../game/server-types';
import { effectiveMonthlyFees, ECONOMY } from '../game/economy';
import { isDedicatedServer, dedicatedFeeMid } from '../game/dedicated';
import { NO_EFFECTS } from '../game/upgrade-effects';
// 2026-11-12 (játékmag): a kapacitás a fejlesztésekkel együtt (a hívó már a tényleges kapacitást adja át),
// a havidíj valóban levonódik (a fejlesztésekkel csökkentve), a katalógusban: hány ügyféltől termeli ki a díját.

export interface OwnedServer { id: number; type: string; capacity: number; monthly_cost_cents: number; purchased_at: number }
export interface BuyableServer { type: string; capacity: number; monthly_cost_cents: number; purchase_cost_cents: number }
export interface BuyableUpgrade { id: string; cost_usd_cents: number }

export interface ServersPageData {
  shell: ShellData;
  foundedAt: number;
  activeCustomers: number;
  /** Nyitott incidens-események típusa (a 3D rackkel egyező „leállt" gép a 2D-ben is). */
  openIncidents?: string[];
  servers: OwnedServer[];
  buyable: BuyableServer[];
  upgrades: BuyableUpgrade[];
  /** A játékos hobby-ára (cent) — a „hány ügyféltől termeli ki a havidíját" számításhoz. */
  hobbyPriceCents?: number;
  /** 2026-11-12 (dedikált-kör): az aktív nagy ügyfelek (vásárlási sorrendben kerülnek a dedikált gépekre), a hírnév
   *  és hogy még hány napig nem jelentkezik új (egy felmondás után). activeCustomers a SIMA ügyfelek száma. */
  dedicated?: { customers: Array<{ id: number; name: string; satisfaction: number; fee_cents: number }>; reputation: number; cooldownDays: number };
}

/** A dedikált gép állapot-szövege: ki bérli, vagy miért nem jön még senki. */
function dedStatus(L: Parameters<typeof pt>[0], d: ServersPageData): string {
  const rule = ECONOMY.dedicated;
  if (!rule) return '';
  const days = Math.max(1, Math.round(1 / rule.arrival_per_day));
  const rep = d.dedicated?.reputation ?? 0;
  if (rep < rule.min_reputation) return pt(L, 'srv.ded_lowrep', { r: rule.min_reputation, n: rep });
  if ((d.dedicated?.cooldownDays ?? 0) > 0) return pt(L, 'srv.ded_cooldown', { n: d.dedicated!.cooldownDays });
  return pt(L, 'srv.ded_waiting', { r: rule.min_reputation, d: days });
}

export function renderServersContent(d: ServersPageData): string {
  const s = d.shell;
  const L = s.locale;
  const effs = s.effects ?? NO_EFFECTS;
  const lost24h = s.fleet?.lost24h ?? 0;
  // Állapot a 3D rackkel közös függvényből (rack-model): ≥ 70% borostyán, piros csak túlcsordulás / incidens.
  const dedList = d.dedicated?.customers ?? [];
  const { loaded, units: rackStates } = rackUnitStates(d.servers, d.activeCustomers, d.openIncidents ?? [], dedList.length);
  // A dedikált gépek sorrendben kapják a nagy ügyfeleket (ugyanúgy, mint assignFleetLoad).
  const dedOf = new Map<number, (typeof dedList)[number]>();
  { let k = 0; for (const sv of loaded.servers) if (sv.dedicated && sv.load > 0 && dedList[k]) dedOf.set(sv.id, dedList[k++]); }
  const dedTag = `<b class="ded-tag">${esc(pt(L, 'srv.ded_tag'))}</b>`;
  const used = loaded.servers.length;
  const rows: string[] = [];
  const total = Math.max(12, used);
  for (let i = 0; i < total; i++) {
    const sv = loaded.servers[i];
    const lbl = 'U' + (24 - i);
    if (!sv) {
      rows.push(`<div class="u-row empty"><span class="lbl">${lbl}</span><span class="name">${esc(pt(L, 'dash.fleet.empty'))}</span><span class="leds"><i></i><i></i><i></i></span><span class="util">—</span></div>`);
      continue;
    }
    const { util, state } = rackStates[i];
    const v = unit2d(state);
    const ded = sv.dedicated;
    const who = dedOf.get(sv.id);
    rows.push(`<div role="button" tabindex="0" class="u-row${v.row}${ded ? ' ded' : ''}${i === 0 ? ' selected' : ''}" data-srv="${sv.id}" data-state="${state}"><span class="lbl">${lbl}</span><span class="name">${esc(ded && who ? who.name : serverName(L, sv.type))}</span><span class="leds">${ded ? dedTag : `<i class="${v.leds[0]}"></i><i class="${v.leds[1]}"></i><i class="${v.leds[2]}"></i>`}</span><span class="util">${ded ? (who ? '1/1' : esc(pt(L, 'srv.ded_empty'))) : util + '%'}</span></div>`);
  }

  const details = loaded.servers.map((sv, i) => {
    const boughtDay = daysAlive(d.foundedAt, sv.purchased_at) + 1;
    const statusCls = unit2d(rackStates[i].state).tone;
    if (sv.dedicated) {
      const who = dedOf.get(sv.id);
      const mood = who ? who.satisfaction - 50 : 0;
      return `
          <div class="srv-detail" data-srv-detail="${sv.id}"${i === 0 ? '' : ' hidden'}>
            <div class="detail-head">
              <div class="badge-u ded">U${24 - i}</div>
              <div>
                <h2>${esc(serverName(L, sv.type))} ${dedTag}</h2>
                <div class="sub">${esc(pt(L, 'srv.bought_day', { n: boughtDay }))} · ${esc(who ? pt(L, 'srv.ded_client', { name: who.name, v: usd(who.fee_cents) }) : dedStatus(L, d))}</div>
              </div>
            </div>
            <div class="detail-grid">
              <div class="dgrid"><div class="k">${esc(pt(L, 'srv.k.client'))}</div><div class="v sm ${who ? (mood >= 0 ? 'good' : 'bad') : ''}">${esc(who ? who.name : '—')}</div><div class="meta">${esc(who ? pt(L, 'srv.ded_client_meta', { s: who.satisfaction }) : pt(L, 'srv.ded_empty'))}</div></div>
              <div class="dgrid"><div class="k">MRR</div><div class="v good">${esc(who ? usd(who.fee_cents) : '—')}</div><div class="meta">${esc(ECONOMY.dedicated ? pt(L, 'srv.ded_offer', { v: usd(dedicatedFeeMid(ECONOMY.dedicated)) }) : '')}</div></div>
              <div class="dgrid"><div class="k">${esc(pt(L, 'srv.k.monthly'))}</div><div class="v">${esc(usd(sv.monthly_cost_cents))}</div><div class="meta">${esc(effs.fee_pct < 0 ? pt(L, 'srv.monthly_disc', { v: usd(effectiveMonthlyFees(sv.monthly_cost_cents, effs.fee_pct)) }) : pt(L, 'srv.monthly_meta'))}</div></div>
              <div class="dgrid"><div class="k">${esc(pt(L, 'srv.k.age'))}</div><div class="v">${esc(pt(L, 'runway.days', { n: Math.max(0, s.day - boughtDay) }))}</div><div class="meta">${esc(pt(L, 'srv.bought_day', { n: boughtDay }))}</div></div>
            </div>
            <div class="detail-section">
              <h4>${esc(pt(L, 'srv.about'))}</h4>
              <p class="srv-flavor">${esc(who ? pt(L, 'sx.ded_note') : dedStatus(L, d))}</p>
              <p class="srv-flavor">${esc(ECONOMY.dedicated ? pt(L, 'srv.ded_how', { d: Math.max(1, Math.round(1 / ECONOMY.dedicated.arrival_per_day)), r: ECONOMY.dedicated.min_reputation }) : serverFlavor(L, sv.type))}</p>
            </div>
          </div>`;
    }
    return `
          <div class="srv-detail" data-srv-detail="${sv.id}"${i === 0 ? '' : ' hidden'}>
            <div class="detail-head">
              <div class="badge-u">U${24 - i}</div>
              <div>
                <h2>${esc(serverName(L, sv.type))}</h2>
                <div class="sub">${esc(pt(L, 'srv.bought_day', { n: boughtDay }))} · ${esc(pt(L, 'srv.serving', { n: sv.load }))}</div>
              </div>
            </div>
            <div class="detail-grid">
              <div class="dgrid"><div class="k">${esc(pt(L, 'srv.k.load'))}</div><div class="v ${statusCls}">${sv.util}%</div><div class="meta">${esc(pt(L, 'srv.load_meta', { n: sv.load, c: sv.capacity }))}</div></div>
              <div class="dgrid"><div class="k">${esc(pt(L, 'srv.k.capacity'))}</div><div class="v">${sv.capacity}</div><div class="meta">${esc(effs.capacity_pct > 0 ? pt(L, 'srv.capacity_bonus', { p: effs.capacity_pct }) : pt(L, 'srv.capacity_meta'))}</div></div>
              <div class="dgrid"><div class="k">${esc(pt(L, 'srv.k.monthly'))}</div><div class="v">${esc(usd(sv.monthly_cost_cents))}</div><div class="meta">${esc(sv.monthly_cost_cents === 0 ? pt(L, 'srv.monthly_free')
                : effs.fee_pct < 0 ? pt(L, 'srv.monthly_disc', { v: usd(effectiveMonthlyFees(sv.monthly_cost_cents, effs.fee_pct)) }) : pt(L, 'srv.monthly_meta'))}</div></div>
              <div class="dgrid"><div class="k">${esc(pt(L, 'srv.k.age'))}</div><div class="v">${esc(pt(L, 'runway.days', { n: Math.max(0, s.day - boughtDay) }))}</div><div class="meta">${esc(pt(L, 'srv.bought_day', { n: boughtDay }))}</div></div>
            </div>
            <div class="detail-section">
              <h4>${esc(pt(L, 'srv.about'))}</h4>
              <p class="srv-flavor">${esc(serverFlavor(L, sv.type))}</p>
            </div>
          </div>`;
  }).join('');

  const catalog = d.buyable.length === 0
    ? `<div class="cat-empty">${esc(pt(L, 'srv.cat_empty'))}</div>`
    : d.buyable.map((b) => {
      const ok = s.cashCents >= b.purchase_cost_cents;
      const slots = serverCapacity(b.type, b.capacity, effs.capacity_pct);
      const fee = effectiveMonthlyFees(b.monthly_cost_cents, effs.fee_pct);
      const k = Math.max(1, Math.ceil(fee / Math.max(1, d.hobbyPriceCents ?? 500)));
      const rule = ECONOMY.dedicated;
      if (isDedicatedServer(b.type) && rule) {
        // „1 nagy ügyfél, ~$X/hó, magas elvárás" + mikor térül meg a vételár (a sáv közepével számolva).
        const mid = dedicatedFeeMid(rule);
        const months = Math.round((b.purchase_cost_cents / Math.max(1, mid - fee)) * 10) / 10;
        return `
          <div class="cat-item ded${ok ? ' affordable' : ''}">
            <div class="row1"><span class="name">${esc(serverName(L, b.type))}</span> ${dedTag}<span class="tag${ok ? '' : ' lock'}">${esc(pt(L, ok ? 'srv.tag_ok' : 'srv.tag_cash'))}</span></div>
            <div class="ded-offer">${esc(pt(L, 'srv.ded_offer', { v: usd(mid) }))}</div>
            <div class="specs-mini"><span>${esc(pt(L, 'srv.per_month', { v: usd(fee) }))}</span><span>${esc(pt(L, 'srv.ded_payback', { m: months.toLocaleString(L === 'en' ? 'en-US' : L === 'de' ? 'de-DE' : 'hu-HU') }))}</span><span>${esc(pt(L, 'srv.ded_how', { d: Math.max(1, Math.round(1 / rule.arrival_per_day)), r: rule.min_reputation }))}</span></div>
            <div class="row2"><span class="price${ok ? '' : ' lock'}">${esc(usd(b.purchase_cost_cents))}</span><button class="buy" type="button"${ok ? ` data-buy-server="${esc(b.type)}" data-name="${esc(serverName(L, b.type))}" data-cost="${b.purchase_cost_cents}"` : ' disabled'}>${esc(pt(L, ok ? 'srv.buy' : 'srv.tag_cash'))}</button></div>
          </div>`;
      }
      return `
          <div class="cat-item${ok ? ' affordable' : ''}">
            <div class="row1"><span class="name">${esc(serverName(L, b.type))}</span><span class="tag${ok ? '' : ' lock'}">${esc(pt(L, ok ? 'srv.tag_ok' : 'srv.tag_cash'))}</span></div>
            <div class="specs-mini"><span>${esc(pt(L, 'dash.quick.slots', { n: slots }))}</span><span>${esc(pt(L, 'srv.per_month', { v: usd(fee) }))}</span><span>${esc(pt(L, 'srv.breakeven', { k }))}</span><span>${esc(serverFlavor(L, b.type))}</span></div>
            <div class="row2"><span class="price${ok ? '' : ' lock'}">${esc(usd(b.purchase_cost_cents))}</span><button class="buy" type="button"${ok ? ` data-buy-server="${esc(b.type)}" data-name="${esc(serverName(L, b.type))}" data-cost="${b.purchase_cost_cents}"` : ' disabled'}>${esc(pt(L, ok ? 'srv.buy' : 'srv.tag_cash'))}</button></div>
          </div>`;
    }).join('');

  const upgrades = d.upgrades.map((u) => {
    const ok = s.cashCents >= u.cost_usd_cents;
    return `
          <div class="cat-item${ok ? ' affordable' : ''}">
            <div class="row1"><span class="name">${esc(upgradeName(L, u.id))}</span></div>
            <div class="specs-mini"><span>${esc(upgradeEffect(L, u.id))}</span></div>
            <div class="row2"><span class="price${ok ? '' : ' lock'}">${esc(usd(u.cost_usd_cents))}</span><button class="buy" type="button"${ok ? ` data-buy-upgrade="${esc(u.id)}" data-name="${esc(upgradeName(L, u.id))}" data-cost="${u.cost_usd_cents}"` : ' disabled'}>${esc(pt(L, ok ? 'srv.buy' : 'srv.tag_cash'))}</button></div>
          </div>`;
  }).join('');

  return `<div class="content">
      <div class="pagehead">
        <div class="h-left">
          <h1>${esc(pt(L, 'nav.servers'))} <span class="count">${esc(pt(L, 'srv.count', { n: used, c: loaded.totalCapacity }))}</span></h1>
          <div class="sub">${esc(pt(L, 'srv.sub', { n: d.activeCustomers }))}${loaded.overflow > 0 ? ' · <b class="srv-over">' + esc(pt(L, 'srv.overflow', { n: loaded.overflow })) + '</b>' : ''}${lost24h > 0 ? '<br><b class="srv-lost">' + esc(pt(L, 'srv.lost', { n: lost24h })) + '</b>' : ''}</div>
        </div>
      </div>
      <div class="layout">
        <section class="panel rack-panel">
          <div class="ph"><h3>${esc(pt(L, 'srv.rack'))}</h3><span class="ph-sub">// ${esc(pt(L, 'srv.rack_sub'))}</span><button class="rack3d-toggle" type="button" data-rack3d-toggle hidden aria-pressed="false" style="margin-left:auto">3D</button></div>
          <div class="rack3d-host" data-rack3d hidden style="--rack3d-h:470px"><span class="rack3d-hint">${esc(pt(L, 'r3.hint'))}</span></div>
          <div class="rack-vis">${rows.join('')}</div>
          <div class="rack-foot">
            <div class="mini-stat"><div class="k">${esc(pt(L, 'srv.k.used'))}</div><div class="v">${used}U</div></div>
            <div class="mini-stat"><div class="k">${esc(pt(L, 'dash.fleet.slots'))}</div><div class="v">${loaded.totalCapacity}</div></div>
            <div class="mini-stat"><div class="k">${esc(pt(L, 'dash.fleet.customers'))}</div><div class="v${loaded.overflow > 0 ? ' bad' : ''}">${d.activeCustomers}</div></div>
          </div>
        </section>
        <section class="panel">${details || `<div class="cat-empty">${esc(pt(L, 'srv.none'))}</div>`}</section>
        <section class="panel cat-panel">
          <div class="ph"><h3>${esc(pt(L, 'srv.catalog'))}</h3><span class="ph-sub">// ${esc(pt(L, 'srv.cat_sub', { n: d.buyable.length }))}</span></div>
          <div class="cat-list">${catalog}</div>
          <div class="cat-up">
            <div class="cat-up-h">${esc(pt(L, 'srv.upgrades', { owned: s.counts.upgradesOwned, total: s.counts.upgradesTotal }))}</div>
            ${upgrades || `<div class="cat-empty">${esc(pt(L, 'dash.quick.research_none'))}</div>`}
          </div>
        </section>
      </div>
    </div>`;
}
