// src/lib/play/staff-page.ts
// Hyperscales — a /play/staff (Csapat) tartalma szerveroldalon, valós adatból (2026-11-12, csapat-kör).
// Az 1. korszakban a zárolt lap (locked-page.ts) marad; a 2.-tól a csapat, a mai jelöltek és a szabályok.
// A számok mind a staff.ts függvényeiből jönnek — ugyanazok, amiket a tick és a szimulátor is használ.

import { esc, usd, type ShellData } from './shell';
import { pt, type PlayKey } from './strings';
import { ECONOMY } from '../game/economy';
import {
  type StaffMember, type StaffCandidate, staffLevel, staffSalaryCents, staffOutput, daysToNextLevel,
  hireFeeCents, candidateSalaryCents,
} from '../game/staff';

export interface StaffPageData {
  shell: ShellData;
  now: number;
  candidates: StaffCandidate[];
}

const ROLE_ICO: Record<string, string> = { support: '✉', sre: '⚙', sales: '◐' };
const ROLE_CLS: Record<string, string> = { support: 'r-sup', sre: 'r-sre', sales: 'r-sal' };

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

/** A szerepkör hatása a mostani szinten (szöveg). */
function roleDesc(L: ShellData['locale'], role: string, level: number, output: number): string {
  const R = ECONOMY.staff!;
  const i = level - 1;
  if (role === 'support') return pt(L, 'tm.role_desc.support', { n: Math.round((R.support_tickets_per_day[i] * output) / 2) * 2 }); // = supportShare × 2
  if (role === 'sre') {
    return pt(L, 'tm.role_desc.sre', {
      t: Math.round(-R.sre_ticket_pct[i] * output), h: Math.round(R.sre_avoid_hardware[i] * output), n: Math.round(R.sre_avoid_network[i] * output),
    });
  }
  return pt(L, 'tm.role_desc.sales', { a: Math.round(R.sales_acq_pct[i] * output) });
}

function moodLabel(L: ShellData['locale'], m: StaffMember): { txt: string; cls: string } {
  const R = ECONOMY.staff!;
  if (m.morale < R.morale.drama_below) return { txt: pt(L, 'tm.mood.quit'), cls: 'bad' };
  if (m.morale < R.morale.slump_below) return { txt: pt(L, 'tm.mood.tired', { p: Math.round(R.morale.slump_factor * 100) }), cls: 'warn' };
  if (m.morale >= 70) return { txt: pt(L, 'tm.mood.good'), cls: 'good' };
  return { txt: pt(L, 'tm.mood.ok'), cls: 'ok' };
}

