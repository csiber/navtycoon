// src/lib/play/finale-page.ts
// Hyperscales — a záróképernyő (/play/finale), 2026-11-13 (végjáték-kör).
// Befejezés után: gratuláció, a cég története számokban, stáblista, megosztható szöveg és kép, és a két út tovább
// (folytatás sandboxként / új cég a Beállításokban). Befejezés előtt ugyanitt a végcél részletei (spoiler nélkül).

import { esc, usd, renderGoalReqs, type ShellData } from './shell';
import { pt, type PlayKey } from './strings';
import { GOAL } from '../game/endgame';

export interface FinaleStats {
  founded_at: number;
  completed_at: number | null;
  days: number | null;
  peak_mrr_cents: number;
  mrr_cents: number;
  customers_total: number;
  customers_active: number;
  shifts: number;
  tickets_resolved: number;
  staff: number;
  servers: number;
  cloud_regions: number;
  edge_pops: number;
  achievements: number;
  achievements_total: number;
}

/** A stáblista sorai (szerep-kulcs, név). A nevek nem fordítandók. */
export const CREDITS: ReadonlyArray<[PlayKey, string]> = [
  ['fin.cr.idea', 'Csaba'],
  ['fin.cr.code', 'Claude (claude-1, claude-2, …)'],
  ['fin.cr.balance', 'Claude + economy-sim.ts'],
  ['fin.cr.hub', 'claude-3 · AikaHub'],
  ['fin.cr.mascot', 'Aika 🦊'],
  ['fin.cr.testers', '—'],
];

