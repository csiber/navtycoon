// src/lib/play/shell.ts
// Hyperscales — a /play/* oldalak KÖZÖS kerete: oldalsáv (navigáció, cégkártya, kifutás, korszak-doboz,
// lábléc a játékos nevével) és felső sáv (nap + következő nap visszaszámláló, pénz/MRR/hírnév/ügyfelek).
//
// 2026-11-11: korábban minden oldal a saját sablon-HTML-jében hozott egy kicsit más oldalsávot hamis
// számokkal („26 days", „0/12", „+1", „promnet · log out", „Day 12 / 365", „03:42 AM"), és a JS utólag
// próbálta felülírni. Most a keret szerveroldalon, valós adatból és a játékos nyelvén készül, és minden
// oldal ugyanazt kapja (applyShell → a sablon <aside>-ja és <header class="topbar">-ja helyére).

import type { Player } from '../game/types';
import { UPGRADE_SPECS } from '../game/upgrade-tree';
import { eraProgress, daysAlive, type EraProgress } from '../game/era-progress';
import { dailyCashFlow, type CashFlow } from '../game/runway';
import { LOW_CASH_WARN_CENTS } from '../game/economy';
import { pt, clientStrings, type PlayLocale, type PlayKey } from './strings';

export interface ShellDbLike {
  prepare(sql: string): { bind(...args: unknown[]): { first<T = unknown>(): Promise<T | null> } };
}

export interface ShellData {
  locale: PlayLocale;
  company: string;
  initials: string;
  displayName: string;
  founded: number;
  era: number;
  /** 1-től számolt játéknap (= valódi napok az alapítás óta + 1). */
  day: number;
  /** Epoch-másodperc: mikor kezdődik a következő játéknap. */
  nextDayAt: number;
  cashCents: number;
  mrrCents: number;
  rep: number;
  flow: CashFlow;
  counts: {
    servers: number;
    customers: number;
    newCustomers24h: number;
    openTickets: number;
    upgradesOwned: number;
    upgradesTotal: number;
  };
  era2: EraProgress | null;
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || 'HY';
}

