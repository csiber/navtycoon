#!/usr/bin/env node
// Template -> Astro converter. One-shot generator.
//
// Reads template/*.html files, extracts the full <style> block and the <body>
// content, then wraps each into an Astro page that:
//   - has frontmatter for auth-gating (/play/*) + data-fetching
//   - replaces hardcoded values with backend data via a JSON island the
//     client hydrates from
//   - keeps everything else AS-IS (visual design preserved verbatim)
//
// Pass 1 -- wired pages: Landing (public), Dashboard, Customers, Servers,
//   Tickets. Real backend data injected.
// Pass 2 -- static pages: Finance, Devlog, Leaderboard, Marketplace, Network,
//   Research, Staff, Settings. Auth-gated but content kept as-is.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = '/home/aika/navtycoon';
const TEMPLATES = `${ROOT}/template`;
const PAGES = `${ROOT}/src/pages`;

function readTemplate(name) {
  return readFileSync(`${TEMPLATES}/Hyperscaler ${name}.html`, 'utf8');
}

function extractStyle(html) {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  return m ? m[1] : '';
}

function extractScripts(body) {
  const scripts = [];
  const cleaned = body.replace(/<script[\s\S]*?<\/script>/g, (match) => {
    if (match.includes('cdn-cgi/scripts')) return '';
    scripts.push(match);
    return '';
  });
  return { scriptless: cleaned, scripts };
}

function rewriteNavLinks(html) {
  const map = {
    'Hyperscaler Landing.html': '/',
    'Hyperscaler Dashboard.html': '/play',
    'Hyperscaler Customers.html': '/play/customers',
    'Hyperscaler Servers.html': '/play/servers',
    'Hyperscaler Tickets.html': '/play/tickets',
    'Hyperscaler Finance.html': '/play/finance',
    'Hyperscaler Devlog.html': '/play/devlog',
    'Hyperscaler Leaderboard.html': '/play/leaderboard',
    'Hyperscaler Marketplace.html': '/play/marketplace',
    'Hyperscaler Network.html': '/play/network',
    'Hyperscaler Research.html': '/play/research',
    'Hyperscaler Staff.html': '/play/staff',
    'Hyperscaler Settings.html': '/play/settings',
  };
  let out = html;
  for (const [from, to] of Object.entries(map)) {
    const re1 = new RegExp(`href="${from.replace(/[.]/g, '\\.')}"`, 'g');
    out = out.replace(re1, `href="${to}"`);
    const fromEnc = from.replace(/ /g, '%20');
    const re2 = new RegExp(`href="${fromEnc.replace(/[.]/g, '\\.')}"`, 'g');
    out = out.replace(re2, `href="${to}"`);
  }
  return out;
}

function generate(name, opts) {
  const html = readTemplate(name);
  const css = extractStyle(html);
  const body = rewriteNavLinks(extractBody(html));
  const { scriptless, scripts } = extractScripts(body);
  const linkSharedCss = opts.useSharedCss
    ? `<link rel="stylesheet" href="/css/template.css" />`
    : '';

  const sharedAstroProps = `
const pageCss = ${JSON.stringify(css)};
const pageHtml = ${JSON.stringify(scriptless)};
`.trim();

  const frontmatter = `---
${opts.frontmatter}
${sharedAstroProps}
---`;

  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
${linkSharedCss}
<style is:global set:html={pageCss}></style>
</head>
<body>
<Fragment set:html={pageHtml} />
${opts.stateScript ?? ''}
${scripts.join('\n')}
${opts.extraScripts ?? ''}
</body>
</html>`;

  const out = `${frontmatter}\n${head}\n`;
  const path = `${PAGES}/${opts.outPath}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out, 'utf8');
  console.log(`wrote ${path}`);
}

// ── PASS 1: wired pages ──────────────────────────────────────────────

generate('Landing', {
  title: 'Hyperscaler — Run a hosting empire where every customer is AI',
  frontmatter: `// /  -- public marketing page. No auth, static content.`,
  outPath: 'index.astro',
  useSharedCss: false,
  extraScripts: `<script is:inline>
    // Wire the template's primary CTAs to real routes.
    document.querySelectorAll('.btn-primary').forEach(b => {
      b.addEventListener('click', () => { window.location.href = '/signup'; });
    });
    document.querySelectorAll('.nav-cta').forEach(b => {
      b.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/signup'; });
    });
  </script>`,
});

