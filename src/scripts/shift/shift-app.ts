// src/scripts/shift/shift-app.ts — Műszak 2.0 kliens (ux-2, 2026-11-11).
// WebSocket a ShiftRoomDO-hoz (/api/shift/{id}); sor + aktív ügyfél + élő HUD (visszaszámláló, megoldva,
// pénz, hangulat, AI-keret), lebegő jelzések, gépel-jelzés, gombállapotok, záróképernyő.
// XSS: ügyfélnév, ticket- és MI-szöveg csak textContent-tel (createElement), soha nem innerHTML.
// A futó műszak a lap újratöltése után folytatható (localStorage 'hs_shift'), nem vész el a napi műszak.

import { formatClock, timerPhase, satPct, satTone, moodFace, signed, signedUsd } from '../../lib/play/shift-format';
import { secondsUntilShiftReset, type ShiftTip } from '../../lib/game/shift-score';
import { popAt, play, setSound, soundEnabled, onSoundChange } from './shift-fx';

// Régi, gyorsítótárazott vezérlő iframe-ablakából: ki a felső ablakba (a műszak teljes oldal lett).
if (window.top && window.top !== window) {
  try { window.top.location.href = '/play/shift'; } catch { /* cross-origin */ }
}

interface Msg { role: 'customer' | 'player'; text: string; ts: number }
interface Cust {
  ticket_id: number; customer_id: number; customer_name: string; archetype: string;
  current_satisfaction: number; ticket_subject: string; conversation: Msg[];
  status: 'pending' | 'active' | 'resolved' | 'abandoned';
  satisfaction_delta_total: number; refund_given_cents: number;
  /** 2026-11-12: nagy (dedikált) ügyfél — magasabb elvárás, a sor elején. */
  plan_tier?: string;
}
interface ShiftState {
  shift_id: string; started_at: number; expires_at: number;
  status: 'active' | 'completed' | 'expired' | 'abandoned';
  queue: Cust[]; active_index: number; tickets_handled: number;
}
interface EndSummary {
  tickets_handled: number; tickets_total?: number; satisfaction_total: number; refunds_cents: number;
  rep_delta?: number; stars?: 1 | 2 | 3; score?: number; tip?: ShiftTip; ended_by?: 'completed' | 'expired' | 'player';
}
type Labels = Record<string, string> & {
  arch: Record<string, string>;
  achievements: Record<string, { title: string; desc: string; emoji: string }>;
};

const L = JSON.parse(document.getElementById('sx-labels')?.textContent || '{}') as Labels;
const BOOT = JSON.parse(document.getElementById('sx-boot')?.textContent || '{}') as { capRemaining: number; cap: number; shiftsLeft: number };
const tr = (k: string, p?: Record<string, string | number>) =>
  (L[k] ?? k).replace(/\{(\w+)\}/g, (m, n: string) => (p && n in p ? String(p[n]) : m));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const root = $('sx')!;
let ws: WebSocket | null = null;
let wsPath: string | null = null;
let st: ShiftState | null = null;
let offset = 0; // szerveridő − kliensidő (mp)
let ended = false;
let capLeft = BOOT.capRemaining ?? 0;
let awaitingReply = false;
let pendingBtn: HTMLButtonElement | null = null;
let retries = 0;
const SHIFT_KEY = 'hs_shift';

