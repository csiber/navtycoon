// src/lib/play/research-page.ts
// Hyperscales — a /play/research (fejlesztések / technológiai fa) szerveroldalon, valós adatból (2026-11-11).
// Korábban: „7 RP elérhető" (valójában a megvehető elemek száma — kutatási pont a játékban nincs),
// magától futó „Auto-restart cron" kutatás, kitalált kutatási sor, és a csomópontra kattintás semmit sem tett.
// Most: a 20 fejlesztés koronként, valós állapottal; kattintásra részletek + vásárlás (toast, pénz-animáció).

import { esc, usd, type ShellData } from './shell';
import { pt } from './strings';
import { upgradeName, upgradeEffect } from './catalog';

export interface ResearchNode {
  id: string; era: number; cost_usd_cents: number; prereq: string | null;
  status: 'owned' | 'available' | 'locked';
}

export function renderResearchContent(shell: ShellData, nodes: ResearchNode[]): string {
  const L = shell.locale;
  const owned = nodes.filter((n) => n.status === 'owned').length;
  const avail = nodes.filter((n) => n.status === 'available').length;
  const eras = [...new Set(nodes.map((n) => n.era))].sort();
  const first = nodes.find((n) => n.status === 'available') ?? nodes[0];

  const statusLbl = (n: ResearchNode) =>
    n.status === 'owned' ? pt(L, 'rs.owned') : n.status === 'available' ? pt(L, 'rs.available') : pt(L, 'rs.locked');

  const tree = eras.map((era) => `
        <div class="rs-era">
          <div class="rs-era-h">${esc(pt(L, 'nav.locked_era', { n: era }))}${era > shell.era ? ' 🔒' : ''}</div>
          <div class="rs-grid">
            ${nodes.filter((n) => n.era === era).map((n) => `
            <button type="button" class="rs-node ${n.status}${first && n.id === first.id ? ' selected' : ''}" data-node="${esc(n.id)}">
              <span class="rs-name">${esc(upgradeName(L, n.id))}</span>
              <span class="rs-cost">${n.status === 'owned' ? '✓ ' + esc(pt(L, 'rs.owned')) : esc(usd(n.cost_usd_cents))}</span>
            </button>`).join('')}
          </div>
        </div>`).join('');

  const details = nodes.map((n) => {
    const canBuy = n.status === 'available' && shell.cashCents >= n.cost_usd_cents;
    const why = n.status === 'owned' ? pt(L, 'rs.why_owned')
      : n.era > shell.era ? pt(L, 'rs.why_era', { n: n.era })
      : n.prereq && n.status === 'locked' ? pt(L, 'rs.why_prereq', { name: upgradeName(L, n.prereq) })
      : shell.cashCents < n.cost_usd_cents ? pt(L, 'rs.why_cash', { v: usd(n.cost_usd_cents - shell.cashCents) })
      : '';
    return `
        <div class="rs-detail" data-node-detail="${esc(n.id)}"${first && n.id === first.id ? '' : ' hidden'}>
          <div class="det-head"><h2>${esc(upgradeName(L, n.id))}</h2><span class="cat">${esc(statusLbl(n))} · ${esc(pt(L, 'nav.locked_era', { n: n.era }))}</span></div>
          <div class="det-section"><h4>${esc(pt(L, 'rs.effect'))}</h4><p>${esc(upgradeEffect(L, n.id))}</p></div>
          <div class="det-section"><h4>${esc(pt(L, 'rs.cost'))}</h4><p class="rs-price">${esc(usd(n.cost_usd_cents))}</p>
            ${n.prereq ? `<p class="rs-pre">${esc(pt(L, 'rs.prereq', { name: upgradeName(L, n.prereq) }))}</p>` : ''}</div>
          <div class="det-action">
            ${canBuy
              ? `<button type="button" class="btn primary" data-buy-upgrade="${esc(n.id)}" data-name="${esc(upgradeName(L, n.id))}" data-cost="${n.cost_usd_cents}">${esc(pt(L, 'rs.buy', { v: usd(n.cost_usd_cents) }))}</button>`
              : `<div class="rs-why">${esc(why)}</div>`}
          </div>
        </div>`;
  }).join('');

  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, 'nav.research'))} <span class="count">${esc(pt(L, 'rs.count', { owned, total: nodes.length, avail }))}</span></h1>
        <div class="sub">${esc(pt(L, 'rs.sub'))}</div>
      </div></div>
      <div class="layout">
        <section class="panel tree-wrap">
          <div class="header-pad"><h3>${esc(pt(L, 'rs.tree'))}</h3></div>
          <div class="legend-row">
            <span><i class="av"></i><b>${esc(pt(L, 'rs.owned'))}</b></span>
            <span><i class="un"></i><b>${esc(pt(L, 'rs.available'))}</b></span>
            <span><i class="lk"></i><b>${esc(pt(L, 'rs.locked'))}</b></span>
          </div>
          <div class="rs-tree">${tree}</div>
        </section>
        <section class="panel rs-side">${details}</section>
      </div>
    </div>`;
}