generate('Dashboard', {
  title: 'Hyperscaler — Dashboard',
  frontmatter: `// /play -- main dashboard. Auth-required.
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer } from '../../lib/game/db';

type AnyCtx = Parameters<typeof getCurrentUser>[0];
const ctx = Astro as unknown as AnyCtx;

const user = await getCurrentUser(ctx);
if (!user) return Astro.redirect('/login?next=/play');
const db = getDB(ctx);
if (!db) return new Response('No DB', { status: 500 });
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');

const customerCount = (await db.prepare(
  'SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1',
).bind(user.id).first<{ n: number }>())?.n ?? 0;
const serverCount = (await db.prepare(
  'SELECT COUNT(*) AS n FROM servers WHERE player_id = ?',
).bind(user.id).first<{ n: number }>())?.n ?? 0;
const openTickets = (await db.prepare(
  \`SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status IN ('open', 'in_progress')\`,
).bind(user.id).first<{ n: number }>())?.n ?? 0;

const cashUsd = (player.cash_usd_cents / 100).toFixed(0);
const mrrUsd = (player.mrr_usd_cents / 100).toFixed(0);
const companyName = player.company_name;
const founded = new Date(player.founded_at * 1000).getFullYear();
const dayNum = Math.max(1, Math.floor((Date.now() / 1000 - player.founded_at) / 86400) + 1);
const initials = companyName.split(/\\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || 'HY';`,
  outPath: 'play/index.astro',
  useSharedCss: false,
  stateScript: `<script type="application/json" id="state" set:html={JSON.stringify({
    company: companyName, cashUsd, mrrUsd, rep: player.reputation,
    customers: customerCount, servers: serverCount, tickets: openTickets,
    era: player.current_era, founded, day: dayNum, initials,
  })}></script>`,
  extraScripts: `<script is:inline>
    // Hydrate template hardcoded values with backend data.
    try {
      const s = JSON.parse(document.getElementById('state').textContent);
      const crest = document.querySelector('.company-card .crest');
      if (crest) crest.textContent = s.initials;
      const cname = document.querySelector('.company-card .name');
      if (cname && cname.firstChild) cname.firstChild.textContent = s.company + ' ';
      const csub = document.querySelector('.company-card .sub');
      if (csub) csub.textContent = 'EST ' + s.founded + ' · ERA ' + s.era + ' · DAY ' + s.day;
      const nav = document.querySelectorAll('aside .nav-item');
      nav.forEach(a => {
        const t = a.textContent || '';
        const b = a.querySelector('.badge');
        if (b && t.includes('Servers')) b.textContent = String(s.servers);
        if (b && t.includes('Customers')) b.textContent = s.customers > 0 ? '+' + s.customers : '0';
        if (b && t.includes('Tickets')) b.textContent = String(s.tickets);
      });
      const ts = document.querySelectorAll('.topbar-stats .tstat .v');
      if (ts[0] && ts[0].firstChild) ts[0].firstChild.textContent = '$' + s.cashUsd;
      if (ts[1] && ts[1].firstChild) ts[1].firstChild.textContent = '$' + s.mrrUsd;
      if (ts[2] && ts[2].firstChild) ts[2].firstChild.textContent = String(s.rep);
      if (ts[3] && ts[3].firstChild) ts[3].firstChild.textContent = String(s.customers);
      const kc = document.querySelector('.kpi.cash .v');
      if (kc && kc.firstChild) kc.firstChild.textContent = '$' + s.cashUsd + '.00 ';
      const km = document.querySelector('.kpi.mrr .v');
      if (km && km.firstChild) km.firstChild.textContent = '$' + s.mrrUsd + '.00 ';
      const kr = document.querySelector('.kpi.rep .v');
      if (kr && kr.firstChild) kr.firstChild.textContent = s.rep + ' ';
      const ku = document.querySelector('.kpi.cust .v');
      if (ku && ku.firstChild) ku.firstChild.textContent = s.customers + ' ';
    } catch (e) { console.error('hydrate', e); }
  </script>`,
});