export async function loadShell(
  db: ShellDbLike,
  player: Player,
  user: { display_name?: string | null; email?: string | null },
  locale: PlayLocale,
  now: number = Math.floor(Date.now() / 1000),
): Promise<ShellData> {
  const one = async (sql: string, ...args: unknown[]): Promise<number> =>
    (await db.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0;
  const uid = player.user_id;
  const [servers, customers, newCustomers24h, openTickets, upgradesOwned] = await Promise.all([
    one('SELECT COUNT(*) AS n FROM servers WHERE player_id = ?', uid),
    one('SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1', uid),
    one('SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1 AND joined_at >= ?', uid, now - 86400),
    one("SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status IN ('open', 'in_progress')", uid),
    one('SELECT COUNT(*) AS n FROM upgrades WHERE player_id = ?', uid),
  ]);
  const alive = daysAlive(player.founded_at, now);
  return {
    locale,
    company: player.company_name,
    initials: initialsOf(player.company_name),
    displayName: (user.display_name ?? '').trim() || player.company_name,
    founded: new Date(player.founded_at * 1000).getUTCFullYear(),
    era: player.current_era,
    day: alive + 1,
    nextDayAt: player.founded_at + (alive + 1) * 86400,
    cashCents: player.cash_usd_cents,
    mrrCents: player.mrr_usd_cents,
    rep: player.reputation,
    flow: dailyCashFlow(player),
    counts: {
      servers, customers, newCustomers24h, openTickets, upgradesOwned,
      upgradesTotal: UPGRADE_SPECS.length,
    },
    era2: eraProgress({
      current_era: player.current_era,
      mrr_usd_cents: player.mrr_usd_cents,
      server_count: servers,
      days_alive: alive,
      reputation: player.reputation,
    }),
  };
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** $1,234 — egész dollár, ezres tagolással. */
export function usd(cents: number): string {
  const v = Math.round(cents / 100);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (v < 0 ? '−$' : '$') + s;
}

/** $1.50 — két tizedes (kis összegekhez). */
export function usd2(cents: number): string {
  const v = cents / 100;
  return (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
}

export type NavId =
  | 'dashboard' | 'shift' | 'servers' | 'customers' | 'tickets' | 'finance'
  | 'pricing' | 'marketing' | 'research' | 'marketplace' | 'staff' | 'network'
  | 'community' | 'leaderboard' | 'devlog' | 'settings';

interface NavDef { id: NavId; href: string; ico: string; key: PlayKey; minEra?: number }

const NAV: Array<{ head: PlayKey; items: NavDef[] }> = [
  { head: 'nav.operate', items: [
    { id: 'dashboard', href: '/play', ico: '▣', key: 'nav.dashboard' },
    { id: 'shift', href: '/play/shift', ico: '⏱', key: 'nav.shift' },
    { id: 'tickets', href: '/play/tickets', ico: '✉', key: 'nav.tickets' },
    { id: 'customers', href: '/play/customers', ico: '◉', key: 'nav.customers' },
    { id: 'servers', href: '/play/servers', ico: '▤', key: 'nav.servers' },
    { id: 'finance', href: '/play/finance', ico: '$', key: 'nav.finance' },
  ] },
  { head: 'nav.grow', items: [
    { id: 'pricing', href: '/play/pricing', ico: '⌘', key: 'nav.pricing' },
    { id: 'marketing', href: '/play/marketing', ico: '◐', key: 'nav.marketing' },
    { id: 'research', href: '/play/research', ico: '⚙', key: 'nav.research' },
    { id: 'marketplace', href: '/play/marketplace', ico: '◈', key: 'nav.marketplace' },
    { id: 'staff', href: '/play/staff', ico: '☰', key: 'nav.staff', minEra: 2 },
    { id: 'network', href: '/play/network', ico: '◴', key: 'nav.network', minEra: 2 },
  ] },
  { head: 'nav.meta', items: [
    { id: 'community', href: '/play/community', ico: '✎', key: 'nav.community' },
    { id: 'leaderboard', href: '/play/leaderboard', ico: '⌖', key: 'nav.leaderboard' },
    { id: 'devlog', href: '/play/devlog', ico: '▶', key: 'nav.devlog' },
    { id: 'settings', href: '/play/settings', ico: '⚒', key: 'nav.settings' },
  ] },
];

function badgeFor(s: ShellData, id: NavId): string {
  const L = s.locale;
  if (id === 'tickets' && s.counts.openTickets > 0) {
    const n = s.counts.openTickets;
    return `<span class="badge" title="${esc(pt(L, 'nav.badge.open_tickets', { n }))}">${n}</span>`;
  }
  if (id === 'customers' && s.counts.newCustomers24h > 0) {
    const n = s.counts.newCustomers24h;
    return `<span class="badge new" title="${esc(pt(L, 'nav.badge.new_customers', { n }))}">+${n}</span>`;
  }
  if (id === 'servers') return `<span class="badge muted">${s.counts.servers}</span>`;
  if (id === 'research') {
    const t = pt(L, 'nav.badge.research', { owned: s.counts.upgradesOwned, total: s.counts.upgradesTotal });
    return `<span class="badge muted" title="${esc(t)}">${s.counts.upgradesOwned}/${s.counts.upgradesTotal}</span>`;
  }
  return '';
}

export function eraReqLabel(locale: PlayLocale, key: EraProgress['reqs'][number]['key']): string {
  return pt(locale, (`era.req.${key}`) as PlayKey);
}

function eraReqValue(r: EraProgress['reqs'][number], cur: boolean): string {
  const v = cur ? r.current : r.needed;
  return r.key === 'mrr' ? '$' + v.toLocaleString('en-US') : String(v);
}

/** A korszak-feltételek listája (oldalsáv-doboz és a zárolt oldalak közösen használják). */
export function renderEraReqs(locale: PlayLocale, ep: EraProgress): string {
  return ep.reqs.map((r) => `
      <div class="era-req${r.done ? ' done' : ''}">
        <div class="era-req-row"><span>${r.done ? '✓' : '·'} ${esc(eraReqLabel(locale, r.key))}</span><span class="era-req-v">${esc(eraReqValue(r, true))} / ${esc(eraReqValue(r, false))}</span></div>
        <div class="era-req-bar"><i style="width:${r.pct}%"></i></div>
      </div>`).join('');
}

function renderEraBox(s: ShellData): string {
  const L = s.locale;
  const ep = s.era2;
  if (!ep) return `<div class="era-box era-max">🏁 ${esc(pt(L, 'era.max'))}</div>`;
  return `
    <details class="era-box" id="era-box">
      <summary title="${esc(pt(L, 'era.toggle'))}">
        <span class="era-ico">🎯</span>
        <span class="era-head"><span class="era-k">${esc(pt(L, 'era.next'))}</span><b>${esc(pt(L, 'era.title', { n: ep.target_era, name: ep.target_display }))}</b></span>
        <span class="era-count">${ep.met_count}/${ep.total}</span>
      </summary>
      <div class="era-reqs">${renderEraReqs(L, ep)}</div>
    </details>`;
}

/** Alacsony pénznél érthető figyelmeztetés (2026-11-12): mi történik, és mit tehetsz. Különben, ha a hirdetési
 *  keret visszafogja a PPC-t, egy rövid megjegyzés. A stílus a meglévő .runway.danger osztályt használja. */
export function cashWarning(s: ShellData): string {
  const L = s.locale;
  if (s.cashCents < LOW_CASH_WARN_CENTS) {
    return `<div class="runway danger cash-warn" role="status"><span>⚠ ${esc(pt(L, 'cash.low_warn'))}</span></div>`;
  }
  if (s.flow.ppc_throttled) {
    return `<div class="runway cash-note"><span>${esc(pt(L, 'cash.ads_capped'))}</span></div>`;
  }
  return '';
}

export function renderSidebar(s: ShellData, active: NavId): string {
  const L = s.locale;
  const runwayTxt = s.flow.runway_days === null ? pt(L, 'runway.safe') : pt(L, 'runway.days', { n: s.flow.runway_days });
  // A kifutás-sáv: 60 nap = tele; nem fogyó pénz = tele.
  const runwayPct = s.flow.runway_days === null ? 100 : Math.max(3, Math.min(100, Math.round((s.flow.runway_days / 60) * 100)));
  const runwayCls = s.flow.runway_days !== null && s.flow.runway_days < 7 ? ' danger' : '';
  const sections = NAV.map((sec) => {
    const items = sec.items.map((it) => {
      const locked = it.minEra !== undefined && s.era < it.minEra;
      const cls = ['nav-item', it.id === active ? 'active' : '', locked ? 'locked' : ''].filter(Boolean).join(' ');
      const tail = locked
        ? `<span class="lock">🔒 ${esc(pt(L, 'nav.locked_era', { n: it.minEra! }))}</span>`
        : badgeFor(s, it.id);
      const cur = it.id === active ? ' aria-current="page"' : '';
      return `<a class="${cls}" href="${it.href}"${cur}><span class="ico">${it.ico}</span> <span class="lbl">${esc(pt(L, it.key))}</span> ${tail}</a>`;
    }).join('\n');
    return `<div class="nav-section"><div class="nav-head">${esc(pt(L, sec.head))}</div>${items}</div>`;
  }).join('\n');
  return `<aside id="play-nav" data-shell="1">
    <a class="brand" href="/play"><div class="brand-mark"></div>Hyperscales</a>
    <button type="button" class="nav-close" aria-label="${esc(pt(L, 'nav.close_menu'))}">✕</button>
    <div class="company-card">
      <div class="row">
        <div class="crest">${esc(s.initials)}</div>
        <div>
          <div class="name">${esc(s.company)} <a class="edit" href="/play/settings" title="${esc(pt(L, 'company.rename'))}">✎</a></div>
          <div class="sub">${esc(pt(L, 'company.sub', { year: s.founded, era: s.era, day: s.day }))}</div>
        </div>
      </div>
      <div class="runway${runwayCls}" title="${esc(pt(L, 'tip.runway'))}">
        <span>${esc(pt(L, 'runway.label'))}</span><b>${esc(runwayTxt)}</b>
      </div>
      <div class="bar"><i style="width:${runwayPct}%"></i></div>
      ${cashWarning(s)}
    </div>
    ${sections}
    ${renderEraBox(s)}
    <div class="side-foot">
      <div>Hyperscales · ${esc(pt(L, 'foot.beta'))}</div>
      <a href="#">⌨ ${esc(pt(L, 'foot.shortcuts'))} ⌘K</a>
      <div class="me"><span class="ava">${esc(s.displayName.trim().charAt(0).toUpperCase() || '?')}</span><span class="me-name">${esc(s.displayName)}</span> · ${esc(pt(L, 'foot.logout'))}</div>
    </div>
  </aside>
  <div class="nav-backdrop" hidden></div>`;
}

export function renderTopbar(s: ShellData, crumbs: string[]): string {
  const L = s.locale;
  const crumbHtml = [pt(L, 'crumbs.play'), ...crumbs].map((c, i, a) =>
    i === a.length - 1 ? `<b>${esc(c)}</b>` : `<span>${esc(c)}</span><span class="sep">›</span>`).join('');
  const net = s.flow.net_per_day_cents;
  const netTxt = (net >= 0 ? '+' : '') + pt(L, 'top.per_day', { v: usd(net).replace('−', '-') });
  const newC = s.counts.newCustomers24h;
  return `<header class="topbar">
      <button type="button" class="nav-toggle" aria-label="${esc(pt(L, 'nav.open_menu'))}" aria-controls="play-nav" aria-expanded="false">☰</button>
      <div class="crumbs">${crumbHtml}</div>
      <div class="clock" title="${esc(pt(L, 'top.next_day_tip'))}">
        <div class="day">${esc(pt(L, 'top.day', { n: s.day }))}</div>
        <div class="time" data-next-day-at="${s.nextDayAt}" data-tpl="${esc(pt(L, 'top.next_day'))}" data-hm="${esc(pt(L, 'top.hm'))}"></div>
      </div>
      <div class="topbar-stats">
        <div class="tstat cash" title="${esc(pt(L, 'tip.cash'))}"><span class="k">${esc(pt(L, 'top.cash'))}</span><span class="v"><span class="num" data-cash-cents="${s.cashCents}">${esc(usd(s.cashCents))}</span><small class="${net < 0 ? 'dn' : ''}">${esc(netTxt)}</small></span></div>
        <div class="tstat" title="${esc(pt(L, 'tip.mrr'))}"><span class="k">${esc(pt(L, 'top.mrr'))}</span><span class="v">${esc(usd(s.mrrCents))}</span></div>
        <div class="tstat" title="${esc(pt(L, 'tip.reputation'))}"><span class="k">${esc(pt(L, 'top.rep'))}</span><span class="v">${s.rep}</span></div>
        <div class="tstat" title="${esc(pt(L, 'tip.customers'))}"><span class="k">${esc(pt(L, 'top.customers'))}</span><span class="v">${s.counts.customers}${newC > 0 ? `<small>+${newC}</small>` : ''}</span></div>
      </div>
      <div class="topbar-actions"><button class="bell" type="button" aria-label="Inbox">🔔</button></div>
    </header>`;
}

const ASIDE_RE = /<aside[\s>][\s\S]*?<\/aside>/;
const TOPBAR_RE = /<header class="topbar">[\s\S]*?<\/header>/;

/** A sablon-HTML oldalsávját és felső sávját a közös, valós adatos keretre cseréli. */
export function applyShell(pageHtml: string, s: ShellData, active: NavId, crumbs: string[]): string {
  let out = pageHtml;
  if (ASIDE_RE.test(out)) out = out.replace(ASIDE_RE, () => renderSidebar(s, active));
  if (TOPBAR_RE.test(out)) out = out.replace(TOPBAR_RE, () => renderTopbar(s, crumbs));
  return out;
}

const CONTENT_RE = /<div class="content">[\s\S]*<\/div>\s*<\/main>/;

/** A sablon <div class="content">…</div> blokkját (a </main>-ig) a szerveroldalon renderelt tartalomra cseréli. */
export function applyContent(pageHtml: string, contentHtml: string): string {
  return pageHtml.replace(CONTENT_RE, () => contentHtml + '\n  </main>');
}

/** A kliensoldali keret-szkriptnek (toast, számanimáció) átadott szövegek. */
export function shellClientStrings(locale: PlayLocale): Record<string, string> {
  return clientStrings(locale, ['toast.', 'nav.']);
}