// ─── helpers ───
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function hue(n: string) { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; }
function avatar(name: string, cls = 'sx-av') {
  const a = el('div', cls, name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
  const h = hue(name);
  a.style.setProperty('--av1', `hsl(${h} 70% 55%)`);
  a.style.setProperty('--av2', `hsl(${(h + 60) % 360} 70% 45%)`);
  return a;
}
function satBar(v: number) {
  const bar = el('div', 'sx-sat ' + satTone(v));
  const fill = el('i'); fill.style.width = satPct(v) + '%';
  bar.appendChild(fill);
  return bar;
}
function updSat(bar: Element | null, v: number, prev?: number) {
  if (!bar) return;
  bar.className = 'sx-sat ' + satTone(v);
  (bar.firstElementChild as HTMLElement).style.width = satPct(v) + '%';
  if (prev !== undefined && prev !== v) {
    bar.classList.add(v > prev ? 'bump-up' : 'bump-down');
    setTimeout(() => bar.classList.remove('bump-up', 'bump-down'), 950);
  }
}
function notice(text: string | null) {
  const n = $('sx-notice'); if (!n) return;
  n.hidden = !text; n.textContent = text ?? '';
}
function flashState(b: HTMLElement | null, cls: 'is-ok' | 'is-err') {
  if (!b) return;
  b.classList.remove('is-pending');
  b.classList.add(cls);
  setTimeout(() => b.classList.remove(cls), cls === 'is-ok' ? 900 : 700);
}
function active(): Cust | null { return st && st.active_index >= 0 ? st.queue[st.active_index] ?? null : null; }
function live(): boolean {
  const c = active();
  return !!st && st.status === 'active' && !ended && !!c && (c.status === 'active' || c.status === 'pending');
}
function setControls() {
  const on = live();
  const inp = $<HTMLTextAreaElement>('sx-input');
  if (inp) { inp.disabled = !on; if (!on) inp.placeholder = ended || st?.status !== 'active' ? tr('sh.ended_note') : tr('sh.closed_note'); }
  const send = $<HTMLButtonElement>('sx-send');
  if (send) send.disabled = !on || awaitingReply;
  document.querySelectorAll<HTMLButtonElement>('#sx-actions [data-action], #sx-quick button').forEach((b) => {
    b.disabled = !on || !!pendingBtn || (awaitingReply && !!b.dataset.quick);
  });
}

// ─── HUD ───
function setStat(key: string, text: string, tone?: 'good' | 'bad' | '') {
  const box = root.querySelector(`[data-stat="${key}"]`);
  const v = box?.querySelector('.v');
  if (!box || !v) return;
  if (v.textContent !== text) {
    v.textContent = text;
    box.classList.remove('flash'); void (box as HTMLElement).offsetWidth; box.classList.add('flash');
  }
  v.className = 'v' + (tone ? ' ' + tone : '');
}
function renderHud() {
  if (!st) return;
  const spent = st.queue.reduce((s, c) => s + c.refund_given_cents, 0);
  const mood = st.queue.reduce((s, c) => s + c.satisfaction_delta_total, 0);
  setStat('resolved', `${st.tickets_handled}/${st.queue.length}`);
  setStat('cash', signedUsd(-spent), spent > 0 ? 'bad' : '');
  setStat('mood', signed(mood), mood > 0 ? 'good' : mood < 0 ? 'bad' : '');
  setStat('ai', `${Math.max(0, capLeft)}/${BOOT.cap}`, capLeft < 5 ? 'bad' : '');
}

let timerId = 0;
let warned = false;
let endSent = false;
function tickTimer() {
  if (!st) return;
  const left = st.expires_at - (Date.now() / 1000 + offset);
  const total = Math.max(1, st.expires_at - st.started_at);
  const t = $('sx-time'); if (t) t.textContent = formatClock(ended ? 0 : left);
  const box = $('sx-timer');
  const ph = timerPhase(left);
  if (box) box.className = 'sx-timer ' + (ended ? '' : ph);
  const bar = box?.querySelector<SVGCircleElement>('.bar');
  if (bar) bar.style.strokeDashoffset = String(213.6 * (1 - Math.max(0, ended ? 0 : left) / total));
  if (!ended && ph !== 'ok' && !warned && left > 0) { warned = true; play('warn'); window.hsToast?.(tr('sx.timer.warn'), 'bad', undefined, true); }
  if (!ended && left <= 0 && !endSent) { endSent = true; send({ type: 'end_shift' }); }
}

// ─── queue ───
const qEls = new Map<number, HTMLButtonElement>();
const prevSat = new Map<number, number>();
function renderQueue() {
  const box = $('sx-queue'); if (!box || !st) return;
  if (!box.querySelector('h3')) {
    const h = el('h3'); h.append(el('span', '', tr('sx.queue.title')), el('span', 'sx-qcount'));
    box.appendChild(h);
  }
  const cnt = box.querySelector('.sx-qcount'); if (cnt) cnt.textContent = `${st.tickets_handled}/${st.queue.length}`;
  st.queue.forEach((c, i) => {
    let b = qEls.get(c.ticket_id);
    if (!b) {
      b = el('button', 'sx-q');
      b.type = 'button';
      const right = el('div');
      const nm = el('div', 'nm');
      nm.append(el('b', '', c.customer_name), el('span', 'sx-chip ' + c.archetype, L.arch?.[c.archetype] ?? c.archetype));
      if (c.plan_tier === 'dedicated' || c.plan_tier === 'enterprise') nm.append(el('span', 'sx-chip ded', tr(c.plan_tier === 'enterprise' ? 'sx.ent' : 'sx.ded')));
      nm.append(el('span', 'st'));
      const meta = el('div', 'meta');
      meta.append(satBar(c.current_satisfaction), el('span', 'sx-satv', String(c.current_satisfaction)));
      right.append(nm, meta);
      b.append(avatar(c.customer_name), right);
      b.addEventListener('click', () => {
        if (!st || i === st.active_index) return;
        if (send({ type: 'switch_ticket', index: i })) play('tick');
      });
      box.appendChild(b);
      qEls.set(c.ticket_id, b);
    }
    const done = c.status === 'resolved' || c.status === 'abandoned';
    b.className = 'sx-q' + (i === st!.active_index ? ' on' : '') + (done ? ' done' : '');
    b.disabled = done || ended;
    b.setAttribute('aria-current', i === st!.active_index ? 'true' : 'false');
    const stEl = b.querySelector('.st'); if (stEl) stEl.textContent = c.status === 'resolved' ? '✓' : c.status === 'abandoned' ? '↩' : '';
    updSat(b.querySelector('.sx-sat'), c.current_satisfaction, prevSat.get(c.ticket_id));
    const sv = b.querySelector('.sx-satv'); if (sv) sv.textContent = String(c.current_satisfaction);
  });
  if (matchMedia('(max-width: 900px)').matches) qEls.get(active()?.ticket_id ?? -1)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
}

// ─── active customer ───
let headFor = -1;
let renderedFor = -1;
let renderedCount = 0;
function renderHead() {
  const head = $('sx-head'); const c = active(); if (!head) return;
  if (!c) { head.replaceChildren(); headFor = -1; return; }
  if (headFor !== c.ticket_id) {
    headFor = c.ticket_id;
    const who = el('div', 'who');
    const top = el('div'); top.append(el('b', '', c.customer_name), document.createTextNode(' '), el('span', 'sx-chip ' + c.archetype, L.arch?.[c.archetype] ?? c.archetype));
    if (c.plan_tier === 'dedicated' || c.plan_tier === 'enterprise') top.append(document.createTextNode(' '), el('span', 'sx-chip ded', tr(c.plan_tier === 'enterprise' ? 'sx.ent' : 'sx.ded')));
    who.append(top, el('div', 'subj', c.ticket_subject));
    if (c.plan_tier === 'dedicated' || c.plan_tier === 'enterprise') who.append(el('div', 'sx-ded-note', tr('sx.ded_note')));
    const mood = el('div', 'sx-mood');
    const row = el('div', 'row');
    const lbl = el('span', '', tr('sx.mood.label'));
    const val = el('b'); val.append(el('span', 'face'), el('span', 'num'));
    row.append(lbl, val);
    mood.append(row, satBar(c.current_satisfaction));
    head.replaceChildren(avatar(c.customer_name), who, mood);
  }
  const face = head.querySelector('.face'); if (face) face.textContent = moodFace(c.current_satisfaction);
  const num = head.querySelector('.num'); if (num) num.textContent = String(c.current_satisfaction);
  updSat(head.querySelector('.sx-sat'), c.current_satisfaction, prevSat.get(c.ticket_id));
}
function bubble(m: Msg, c: Cust) {
  const w = el('div', 'sx-msg' + (m.role === 'player' ? ' me' : ''));
  w.append(m.role === 'player' ? avatar(tr('sx.you')) : avatar(c.customer_name), el('div', 'bub', m.text));
  return w;
}
function sysLine(text: string) {
  const box = $('sx-msgs'); if (!box) return;
  const w = el('div', 'sx-msg sys'); w.append(el('div', 'bub', text));
  box.insertBefore(w, box.querySelector('.sx-typing'));
  box.scrollTop = box.scrollHeight;
}
function renderMsgs() {
  const box = $('sx-msgs'); const c = active(); if (!box) return;
  if (!c) return;
  if (renderedFor !== c.ticket_id) {
    box.replaceChildren(); renderedFor = c.ticket_id; renderedCount = 0;
  }
  const typing = box.querySelector('.sx-typing');
  for (let i = renderedCount; i < c.conversation.length; i++) box.insertBefore(bubble(c.conversation[i], c), typing);
  renderedCount = c.conversation.length;
  box.scrollTop = box.scrollHeight;
}
function showTyping(on: boolean) {
  const box = $('sx-msgs'); const c = active(); if (!box) return;
  box.querySelector('.sx-typing')?.remove();
  if (!on || !c) return;
  const w = el('div', 'sx-msg sx-typing');
  const b = el('div', 'bub');
  const dots = el('span', 'sx-dots'); dots.append(el('i'), el('i'), el('i'));
  b.append(dots, el('span', '', tr('sx.typing', { name: c.customer_name.split(' ')[0] })));
  w.append(avatar(c.customer_name), b);
  box.appendChild(w);
  box.scrollTop = box.scrollHeight;
}

function render() {
  renderHud(); renderQueue(); renderHead(); renderMsgs(); setControls();
  st?.queue.forEach((c) => prevSat.set(c.ticket_id, c.current_satisfaction));
}

// ─── WebSocket ───
function send(payload: unknown): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(payload)); return true; }
  connect();
  return false;
}
function connect() {
  if (!wsPath || (ws && ws.readyState <= WebSocket.OPEN)) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${wsPath}`);
  ws.onopen = () => { retries = 0; notice(null); };
  ws.onmessage = (e) => onMessage(JSON.parse(String(e.data)));
  ws.onclose = () => {
    if (ended) return;
    notice(tr('sx.err.conn'));
    if (retries++ < 6) setTimeout(connect, Math.min(8000, 600 * 2 ** retries));
  };
}

function onMessage(m: { type: string; [k: string]: unknown }) {
  if (m.type === 'state') {
    const s = m.state as ShiftState;
    if (typeof m.server_now === 'number') offset = (m.server_now as number) - Date.now() / 1000;
    const prevActive = active()?.ticket_id;
    st = s;
    render();
    if (prevActive !== undefined && prevActive !== active()?.ticket_id) showTyping(false);
    if (!timerId) { tickTimer(); timerId = window.setInterval(tickTimer, 1000); }
  } else if (m.type === 'reply') {
    awaitingReply = false;
    showTyping(false);
    capLeft -= 1;
    const tid = m.ticket_id as number;
    const c = st?.queue.find((q) => q.ticket_id === tid);
    if (c) {
      c.current_satisfaction = m.new_satisfaction as number;
      c.satisfaction_delta_total += (m.satisfaction_delta as number) || 0;
      c.conversation.push({ role: 'customer', text: String(m.text), ts: Date.now() / 1000 });
    }
    render();
    const d = (m.satisfaction_delta as number) || 0;
    if (d) popAt($('sx-head')?.querySelector('.sx-mood') ?? null, tr('sx.pop.mood', { v: signed(d) }), d > 0 ? 'good' : 'bad');
    play(d < 0 ? 'bad' : 'reply');
    flashState($('sx-send'), 'is-ok');
  } else if (m.type === 'action_result') {
    const r = m.result as { satisfaction_delta: number; cash_delta_cents: number; resolves_ticket: boolean; message: string };
    const btn = pendingBtn; pendingBtn = null;
    flashState(btn, 'is-ok');
    if (r.cash_delta_cents) {
      popAt(btn, signedUsd(r.cash_delta_cents), 'cash');
      play('cash');
      const w = window as unknown as { hsSetCash?: (c: number) => void };
      const cashEl = document.querySelector('[data-cash-cents]');
      if (w.hsSetCash && cashEl) w.hsSetCash((parseInt(cashEl.getAttribute('data-cash-cents') || '0', 10) || 0) + r.cash_delta_cents);
    }
    if (r.satisfaction_delta) {
      popAt($('sx-head')?.querySelector('.sx-mood') ?? null, tr('sx.pop.mood', { v: signed(r.satisfaction_delta) }), r.satisfaction_delta > 0 ? 'good' : 'bad', 0);
      if (!r.cash_delta_cents) play(r.satisfaction_delta > 0 ? 'good' : 'bad');
    }
    const label = btn?.textContent?.replace(/[−+]\$[\d.]+|\$0/g, '').trim() ?? '';
    sysLine(tr('sh.action_done', { action: label }));
  } else if (m.type === 'shift_end') {
    showEnd(m.summary as EndSummary, (m.newly_unlocked as string[]) ?? []);
  } else if (m.type === 'error') {
    const err = String(m.error);
    awaitingReply = false; showTyping(false);
    const btn = pendingBtn ?? $<HTMLButtonElement>('sx-send'); pendingBtn = null;
    flashState(btn, 'is-err');
    if (err === 'daily LLM cap reached') { capLeft = 0; notice(L.err_llm_cap ?? err); }
    else if (err === 'AI unavailable') notice(tr('sx.err.ai'));
    else notice(`${tr('sx.err.ai')} (${err})`);
    play('bad');
    renderHud(); setControls();
  }
}

// ─── result screen ───
const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';
/** A frissen feloldott, az oldalba nem ágyazott (rejtett) achievementek neve a szervertől (GET /api/game/achievements). */
async function fillUnlockedNames(items: Array<{ id: string; title: HTMLElement; desc: HTMLElement; emo: HTMLElement }>): Promise<void> {
  type Row = { id: string; title_local?: string; desc_local?: string; title?: string; description?: string; emoji?: string };
  let rows: Row[] = [];
  try {
    const r = await fetch('/api/game/achievements', { credentials: 'same-origin' });
    if (r.ok) rows = ((await r.json()) as { achievements?: Row[] }).achievements ?? [];
  } catch { /* csend: a „…” marad */ }
  for (const it of items) {
    const a = rows.find((x) => x.id === it.id);
    // textContent: a szöveg soha nem HTML
    it.title.textContent = a?.title_local || a?.title || it.id.replace(/[_-]+/g, ' ');
    it.desc.textContent = a?.desc_local || a?.description || '';
    if (a?.emoji) it.emo.textContent = a.emoji;
  }
}

function showEnd(sum: EndSummary, unlocked: string[]) {
  if (document.querySelector('.sx-result')) return;
  ended = true;
  try { localStorage.removeItem(SHIFT_KEY); } catch { /* sandboxed */ }
  if (timerId) { clearInterval(timerId); timerId = 0; }
  awaitingReply = false; pendingBtn = null; showTyping(false);
  $('sx-end')?.setAttribute('hidden', '');
  tickTimer(); if (st) render(); setControls();
  try { ws?.close(); } catch { /* már zárva */ }

  const stars = sum.stars ?? 1;
  const total = sum.tickets_total ?? st?.queue.length ?? sum.tickets_handled;
  const wrap = el('div', 'sx-result'); wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  const card = el('div', 'sx-card');
  card.appendChild(el('div', 'kicker', L.end_title ?? 'Shift complete'));
  const starRow = el('div', 'sx-stars'); starRow.setAttribute('aria-label', tr('sx.res.stars', { n: stars }));
  for (let i = 0; i < 3; i++) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'sx-star');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', STAR);
    svg.appendChild(p); starRow.appendChild(svg);
    if (i < stars) {
      svg.style.animationDelay = `${0.25 + i * 0.28}s`;
      setTimeout(() => { svg.classList.add('on'); play('star', i); }, reduced ? 0 : 250 + i * 280);
    }
  }
  card.appendChild(starRow);
  card.appendChild(el('h2', '', tr(`sx.res.title${stars}`)));
  card.appendChild(el('div', 'why', tr(`sx.res.by_${sum.ended_by ?? 'completed'}`)));
  if (typeof sum.score === 'number') card.appendChild(el('div', 'score', tr('sx.res.score', { n: sum.score })));

  const grid = el('div', 'sx-grid4');
  const cell = (k: string, v: string, cls = '') => { const d = el('div'); d.append(el('div', 'k', k), el('div', 'v ' + cls, v)); grid.appendChild(d); };
  cell(tr('sx.res.resolved'), `${sum.tickets_handled}/${total}`, sum.tickets_handled === total ? 'good' : '');
  cell(tr('sx.res.spent'), signedUsd(-sum.refunds_cents), sum.refunds_cents ? 'cash' : '');
  cell(tr('sx.res.mood'), signed(sum.satisfaction_total), sum.satisfaction_total > 0 ? 'good' : sum.satisfaction_total < 0 ? 'bad' : '');
  const rep = sum.rep_delta ?? 0;
  cell(tr('sx.res.rep'), signed(rep), rep > 0 ? 'good' : rep < 0 ? 'bad' : '');
  card.appendChild(grid);

  const missing: Array<{ id: string; title: HTMLElement; desc: HTMLElement; emo: HTMLElement }> = [];
  for (const id of unlocked) {
    const a = L.achievements?.[id];
    const b = el('div', 'sx-badge');
    const txt = el('div');
    const title = el('b', '', a?.title ?? '…');
    const desc = el('span', '', a?.desc ?? '');
    const emo = el('div', 'e', a?.emoji ?? '🏅');
    txt.append(el('div', 'l', tr('sx.res.badge')), title, desc);
    b.append(emo, txt);
    card.appendChild(b);
    if (!a) missing.push({ id, title, desc, emo });
  }
  // A rejtett achievement neve nincs az oldalban (achievementMap): a feloldás után a szervertől kérjük le.
  if (missing.length > 0) void fillUnlockedNames(missing);
  card.appendChild(el('div', 'sx-tip', tr(`sx.tip.${sum.tip ?? 'great'}`)));
  const next = el('div', 'sx-next');
  const left = BOOT.shiftsLeft ?? 0;
  const secs = secondsUntilShiftReset(Math.floor(Date.now() / 1000 + offset));
  next.append(el('b', '', tr('sx.res.next')), document.createTextNode(left > 0
    ? tr('sx.res.next_left', { n: left })
    : tr('sx.res.next_in', { t: tr('sx.dur', { h: Math.floor(secs / 3600), m: Math.floor((secs % 3600) / 60) }) })));
  card.appendChild(next);
  const btns = el('div', 'sx-btns');
  const back = el('a', 'primary', tr('sx.res.back')); back.href = '/play';
  const tk = el('a', '', tr('sx.res.tickets')); tk.href = '/play/tickets';
  btns.append(back, tk);
  card.appendChild(btns);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
  back.focus({ preventScroll: true });
  if (rep) setTimeout(() => popAt(grid.lastElementChild, tr('sx.pop.rep', { v: signed(rep) }), rep > 0 ? 'good' : 'bad'), 900);
  setTimeout(() => play('fanfare'), reduced ? 0 : 250 + stars * 280);
  if (stars === 3 && !reduced) {
    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.3 }, colors: ['#f59e0b', '#34d399', '#6366f1', '#22d3ee'], disableForReducedMotion: true });
    }).catch(() => { /* díszítés: hiba esetén nincs konfetti */ });
  }
}

// ─── start / resume ───
function goLive() {
  root.dataset.phase = 'live';
  $('sx-pre')?.remove();
  root.querySelectorAll('.sx-note').forEach((n) => n.remove());
  $('sx-live')?.removeAttribute('hidden');
  $('sx-end')?.removeAttribute('hidden');
  connect();
}

$('sx-start')?.addEventListener('click', async (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  b.disabled = true; b.classList.add('is-pending');
  try {
    const r = await fetch('/api/shift/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const j = await r.json().catch(() => ({})) as { shift_id?: string; ws_path?: string; error?: string; message?: string };
    if (!r.ok || !j.ws_path) throw new Error(j.message || j.error || `HTTP ${r.status}`);
    wsPath = j.ws_path;
    try { localStorage.setItem(SHIFT_KEY, JSON.stringify({ ws_path: j.ws_path, until: Date.now() + 31 * 60 * 1000 })); } catch { /* sandboxed */ }
    play('good');
    goLive();
  } catch (err) {
    b.disabled = false; flashState(b, 'is-err');
    window.hsToast?.(`${L.err_could_not_start ?? 'Error'}: ${(err as Error).message}`, 'bad');
  }
});

try {
  const saved = JSON.parse(localStorage.getItem(SHIFT_KEY) || 'null') as { ws_path: string; until: number } | null;
  if (saved && saved.until > Date.now() && /^\/api\/shift\/[\w-]+$/.test(saved.ws_path)) { wsPath = saved.ws_path; goLive(); }
  else if (saved) localStorage.removeItem(SHIFT_KEY);
} catch { /* sandboxed */ }

// ─── composer + actions ───
function sendText() {
  const inp = $<HTMLTextAreaElement>('sx-input'); const c = active();
  if (!inp || !c || !live() || awaitingReply) return;
  const text = inp.value.trim();
  if (!text) return;
  if (!send({ type: 'msg', text })) return;
  c.conversation.push({ role: 'player', text, ts: Date.now() / 1000 });
  inp.value = ''; inp.style.height = '';
  awaitingReply = true;
  $('sx-send')?.classList.add('is-pending');
  render(); showTyping(true); play('send'); notice(null);
}
$('sx-send')?.addEventListener('click', sendText);
$('sx-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
});
$('sx-input')?.addEventListener('input', (e) => {
  const t = e.currentTarget as HTMLTextAreaElement;
  t.style.height = ''; t.style.height = Math.min(120, t.scrollHeight) + 'px';
});
document.querySelectorAll<HTMLButtonElement>('#sx-quick button').forEach((b) => b.addEventListener('click', () => {
  const inp = $<HTMLTextAreaElement>('sx-input'); if (!inp) return;
  inp.value = b.textContent || ''; inp.focus();
}));
document.querySelectorAll<HTMLButtonElement>('#sx-actions [data-action]').forEach((b) => b.addEventListener('click', () => {
  if (!live() || pendingBtn) return;
  if (!send({ type: 'action', action: b.dataset.action })) { flashState(b, 'is-err'); return; }
  pendingBtn = b; b.classList.add('is-pending');
  setControls();
  // Ha 8 mp alatt sincs válasz, a gomb ne ragadjon be.
  setTimeout(() => { if (pendingBtn === b) { pendingBtn = null; flashState(b, 'is-err'); setControls(); } }, 8000);
}));
$('sx-end')?.addEventListener('click', () => {
  if (ended || !st) return;
  if (!confirm(tr('sx.end_confirm'))) return;
  const b = $('sx-end'); b?.classList.add('is-pending');
  send({ type: 'end_shift' });
});

// ─── hangkapcsoló (a közös hangmotor fő némítása, src/scripts/audio) ───
const sb = $<HTMLButtonElement>('sx-sound');
function paintSound() {
  if (!sb) return;
  const on = soundEnabled();
  sb.textContent = on ? '🔊' : '🔇';
  sb.setAttribute('aria-pressed', on ? 'true' : 'false');
  sb.title = tr(on ? 'sx.sound_on' : 'sx.sound_off');
  sb.setAttribute('aria-label', sb.title);
}
sb?.addEventListener('click', () => { setSound(!soundEnabled()); paintSound(); });
paintSound();
onSoundChange(paintSound);

declare global { interface Window { hsToast?: (t: string, k?: string, amt?: string, silent?: boolean) => void } }