generate('Customers', {
  title: 'Hyperscaler — Customers',
  frontmatter: `// /play/customers -- auth-required.
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer, listCustomers } from '../../lib/game/db';

type AnyCtx = Parameters<typeof getCurrentUser>[0];
const ctx = Astro as unknown as AnyCtx;

const user = await getCurrentUser(ctx);
if (!user) return Astro.redirect('/login?next=/play/customers');
const db = getDB(ctx);
if (!db) return new Response('No DB', { status: 500 });
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');

const customers = await listCustomers(db, user.id, true);
const companyName = player.company_name;
const initials = companyName.split(/\\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || 'HY';
const dayNum = Math.max(1, Math.floor((Date.now() / 1000 - player.founded_at) / 86400) + 1);
const founded = new Date(player.founded_at * 1000).getFullYear();
const cashUsd = (player.cash_usd_cents / 100).toFixed(0);
const mrrUsd = (player.mrr_usd_cents / 100).toFixed(0);
const customerData = customers.map(c => ({
  id: c.id, name: c.name, persona: c.persona_archetype, plan: c.plan_tier,
  satisfaction: c.satisfaction, ltv: c.lifetime_value_cents / 100,
  joined: new Date(c.joined_at * 1000).toLocaleDateString('en-US'),
}));`,
  outPath: 'play/customers.astro',
  useSharedCss: true,
  stateScript: `<script type="application/json" id="state" set:html={JSON.stringify({
    company: companyName, initials, founded, day: dayNum, era: player.current_era,
    cashUsd, mrrUsd, rep: player.reputation, customers: customerData,
  })}></script>`,
  extraScripts: `<script is:inline>
    try {
      const s = JSON.parse(document.getElementById('state').textContent);
      const crest = document.querySelector('.company-card .crest');
      if (crest) crest.textContent = s.initials;
      const cname = document.querySelector('.company-card .name');
      if (cname && cname.firstChild) cname.firstChild.textContent = s.company + ' ';
      const csub = document.querySelector('.company-card .sub');
      if (csub) csub.textContent = 'EST ' + s.founded + ' · ERA ' + s.era + ' · DAY ' + s.day;
      const ts = document.querySelectorAll('.topbar-stats .tstat .v');
      if (ts[0] && ts[0].firstChild) ts[0].firstChild.textContent = '$' + s.cashUsd;
      if (ts[1] && ts[1].firstChild) ts[1].firstChild.textContent = '$' + s.mrrUsd;
      if (ts[2] && ts[2].firstChild) ts[2].firstChild.textContent = String(s.rep);
      const h1 = document.querySelector('.pagehead h1');
      if (h1) {
        const count = h1.querySelector('.count');
        if (h1.firstChild) h1.firstChild.textContent = 'Customers ';
        if (count) count.textContent = s.customers.length + ' active';
      }
      const list = document.querySelector('.cust-list');
      if (list && s.customers.length >= 0) {
        list.querySelectorAll('.cust-row').forEach(r => r.remove());
        if (s.customers.length === 0) {
          const empty = document.createElement('div');
          empty.style.padding = '24px';
          empty.style.color = 'var(--muted)';
          empty.textContent = 'No customers yet. Buy a server to attract them.';
          list.appendChild(empty);
        }
        s.customers.forEach((c, i) => {
          const initial = (c.name[0] || '?').toUpperCase();
          const row = document.createElement('div');
          row.className = 'cust-row' + (i === 0 ? ' selected' : '');
          const av = document.createElement('div');
          av.className = 'av av-' + initial;
          av.textContent = initial;
          const mid = document.createElement('div');
          const mname = document.createElement('div');
          mname.className = 'name';
          mname.textContent = c.name;
          const mmeta = document.createElement('div');
          mmeta.className = 'meta';
          mmeta.textContent = c.plan.toUpperCase() + ' · joined ' + c.joined;
          mid.appendChild(mname);
          mid.appendChild(mmeta);
          const right = document.createElement('div');
          right.className = 'right';
          const mrr = document.createElement('div');
          mrr.className = 'mrr';
          mrr.textContent = '$' + c.ltv.toFixed(0) + ' LTV';
          const mood = document.createElement('div');
          mood.className = 'mood ' + (c.satisfaction >= 60 ? 'good' : c.satisfaction >= 30 ? 'warn' : 'bad');
          mood.textContent = c.satisfaction + ' · ' + c.persona;
          right.appendChild(mrr);
          right.appendChild(mood);
          row.appendChild(av);
          row.appendChild(mid);
          row.appendChild(right);
          list.appendChild(row);
        });
      }
    } catch (e) { console.error('hydrate', e); }
  </script>`,
});