function fmtDate(locale: string, sec: number): string {
  try {
    return new Date(sec * 1000).toLocaleDateString(locale === 'hu' ? 'hu-HU' : locale === 'de' ? 'de-DE' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return new Date(sec * 1000).toISOString().slice(0, 10);
  }
}

/** A megosztható szöveg (a kép ugyanezekből a számokból készül a kliensen). */
export function finaleShareText(s: ShellData, st: FinaleStats, url: string): string {
  return pt(s.locale, 'fin.share_text', {
    company: s.company, days: st.days ?? 0, mrr: usd(st.peak_mrr_cents), c: st.customers_total.toLocaleString('en-US'), url,
  });
}

export function renderFinaleContent(s: ShellData, st: FinaleStats, shareUrl: string): string {
  const L = s.locale;
  if (st.days == null || !s.goal) {
    // Még nincs befejezés: a végcél részletei.
    const g = s.goal;
    return `<div class="content"><div class="fin-wrap">
      <div class="pagehead"><div class="h-left">
        <h1>🏆 ${esc(pt(L, 'goal.title'))} <span class="count">${g ? `${g.met_count}/${g.total}` : ''}</span></h1>
        <div class="sub">${esc(pt(L, 'fin.pre_sub'))}</div>
      </div></div>
      <section class="panel fin-pre">
        <p>${esc(pt(L, 'goal.desc'))}</p>
        ${g ? `<div class="era-reqs era-reqs-card" style="max-width:520px">${renderGoalReqs(L, g)}</div>` : ''}
        <ul class="fin-hints">
          <li>${esc(pt(L, 'fin.hint1', { n: GOAL.min_cloud_regions }))}</li>
          <li>${esc(pt(L, 'fin.hint2', { n: GOAL.min_edge_pops }))}</li>
          <li>${esc(pt(L, 'fin.hint3'))}</li>
        </ul>
        <div class="lk-actions"><a class="btn" href="/play">${esc(pt(L, 'locked.back'))}</a></div>
      </section>
    </div></div>`;
  }
  const cell = (k: PlayKey, v: string, sub = '') => `<div class="fin-stat"><div class="k">${esc(pt(L, k))}</div><div class="v">${esc(v)}</div>${sub ? `<div class="m">${esc(sub)}</div>` : ''}</div>`;
  const stats = [
    cell('fin.st.founded', fmtDate(L, st.founded_at)),
    cell('fin.st.finished', st.completed_at ? fmtDate(L, st.completed_at) : '—', pt(L, 'fin.st.days', { n: st.days })),
    cell('fin.st.peak', usd(st.peak_mrr_cents), pt(L, 'fin.st.now', { v: usd(st.mrr_cents) })),
    cell('fin.st.customers', st.customers_total.toLocaleString('en-US'), pt(L, 'fin.st.active', { n: st.customers_active })),
    cell('fin.st.shifts', String(st.shifts), pt(L, 'fin.st.tickets', { n: st.tickets_resolved })),
    cell('fin.st.team', String(st.staff), pt(L, 'fin.st.fleet', { n: st.servers, r: st.cloud_regions, p: st.edge_pops })),
    cell('fin.st.achievements', `${st.achievements}/${st.achievements_total}`),
  ].join('');
  const credits = CREDITS.map(([k, name]) => `<div class="fin-cr"><span>${esc(pt(L, k))}</span><b>${esc(name === '—' ? pt(L, 'fin.cr.you') : name)}</b></div>`).join('');
  const text = finaleShareText(s, st, shareUrl);
  return `<div class="content"><div class="fin-wrap">
      <section class="fin-hero">
        <div class="fin-trophy" aria-hidden="true">🏆</div>
        <div class="fin-kicker">${esc(pt(L, 'fin.kicker'))}</div>
        <h1>${esc(pt(L, 'fin.title'))}</h1>
        <p class="fin-lead">${esc(pt(L, 'fin.lead', { company: s.company, days: st.days }))}</p>
      </section>
      <section class="panel fin-panel">
        <div class="ph"><h3>${esc(pt(L, 'fin.story'))}</h3><span class="ph-sub">// ${esc(s.company)}</span></div>
        <div class="fin-stats">${stats}</div>
      </section>
      <section class="panel fin-panel fin-credits">
        <div class="ph"><h3>${esc(pt(L, 'fin.credits'))}</h3></div>
        <div class="fin-cr-list">${credits}</div>
        <p class="fin-thanks">${esc(pt(L, 'fin.thanks'))}</p>
      </section>
      <section class="panel fin-panel">
        <div class="ph"><h3>${esc(pt(L, 'fin.share'))}</h3></div>
        <textarea class="fin-share-text" id="fin-share-text" readonly rows="3">${esc(text)}</textarea>
        <div class="fin-actions">
          <button class="btn" type="button" data-fin="copy">${esc(pt(L, 'fin.copy'))}</button>
          <button class="btn" type="button" data-fin="share" hidden>${esc(pt(L, 'fin.share_btn'))}</button>
          <button class="btn" type="button" data-fin="image">${esc(pt(L, 'fin.image'))}</button>
        </div>
      </section>
      <section class="panel fin-panel fin-next">
        <div class="ph"><h3>${esc(pt(L, 'fin.next'))}</h3></div>
        <p>${esc(pt(L, 'goal.sandbox'))}</p>
        <div class="fin-actions">
          <a class="btn primary" href="/play">${esc(pt(L, 'fin.continue'))}</a>
          <a class="btn" href="/play/settings#restart">${esc(pt(L, 'fin.restart'))}</a>
        </div>
      </section>
    </div></div>`;
}

/** A kliensnek (kép rajzolása, másolás): a számok és a feliratok. */
export function finaleClientData(s: ShellData, st: FinaleStats, shareUrl: string): Record<string, string> {
  const L = s.locale;
  return {
    company: s.company,
    title: pt(L, 'fin.title'),
    days: pt(L, 'fin.st.days', { n: st.days ?? 0 }),
    peakK: pt(L, 'fin.st.peak'), peak: usd(st.peak_mrr_cents),
    custK: pt(L, 'fin.st.customers'), cust: st.customers_total.toLocaleString('en-US'),
    shiftsK: pt(L, 'fin.st.shifts'), shifts: String(st.shifts),
    achK: pt(L, 'fin.st.achievements'), ach: `${st.achievements}/${st.achievements_total}`,
    url: shareUrl,
    text: finaleShareText(s, st, shareUrl),
    copied: pt(L, 'fin.copied'),
    file: 'hyperscales-' + (st.days ?? 0) + 'd.png',
  };
}

/** A záróképernyő kliens-szkriptje (másolás, natív megosztás, PNG-kép canvasból). Külső könyvtár nincs. */
export const FINALE_CLIENT_JS = `
(function () {
  var el = document.getElementById('fin-data'); if (!el) return;
  var d; try { d = JSON.parse(el.textContent || '{}'); } catch (e) { return; }
  function toast(m) { if (window.hsToast) window.hsToast(m, 'ok'); }
  var copy = document.querySelector('[data-fin="copy"]');
  if (copy) copy.addEventListener('click', function () {
    var t = d.text || '';
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast(d.copied); });
    else { var ta = document.getElementById('fin-share-text'); if (ta) { ta.select(); try { document.execCommand('copy'); toast(d.copied); } catch (e) {} } }
  });
  var sh = document.querySelector('[data-fin="share"]');
  if (sh && navigator.share) { sh.hidden = false; sh.addEventListener('click', function () { navigator.share({ title: 'Hyperscales', text: d.text, url: d.url }).catch(function () {}); }); }
  var img = document.querySelector('[data-fin="image"]');
  if (img) img.addEventListener('click', function () {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var x = c.getContext('2d'); if (!x) return;
    var g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, '#0a0d18'); g.addColorStop(1, '#1b1530');
    x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
    x.strokeStyle = 'rgba(245,158,11,.5)'; x.lineWidth = 4; x.strokeRect(24, 24, 1152, 582);
    x.fillStyle = '#f59e0b'; x.font = '700 28px "JetBrains Mono", monospace'; x.fillText('HYPERSCALES', 70, 100);
    x.fillStyle = '#e8ecf6'; x.font = '700 68px "Space Grotesk", sans-serif'; x.fillText('🏆 ' + d.title, 70, 200);
    x.fillStyle = '#9aa3b8'; x.font = '500 36px Inter, sans-serif'; x.fillText(d.company + ' · ' + d.days, 70, 262);
    var cells = [[d.peakK, d.peak], [d.custK, d.cust], [d.shiftsK, d.shifts], [d.achK, d.ach]];
    cells.forEach(function (cc, i) {
      var cx = 70 + i * 270;
      x.fillStyle = '#7d869c'; x.font = '600 22px "JetBrains Mono", monospace'; x.fillText(String(cc[0]).toUpperCase(), cx, 380);
      x.fillStyle = '#e8ecf6'; x.font = '700 50px "Space Grotesk", sans-serif'; x.fillText(String(cc[1]), cx, 440);
    });
    x.fillStyle = '#22d3ee'; x.font = '500 24px "JetBrains Mono", monospace'; x.fillText(d.url, 70, 560);
    c.toBlob(function (b) {
      if (!b) return;
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = d.file;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, 'image/png');
  });
})();
`;
