// src/lib/play/leaderboard-page.ts
// Hyperscales — a /play/leaderboard szerveroldalon, valós rangsorral (2026-11-11).
// Korábban: „Season 3 · 2,841 players" vs „Season 1", kitalált „Friends · 8" fül, a saját sor a 6. és 7.
// közé ékelve „#23"-mal és egy „22 players above you" sorral, elcsúszott oszlopok, az NPC-k jelöletlenül.
// Most: egy rendezés (rankPlayers), NPC-címke, egységes rácsú oszlopok, „csak játékosok" szűrő,
// és a saját helyezés ugyanabból a listából. Szezonok nincsenek — nem is írunk ki ilyet.

import { esc, usd, type ShellData } from './shell';
import { pt } from './strings';
import { achievementCell } from './achievements-i18n';
import { ACHIEVEMENTS } from '../game/achievements';
import { fastestFinishers, type RankedPlayer } from '../game/leaderboard';

const GRADS = ['#f59e0b,#b45309', '#22d3ee,#0e7490', '#a78bfa,#6d28d9', '#34d399,#047857', '#f43f5e,#be123c', '#6366f1,#4338ca'];

function avatar(name: string, i: number): string {
  return `<div class="av" style="background:linear-gradient(135deg,${GRADS[i % GRADS.length]})">${esc(name.trim().charAt(0).toUpperCase() || '?')}</div>`;
}

export function renderLeaderboardContent(
  shell: ShellData, ranked: RankedPlayer[], me: RankedPlayer | null, now: number, unlocked: Set<string>,
): string {
  const L = shell.locale;
  const humans = ranked.filter((r) => !r.is_npc).length;
  const npcs = ranked.length - humans;
  const day = (r: RankedPlayer) => Math.max(1, Math.floor((now - r.founded_at) / 86400) + 1);
  const npcTag = (r: RankedPlayer) => (r.is_npc ? `<span class="lbx-npc" title="${esc(pt(L, 'lb.npc_tip'))}">${esc(pt(L, 'lb.npc'))}</span>` : '');
  const meTag = (r: RankedPlayer) => (r.is_me ? `<span class="lbx-you">${esc(pt(L, 'lb.you'))}</span>` : '');
  // 2026-11-13 (végjáték): „Befejezte X nap alatt" jelzés a befejezett cégeknél.
  const finTag = (r: RankedPlayer) => (r.finished_days != null
    ? `<span class="lbx-fin" title="${esc(pt(L, 'lb.finished_tip', { n: r.finished_days }))}">🏆 ${esc(pt(L, 'lb.finished', { n: r.finished_days }))}</span>` : '');
  const fastest = fastestFinishers(ranked);

  const podium = ranked.slice(0, 3).map((r, i) => `
            <div class="pod r${i + 1}">
              <div class="rank">${i + 1}</div>
              ${avatar(r.company_name, i)}
              <div class="name">${esc(r.company_name)} ${npcTag(r)}${meTag(r)}${finTag(r)}</div>
              <div class="score">${esc(usd(r.mrr_usd_cents))}<small>/${esc(pt(L, 'lb.mo'))}</small></div>
              <div class="stats"><span>${esc(pt(L, 'top.cash'))} <b>${esc(usd(r.cash_usd_cents))}</b></span><span>${esc(pt(L, 'top.day', { n: day(r) }))}</span></div>
            </div>`);
  // A dobogó klasszikus sorrendje: 2 · 1 · 3
  const podiumHtml = podium.length === 3 ? podium[1] + podium[0] + podium[2] : podium.join('');

  const row = (r: RankedPlayer) => `
          <div class="lbx-row${r.is_me ? ' me' : ''}${r.is_npc ? ' npc' : ''}" data-npc="${r.is_npc ? 1 : 0}">
            <div class="rk">${r.rank}</div>
            ${avatar(r.company_name, r.rank)}
            <div class="who"><div class="name">${esc(r.company_name)} ${npcTag(r)}${meTag(r)}${finTag(r)}</div></div>
            <div class="v">${esc(usd(r.mrr_usd_cents))}</div>
            <div class="v">${esc(usd(r.cash_usd_cents))}</div>
            <div class="v">${r.reputation}</div>
            <div class="v">${day(r)}</div>
            <div class="v">${r.current_era}</div>
          </div>`;
  const top = ranked.slice(0, 20);
  const meOutside = me && me.rank > 20;
  const table = `
          <div class="lbx-row head">
            <div>#</div><div></div><div>${esc(pt(L, 'lb.col.company'))}</div><div>MRR</div><div>${esc(pt(L, 'top.cash'))}</div>
            <div>${esc(pt(L, 'top.rep'))}</div><div>${esc(pt(L, 'lb.col.day'))}</div><div>${esc(pt(L, 'lb.col.era'))}</div>
          </div>
          ${top.map(row).join('')}
          ${meOutside ? `<div class="lbx-gap">${esc(pt(L, 'lb.gap', { n: me!.rank - 21 }))}</div>${row(me!)}` : ''}`;

  const badges = ACHIEVEMENTS.map((a) => {
    const cell = achievementCell(L, a.id, unlocked.has(a.id));
    return `
            <div class="b-cell ${unlocked.has(a.id) ? 'have' : 'locked'}" title="${esc(cell.desc)}">
              <div class="ico">${esc(cell.emoji)}</div>
              <div class="lbl">${esc(cell.title)}</div>
            </div>`;
  }).join('');

  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, 'nav.leaderboard'))} <span class="count">${esc(pt(L, 'lb.count', { h: humans, n: npcs }))}</span></h1>
        <div class="sub">${esc(pt(L, 'lb.sub'))}</div>
      </div></div>
      <div class="layout">
        <section class="panel">
          <div class="lb-tabs">
            <button type="button" class="on" data-lbf="all">${esc(pt(L, 'lb.tab.all'))}</button>
            <button type="button" data-lbf="humans">${esc(pt(L, 'lb.tab.humans'))}</button>
          </div>
          <div class="podium">${podiumHtml}</div>
          <div class="lbx-table">${table}</div>
        </section>
        <div class="lbx-side">
          <section class="panel season-card">
            <div class="lbl">${esc(pt(L, 'lb.your_rank'))}</div>
            <h3>${me ? `#${me.rank}` : '—'} <small>/ ${ranked.length}</small></h3>
            <div class="sub">${esc(pt(L, 'lb.how'))}</div>
          </section>
          <section class="panel lb-fin">
            <div class="ph"><h3>🏆 ${esc(pt(L, 'lb.fin_title'))}</h3></div>
            ${fastest.length === 0 ? `<div class="lb-fin-empty">${esc(pt(L, 'lb.fin_empty'))}</div>`
              : `<ol class="lb-fin-list">${fastest.map((r) => `<li><span>${esc(r.company_name)}${r.is_me ? ` <span class="lbx-you">${esc(pt(L, 'lb.you'))}</span>` : ''}</span><b>${esc(pt(L, 'lb.finished', { n: r.finished_days! }))}</b></li>`).join('')}</ol>`}
          </section>
          <section class="panel">
            <div class="ph"><h3>${esc(pt(L, 'lb.badges'))}</h3><span class="ph-sub">// ${unlocked.size}/${ACHIEVEMENTS.length}</span></div>
            <div class="badge-grid">${badges}</div>
          </section>
        </div>
      </div>
    </div>`;
}