generate('Servers', {
  title: 'Hyperscaler — Servers',
  frontmatter: `// /play/servers -- auth-required.
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer, listServers, listUpgrades } from '../../lib/game/db';
import { SERVER_SPECS, affordableServerTypes } from '../../lib/game/server-types';
import { availableUpgrades, UPGRADE_SPECS } from '../../lib/game/upgrade-tree';

type AnyCtx = Parameters<typeof getCurrentUser>[0];
const ctx = Astro as unknown as AnyCtx;

const user = await getCurrentUser(ctx);
if (!user) return Astro.redirect('/login?next=/play/servers');
const db = getDB(ctx);
if (!db) return new Response('No DB', { status: 500 });
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');

const servers = await listServers(db, user.id);
const ownedUpgradeIds = new Set((await listUpgrades(db, user.id)).map(u => u.upgrade_id));
const buyable = affordableServerTypes(player.current_era);
const upgradesAvail = availableUpgrades(player.current_era, ownedUpgradeIds);

const companyName = player.company_name;
const initials = companyName.split(/\\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || 'HY';
const dayNum = Math.max(1, Math.floor((Date.now() / 1000 - player.founded_at) / 86400) + 1);
const founded = new Date(player.founded_at * 1000).getFullYear();
const cashUsd = (player.cash_usd_cents / 100).toFixed(0);
const mrrUsd = (player.mrr_usd_cents / 100).toFixed(0);
const serversData = servers.map(s => {
  const spec = SERVER_SPECS[s.type];
  return {
    id: s.id, type: s.type, name: spec?.display_name ?? s.type,
    capacity: s.capacity, load: s.current_load,
    monthly: s.monthly_cost_cents / 100, era: s.era,
  };
});
const buyableData = buyable.map(s => ({
  type: s.type, name: s.display_name, cost: s.purchase_cost_cents / 100,
  flavor: s.flavor, capacity: s.capacity, monthly: s.monthly_cost_cents / 100,
  affordable: player.cash_usd_cents >= s.purchase_cost_cents,
}));
const upgradesData = upgradesAvail.map(u => ({
  id: u.id, name: u.display_name, cost: u.cost_usd_cents / 100, effect: u.effect,
  affordable: player.cash_usd_cents >= u.cost_usd_cents,
}));`,
  outPath: 'play/servers.astro',
  useSharedCss: true,
  stateScript: `<script type="application/json" id="state" set:html={JSON.stringify({
    company: companyName, initials, founded, day: dayNum, era: player.current_era,
    cashUsd, mrrUsd, rep: player.reputation,
    servers: serversData, buyable: buyableData, upgrades: upgradesData,
    ownedUpgradeCount: ownedUpgradeIds.size, totalUpgradeCount: UPGRADE_SPECS.length,
  })}></script>`,
  extraScripts: `<script is:inline>
    try {
      const s = JSON.parse(document.getElementById('state').textContent);
      const crest = document.querySelector('.company-card .crest');
      if (crest) crest.textContent = s.initials;
      const cname = document.querySelector('.company-card .name');
      if (cname && cname.firstChild) cname.firstChild.textContent = s.company + ' ';
      const csub = document.querySelector('.company-card .sub');
      if (csub) csub.textContent = 'EST ' + s.founded + ' · ERA ' + s.era + ' · DAY ' + s.day;
      const ts = document.querySelectorAll('.topbar-stats .tstat .v');
      if (ts[0] && ts[0].firstChild) ts[0].firstChild.textContent = '$' + s.cashUsd;
      if (ts[1] && ts[1].firstChild) ts[1].firstChild.textContent = '$' + s.mrrUsd;
      if (ts[2] && ts[2].firstChild) ts[2].firstChild.textContent = String(s.rep);
      const h1 = document.querySelector('.pagehead h1');
      if (h1) {
        const count = h1.querySelector('.count');
        if (h1.firstChild) h1.firstChild.textContent = 'Servers ';
        if (count) count.textContent = s.servers.length + ' owned';
      }
    } catch (e) { console.error('hydrate', e); }

    // Buy-server + buy-upgrade handlers (preserved from old page).
    document.addEventListener('click', async (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest('[data-buy-server], [data-buy-upgrade]');
      if (!btn) return;
      ev.preventDefault();
      if (btn.dataset.buyServer) {
        const r = await fetch('/api/game/server', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: btn.dataset.buyServer }),
        });
        if (!r.ok) { alert('Error: ' + await r.text()); return; }
        location.reload();
      } else if (btn.dataset.buyUpgrade) {
        const r = await fetch('/api/game/upgrade', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ upgrade_id: btn.dataset.buyUpgrade }),
        });
        if (!r.ok) { alert('Error: ' + await r.text()); return; }
        location.reload();
      }
    });
  </script>`,
});

