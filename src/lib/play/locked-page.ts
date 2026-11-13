// src/lib/play/locked-page.ts
// Hyperscales — a Csapat (/play/staff) és Hálózat (/play/network) lap (2026-11-11).
// Korábban mindkettő saját, egymásnak és a vezérlőnek is ellentmondó „Era 2" feltétellistát mutatott
// (pl. „Reach $100 MRR ✓" miközben $15 volt, „Lease a colo cabinet", „Survive 30 days", „Rep ≥ 65"),
// alatta kitalált jelöltekkel, BGP-peerekkel és késleltetés-térképpel. Most: a korszak-feltételek
// ugyanabból a forrásból (eraProgress), mint a vezérlő és az oldalsáv, és egy rövid lista arról, mi vár ott.
// 2026-11-13: mindkét funkció kész (a 2. korszaktól), így a lista már nem „tervezett", hanem „mi vár itt".

import { esc, renderEraReqs, type ShellData } from './shell';
import { pt, type PlayKey } from './strings';

export function renderLockedFeature(shell: ShellData, which: 'staff' | 'network'): string {
  const L = shell.locale;
  const ep = shell.era2;
  const unlocked = shell.era >= 2;
  const planned = ([1, 2, 3] as const).map((i) => `<li>${esc(pt(L, (`${which}.planned${i}`) as PlayKey))}</li>`).join('');
  const reqBlock = !unlocked && ep && ep.target_era === 2
    ? `<div class="era-req-title">${esc(pt(L, 'era.requirements', { met: ep.met_count, total: ep.total }))}</div>
       <div class="era-reqs era-reqs-card">${renderEraReqs(L, ep)}</div>`
    : '';
  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, (`nav.${which}`) as PlayKey))} <span class="count">${esc(unlocked ? pt(L, 'locked.soon') : '🔒 ' + pt(L, 'era.locked_title', { n: 2, name: 'Colo' }))}</span></h1>
        <div class="sub">${esc(pt(L, (`${which}.sub`) as PlayKey))}</div>
      </div></div>
      <section class="panel locked-card lk-card">
        <div class="lk-ico">${which === 'staff' ? '☰' : '◴'}</div>
        <h2>${esc(pt(L, (`${which}.title`) as PlayKey))}</h2>
        <p>${esc(pt(L, unlocked ? 'locked.in_progress' : 'locked.body', { n: 2 }))}</p>
        ${reqBlock}
        <div class="lk-planned">
          <div class="era-req-title">${esc(pt(L, 'locked.planned'))}</div>
          <ul>${planned}</ul>
        </div>
        <div class="lk-actions"><a class="btn" href="/play">${esc(pt(L, 'locked.back'))}</a></div>
      </section>
    </div>`;
}
