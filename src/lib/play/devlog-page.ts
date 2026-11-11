// src/lib/play/devlog-page.ts
// Hyperscales — a /play/devlog („Fejlesztői napló") szerveroldalon (2026-11-11).
// Korábban: angol fejlécek, „Released 1. nap · Build —", „0 players online", kitalált ütemterv
// (Steam Workshop, konzol-port, BYO model) és egy nem létező Discord 14.2k taggal.
// Most: a cég valós idővonala (események, fejlesztések, új ügyfelek) egy listában, a néző nyelvén,
// és egy őszinte, rövid „tervezett" lista.

import { esc, type ShellData } from './shell';
import { pt, type PlayKey } from './strings';
import { eventLine, ago, type FeedEvent } from './events';
import { upgradeName } from './catalog';
import { personaLabel } from './customers-page';

export interface DevlogData {
  shell: ShellData;
  now: number;
  events: FeedEvent[];
  upgrades: Array<{ upgrade_id: string; purchased_at: number }>;
  joins: Array<{ name: string; persona_archetype: string; joined_at: number }>;
}

interface Item { ts: number; tone: string; tag: string; text: string }

export function renderDevlogContent(d: DevlogData): string {
  const s = d.shell;
  const L = s.locale;
  const items: Item[] = [
    ...d.events.map((e) => { const l = eventLine(L, e); return { ts: e.spawned_at, tone: l.tone, tag: pt(L, 'dl.tag.event'), text: l.text }; }),
    ...d.upgrades.map((u) => ({ ts: u.purchased_at, tone: 'good', tag: pt(L, 'dl.tag.upgrade'), text: pt(L, 'toast.bought_upgrade', { name: upgradeName(L, u.upgrade_id) }) })),
    ...d.joins.map((c) => ({ ts: c.joined_at, tone: 'info', tag: pt(L, 'dl.tag.customer'), text: pt(L, 'dl.join', { name: c.name, persona: personaLabel(L, c.persona_archetype) }) })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 60);
  const dayOf = (ts: number) => Math.max(1, Math.floor((ts - (s.nextDayAt - s.day * 86400)) / 86400) + 1);
  const list = items.length === 0
    ? `<div class="dl-empty">${esc(pt(L, 'dl.empty'))}</div>`
    : items.map((it) => `
          <div class="dl-item ${it.tone}">
            <div class="dl-when"><b>${esc(pt(L, 'top.day', { n: dayOf(it.ts) }))}</b><span>${esc(ago(L, d.now - it.ts))}</span></div>
            <div class="dl-tag">${esc(it.tag)}</div>
            <div class="dl-text">${esc(it.text)}</div>
          </div>`).join('');
  const planned = ([1, 2, 3, 4] as const).map((i) => `<li>${esc(pt(L, (`dl.plan${i}`) as PlayKey))}</li>`).join('');
  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, 'nav.devlog'))} <span class="count">${esc(pt(L, 'dl.count', { e: d.events.length, u: d.upgrades.length, c: d.joins.length }))}</span></h1>
        <div class="sub">${esc(pt(L, 'dl.sub'))}</div>
      </div></div>
      <div class="dl-layout">
        <section class="panel">
          <div class="ph"><h3>${esc(pt(L, 'dl.timeline'))}</h3><span class="ph-sub">// ${items.length}</span></div>
          <div class="dl-list">${list}</div>
        </section>
        <div class="dl-side">
          <section class="panel">
            <div class="ph"><h3>${esc(pt(L, 'dl.roadmap'))}</h3><span class="ph-sub">// ${esc(pt(L, 'locked.planned'))}</span></div>
            <ul class="dl-plan">${planned}</ul>
            <div class="dl-note">${esc(pt(L, 'dl.roadmap_note'))}</div>
          </section>
          <section class="panel">
            <div class="ph"><h3>${esc(pt(L, 'nav.community'))}</h3></div>
            <div class="dl-note">${esc(pt(L, 'dl.forum'))} <a href="/play/community">${esc(pt(L, 'nav.community'))} →</a></div>
          </section>
        </div>
      </div>
    </div>`;
}