export function renderStaffContent(d: StaffPageData): string {
  const s = d.shell;
  const L = s.locale;
  const R = ECONOMY.staff!;
  const team = s.team;
  const n = team.staff.length;
  const avgMood = n ? Math.round(team.staff.reduce((a, m) => a + m.morale, 0) / n) : 0;

  const kpi = (k: string, v: string, sub: string, cls = '') =>
    `<div class="tm-kpi ${cls}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(sub)}</div></div>`;
  const kpis = `<div class="tm-kpis full">
      ${kpi(pt(L, 'tm.k.team'), `${n}/${team.max}`, pt(L, 'tm.limit', { a: R.max_by_era[2] ?? 0, b: R.max_by_era[3] ?? 0 }))}
      ${kpi(pt(L, 'tm.k.salary'), pt(L, 'tm.per_month', { v: usd(team.salaryMonthlyCents) }), pt(L, 'tm.per_day', { v: usd(Math.round(team.salaryMonthlyCents / 30)) }), team.salaryMonthlyCents > 0 ? 'amber' : '')}
      ${kpi(pt(L, 'tm.k.support'), pt(L, 'tm.support_v', { n: team.supportPerDay }), pt(L, 'nav.badge.open_tickets', { n: s.counts.openTickets }))}
      ${kpi(pt(L, 'tm.k.morale'), n ? String(avgMood) : '—', n ? moodWord(L, avgMood) : '', n ? (avgMood < R.morale.drama_below ? 'red' : avgMood < R.morale.slump_below ? 'amber' : 'green') : '')}
    </div>`;

  const members = n === 0
    ? `<div class="tm-empty">${esc(pt(L, 'tm.empty'))}</div>`
    : team.staff.map((m) => {
      const lvl = staffLevel(R, m, d.now);
      const out = staffOutput(R, m);
      const next = daysToNextLevel(R, m, d.now);
      const mood = moodLabel(L, m);
      const chips = [
        `<span class="tm-chip" title="${esc(pt(L, (`tm.trait_desc.${m.trait}`) as PlayKey))}">${esc(pt(L, (`tm.trait.${m.trait}`) as PlayKey))}</span>`,
        m.raise_pct > 0 ? `<span class="tm-chip">${esc(pt(L, 'tm.raise', { p: m.raise_pct }))}</span>` : '',
        m.four_day ? `<span class="tm-chip">${esc(pt(L, 'tm.four_day', { p: Math.round((1 - R.drama.four_day_output) * 100) }))}</span>` : '',
      ].join('');
      return `
        <div class="tm-card ${ROLE_CLS[m.role] ?? ''}" data-staff-card="${m.id}">
          <div class="tm-row1">
            <div class="tm-av">${esc(initials(m.name))}</div>
            <div class="tm-who">
              <div class="tm-name">${esc(m.name)}</div>
              <div class="tm-role">${esc(ROLE_ICO[m.role] ?? '')} ${esc(pt(L, (`tm.role.${m.role}`) as PlayKey))} · ${esc(pt(L, 'tm.level', { n: lvl }))}</div>
            </div>
            <div class="tm-sal">${esc(pt(L, 'tm.salary_line', { v: usd(staffSalaryCents(R, m, d.now)) }))}</div>
          </div>
          <div class="tm-desc">${esc(roleDesc(L, m.role, lvl, out))}</div>
          <div class="tm-mood ${mood.cls}">
            <div class="tm-mood-h"><span>${esc(pt(L, 'tm.mood'))}</span><b>${m.morale}</b><em>${esc(mood.txt)}</em></div>
            <div class="tm-bar"><i style="width:${Math.max(2, Math.min(100, m.morale))}%"></i></div>
          </div>
          <div class="tm-chips">${chips}</div>
          <div class="tm-foot">
            <span class="tm-next">${esc(next === null ? pt(L, 'tm.max_level') : pt(L, 'tm.next_level', { n: lvl + 1, d: next }))}</span>
            <button class="btn sm ghost tm-fire" type="button" data-staff-fire="${m.id}" data-name="${esc(m.name)}">${esc(pt(L, 'tm.fire'))}</button>
          </div>
        </div>`;
    }).join('');

  const full = n >= team.max;
  const hiredNames = new Set(team.staff.map((m) => m.name));
  const cands = d.candidates.map((c) => {
    const fee = hireFeeCents(R, c);
    const hired = hiredNames.has(c.name);
    const ok = !hired && !full && s.cashCents >= fee;
    const label = hired ? pt(L, 'tm.hired_today') : full ? pt(L, 'tm.full') : s.cashCents < fee ? pt(L, 'tm.no_cash') : pt(L, 'tm.hire', { v: usd(fee) });
    return `
        <div class="tm-card tm-cand ${ROLE_CLS[c.role] ?? ''}${hired ? ' hired' : ''}">
          <div class="tm-row1">
            <div class="tm-av">${esc(initials(c.name))}</div>
            <div class="tm-who">
              <div class="tm-name">${esc(c.name)}</div>
              <div class="tm-role">${esc(ROLE_ICO[c.role] ?? '')} ${esc(pt(L, (`tm.role.${c.role}`) as PlayKey))} · ${esc(pt(L, 'tm.level', { n: c.level_start }))}</div>
            </div>
            <div class="tm-sal">${esc(pt(L, 'tm.salary_line', { v: usd(candidateSalaryCents(R, c)) }))}</div>
          </div>
          <div class="tm-desc">${esc(roleDesc(L, c.role, c.level_start, c.trait === 'perfectionist' ? 1.15 : 1))}</div>
          <div class="tm-chips"><span class="tm-chip">${esc(pt(L, (`tm.trait.${c.trait}`) as PlayKey))}</span><span class="tm-trait">${esc(pt(L, (`tm.trait_desc.${c.trait}`) as PlayKey))}</span></div>
          <div class="tm-foot">
            <span class="tm-next">${esc(pt(L, 'tm.hire_fee', { v: usd(fee) }))}</span>
            <button class="btn sm${ok ? ' primary' : ''}" type="button"${ok ? ` data-staff-hire="${esc(c.key)}" data-name="${esc(c.name)}" data-cost="${fee}"` : ' disabled'}>${esc(label)}</button>
          </div>
        </div>`;
  }).join('');

  const how = ([1, 2, 3, 4] as const).map((i) => `<li>${esc(pt(L, (`tm.how${i}`) as PlayKey))}</li>`).join('');

  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, 'nav.staff'))} <span class="count">${esc(pt(L, 'tm.count', { n, max: team.max }))}</span></h1>
        <div class="sub">${esc(pt(L, 'tm.sub2'))}</div>
      </div></div>
      ${kpis}
      <section class="panel full tm-sec">
        <div class="ph"><h3>${esc(pt(L, 'tm.your_team'))}</h3><span class="ph-sub">// ${esc(pt(L, 'tm.count', { n, max: team.max }))}</span></div>
        <div class="tm-grid">${members}</div>
      </section>
      <section class="panel full tm-sec">
        <div class="ph"><h3>${esc(pt(L, 'tm.cands'))}</h3><span class="ph-sub">// ${esc(pt(L, 'tm.cands_sub'))}</span></div>
        <div class="tm-grid">${cands}</div>
        <div class="tm-note">${esc(pt(L, 'tm.cands_note'))}</div>
      </section>
      <section class="panel full tm-sec">
        <div class="ph"><h3>${esc(pt(L, 'tm.how'))}</h3></div>
        <ul class="tm-how">${how}</ul>
      </section>
    </div>`;
}

function moodWord(L: ShellData['locale'], v: number): string {
  const R = ECONOMY.staff!;
  if (v < R.morale.drama_below) return pt(L, 'tm.mood.quit');
  if (v < R.morale.slump_below) return pt(L, 'tm.mood.tired', { p: Math.round(R.morale.slump_factor * 100) });
  return v >= 70 ? pt(L, 'tm.mood.good') : pt(L, 'tm.mood.ok');
}