generate('Tickets', {
  title: 'Hyperscaler — Tickets',
  frontmatter: `// /play/tickets -- auth-required, read-only triage (Plan 1).
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer, listTickets, listCustomers } from '../../lib/game/db';

type AnyCtx = Parameters<typeof getCurrentUser>[0];
const ctx = Astro as unknown as AnyCtx;

const user = await getCurrentUser(ctx);
if (!user) return Astro.redirect('/login?next=/play/tickets');
const db = getDB(ctx);
if (!db) return new Response('No DB', { status: 500 });
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');

const open = await listTickets(db, user.id, 'open');
const inProgress = await listTickets(db, user.id, 'in_progress');
const tickets = [...open, ...inProgress];
const customers = await listCustomers(db, user.id, true);
const customerMap = new Map(customers.map(c => [c.id, c]));

const ageMin = (created: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const m = Math.floor((now - created) / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
};

const companyName = player.company_name;
const initials = companyName.split(/\\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || 'HY';
const dayNum = Math.max(1, Math.floor((Date.now() / 1000 - player.founded_at) / 86400) + 1);
const founded = new Date(player.founded_at * 1000).getFullYear();
const cashUsd = (player.cash_usd_cents / 100).toFixed(0);
const mrrUsd = (player.mrr_usd_cents / 100).toFixed(0);
const ticketsData = tickets.map(t => {
  const c = customerMap.get(t.customer_id);
  return {
    id: t.id, summary: t.summary, body: t.full_text,
    customer: c?.name ?? 'Unknown',
    persona: c?.persona_archetype ?? 'unknown',
    age: ageMin(t.created_at),
  };
});`,
  outPath: 'play/tickets.astro',
  useSharedCss: true,
  stateScript: `<script type="application/json" id="state" set:html={JSON.stringify({
    company: companyName, initials, founded, day: dayNum, era: player.current_era,
    cashUsd, mrrUsd, rep: player.reputation, tickets: ticketsData,
  })}></script>`,
  extraScripts: `<script is:inline>
    try {
      const s = JSON.parse(document.getElementById('state').textContent);
      const crest = document.querySelector('.company-card .crest');
      if (crest) crest.textContent = s.initials;
      const cname = document.querySelector('.company-card .name');
      if (cname && cname.firstChild) cname.firstChild.textContent = s.company + ' ';
      const csub = document.querySelector('.company-card .sub');
      if (csub) csub.textContent = 'EST ' + s.founded + ' · ERA ' + s.era + ' · DAY ' + s.day;
      const ts = document.querySelectorAll('.topbar-stats .tstat .v');
      if (ts[0] && ts[0].firstChild) ts[0].firstChild.textContent = '$' + s.cashUsd;
      if (ts[1] && ts[1].firstChild) ts[1].firstChild.textContent = '$' + s.mrrUsd;
      if (ts[2] && ts[2].firstChild) ts[2].firstChild.textContent = String(s.rep);
    } catch (e) { console.error('hydrate', e); }
  </script>`,
});

// ── PASS 2: static auth-gated pages ──────────────────────────────────

const staticPages = [
  { name: 'Finance', path: 'finance' },
  { name: 'Devlog', path: 'devlog' },
  { name: 'Leaderboard', path: 'leaderboard' },
  { name: 'Marketplace', path: 'marketplace' },
  { name: 'Network', path: 'network' },
  { name: 'Research', path: 'research' },
  { name: 'Staff', path: 'staff' },
  { name: 'Settings', path: 'settings' },
];

for (const p of staticPages) {
  const html = readTemplate(p.name);
  const useSharedCss = /shared\.css/.test(html);
  generate(p.name, {
    title: `Hyperscaler — ${p.name}`,
    frontmatter: `// /play/${p.path} -- TODO Plan 3: wire backend.
// Auth-gate only; static content from design template.
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer } from '../../lib/game/db';

type AnyCtx = Parameters<typeof getCurrentUser>[0];
const ctx = Astro as unknown as AnyCtx;

const user = await getCurrentUser(ctx);
if (!user) return Astro.redirect('/login?next=/play/${p.path}');
const db = getDB(ctx);
if (!db) return new Response('No DB', { status: 500 });
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');`,
    outPath: `play/${p.path}.astro`,
    useSharedCss,
  });
}

console.log('done.');
