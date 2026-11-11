// src/scripts/shift/shift-app.ts
// Hyperscales — Plan 2 Task 13: Shift-mode client.
// Connects to /api/shift/{shiftId} WebSocket via DO, renders queue + active-customer
// chat, sends player messages + action-button events. XSS-safe DOM: customer names,
// ticket text, AI replies are user/AI-supplied → createElement + textContent only,
// NEVER innerHTML.

interface CustomerInQueue {
  ticket_id: number;
  customer_id: number;
  customer_name: string;
  archetype: string;
  current_satisfaction: number;
  ticket_subject: string;
  conversation: { role: 'customer' | 'player'; text: string; ts: number }[];
  status: 'pending' | 'active' | 'resolved' | 'abandoned';
  satisfaction_delta_total: number;
  refund_given_cents: number;
}

interface ShiftStateMsg {
  shift_id: string;
  player_id: string;
  started_at: number;
  expires_at: number;
  status: 'active' | 'completed' | 'expired' | 'abandoned';
  queue: CustomerInQueue[];
  active_index: number;
  tickets_handled: number;
}

let ws: WebSocket | null = null;
let lastState: ShiftStateMsg | null = null;
let wsUrl: string | null = null;
let reconnecting = false;

// Locale labels emitted by shift.astro frontmatter as a JSON script-tag.
// EN defaults so the script still works if the block is missing (e.g.
// /play/shift opened outside the embed-modal during dev).
interface ShiftLabels {
  status_pending: string; status_active: string;
  status_resolved: string; status_abandoned: string;
  sat: string; active_subject: string; active_sat: string;
  end_tickets: string; end_total_sat: string; end_refunds: string;
  end_rep: string; end_unlocked: string;
  err_could_not_start: string; err_generic: string; err_llm_cap?: string;
  arch_newbie: string; arch_pro: string; arch_cheapskate: string;
  arch_karen: string; arch_loyalist: string; arch_ghost: string;
  arch_drama: string; arch_crypto: string;
  achievements?: Record<string, { title: string; desc: string; emoji: string }>;
  action_done?: string; closed_note?: string; ended_note?: string;
}
const LABELS: ShiftLabels = (() => {
  const node = document.getElementById('shift-labels');
  if (node?.textContent) {
    try { return JSON.parse(node.textContent) as ShiftLabels; } catch { /* fall through */ }
  }
  return {
    status_pending: 'pending', status_active: 'active',
    status_resolved: 'resolved', status_abandoned: 'abandoned',
    sat: 'sat', active_subject: 'Subject', active_sat: 'Sat',
    end_tickets: 'Tickets handled', end_total_sat: 'Total satisfaction',
    end_refunds: 'Refunds', end_rep: 'Reputation', end_unlocked: '🎉 Unlocked',
    err_could_not_start: 'Could not start shift', err_generic: 'Error',
    arch_newbie: 'newbie', arch_pro: 'pro', arch_cheapskate: 'cheapskate',
    arch_karen: 'karen', arch_loyalist: 'loyalist', arch_ghost: 'ghost',
    arch_drama: 'drama', arch_crypto: 'crypto-bro',
  };
})();
function statusLabel(s: string): string {
  switch (s) {
    case 'pending': return LABELS.status_pending;
    case 'active': return LABELS.status_active;
    case 'resolved': return LABELS.status_resolved;
    case 'abandoned': return LABELS.status_abandoned;
    default: return s;
  }
}
function archetypeLabel(a: string): string {
  switch (a) {
    case 'newbie': return LABELS.arch_newbie;
    case 'pro': return LABELS.arch_pro;
    case 'cheapskate': return LABELS.arch_cheapskate;
    case 'karen': return LABELS.arch_karen;
    case 'loyalist': return LABELS.arch_loyalist;
    case 'ghost': return LABELS.arch_ghost;
    case 'drama': return LABELS.arch_drama;
    case 'crypto': return LABELS.arch_crypto;
    default: return a;
  }
}

function wsReady(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

function safeSend(payload: unknown): boolean {
  if (wsReady()) {
    ws!.send(JSON.stringify(payload));
    return true;
  }
  void reconnect();
  return false;
}

async function reconnect() {
  if (reconnecting || !wsUrl) return;
  reconnecting = true;
  await new Promise((r) => setTimeout(r, 500));
  try {
    ws = new WebSocket(wsUrl);
    attachWs(ws);
  } catch (e) {
    console.error('reconnect failed', e);
  } finally {
    reconnecting = false;
  }
}

function attachWs(sock: WebSocket) {
  sock.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') applyState(msg.state);
    else if (msg.type === 'reply') {
      if (lastState) {
        const idx = lastState.queue.findIndex((c) => c.ticket_id === msg.ticket_id);
        if (idx >= 0) {
          lastState.queue[idx].current_satisfaction = msg.new_satisfaction;
          updateSummary({ remDelta: -1 });
          lastState.queue[idx].conversation.push({
            role: 'customer',
            text: msg.text,
            ts: Math.floor(Date.now() / 1000),
          });
          applyState(lastState);
        }
      }
    } else if (msg.type === 'action_result') {
      /* state-msg follows */
    } else if (msg.type === 'shift_end') showShiftEnd(msg.summary, msg.newly_unlocked);
    else if (msg.type === 'error') {
      console.error('shift error', msg.error);
      // Napi AI-keret: nem blokkoló alert, hanem tartós megjegyzés a válaszmező alatt — a műszak megy tovább.
      const notice = document.getElementById('shift-notice');
      if (msg.error === 'daily LLM cap reached' && notice) {
        notice.textContent = LABELS.err_llm_cap ?? 'Daily AI reply budget used up.';
        notice.classList.remove('hidden');
      } else {
        alert(LABELS.err_generic + ': ' + msg.error);
      }
    }
  };
  sock.onclose = () => {
    console.log('WS closed');
    if (lastState?.status === 'active') void reconnect();
  };
}

const $ = (id: string) => document.getElementById(id)!;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderQueue(state: ShiftStateMsg) {
  const list = $('queue-list');
  while (list.firstChild) list.removeChild(list.firstChild);
  state.queue.forEach((c, i) => {
    const switchable = c.status === 'pending' || c.status === 'active';
    const li = el(
      'li',
      `p-2 rounded ${i === state.active_index ? 'bg-nt-accent-l border border-nt-accent' : 'bg-nt-bg-3'} ${switchable ? 'cursor-pointer hover:border hover:border-nt-accent transition' : 'opacity-60'}`,
    );
    if (switchable && i !== state.active_index) {
      li.addEventListener('click', () => {
        safeSend({ type: 'switch_ticket', index: i });
      });
    }
    const name = el('div', 'font-semibold text-sm');
    name.textContent = c.customer_name;
    const meta = el('div', 'text-xs text-nt-text-dim');
    meta.textContent = `${archetypeLabel(c.archetype)} · ${LABELS.sat} ${c.current_satisfaction} · ${statusLabel(c.status)}`;
    li.appendChild(name);
    li.appendChild(meta);
    list.appendChild(li);
  });
}

function renderActive(state: ShiftStateMsg) {
  const idx = state.active_index;
  if (idx < 0 || idx >= state.queue.length) {
    $('active-customer').textContent = '—';
    $('active-meta').textContent = '';
    return;
  }
  const c = state.queue[idx];
  $('active-customer').textContent = `${c.customer_name} (${archetypeLabel(c.archetype)})`;
  $('active-meta').textContent = `${LABELS.active_subject}: ${c.ticket_subject} · ${LABELS.active_sat}: ${c.current_satisfaction}/100`;

  const msgs = $('messages');
  while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
  for (const m of c.conversation) {
    const wrap = el('div', m.role === 'customer' ? 'flex' : 'flex justify-end');
    const bubble = el(
      'div',
      `max-w-[75%] px-3 py-2 rounded ${m.role === 'customer' ? 'bg-nt-bg-3 text-nt-text' : 'bg-nt-accent text-white'}`,
    );
    bubble.textContent = m.text;
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
  }
  msgs.scrollTop = msgs.scrollHeight;
}

// Fejléc-számlálók („N nyitott ticket · M AI-válasz maradt · K műszak ma") élőben frissülnek.
const summaryEl = document.getElementById('shift-summary');
function updateSummary(patch: { open?: number; remDelta?: number; shiftsDelta?: number }) {
  if (!summaryEl) return;
  const d = summaryEl.dataset;
  if (patch.open !== undefined) d.open = String(patch.open);
  if (patch.remDelta) d.rem = String(Math.max(0, Number(d.rem || 0) + patch.remDelta));
  if (patch.shiftsDelta) d.shifts = String(Number(d.shifts || 0) + patch.shiftsDelta);
  summaryEl.textContent = (d.tpl || '')
    .replace('{open}', d.open || '0').replace('{used}', d.rem || '0')
    .replace('{cap}', d.cap || '0').replace('{shifts}', d.shifts || '0');
}

// A válaszmező és a gombok csak akkor élnek, ha fut a műszak és az aktív ticket még nincs lezárva.
function setComposer(enabled: boolean, note?: string) {
  const inp = document.getElementById('msg-input') as HTMLInputElement | null;
  const send = document.getElementById('msg-send') as HTMLButtonElement | null;
  if (inp) { inp.disabled = !enabled; if (!enabled && note) inp.placeholder = note; }
  if (send) send.disabled = !enabled;
  document.querySelectorAll<HTMLButtonElement>('#shift-area [data-action]').forEach((b) => { b.disabled = !enabled; });
}

function applyState(state: ShiftStateMsg) {
  lastState = state;
  renderQueue(state);
  renderActive(state);
  updateSummary({ open: state.queue.filter((c) => c.status === 'pending' || c.status === 'active').length });
  const active = state.queue[state.active_index];
  const live = state.status === 'active' && !!active && (active.status === 'pending' || active.status === 'active');
  setComposer(live, state.status !== 'active' ? LABELS.ended_note : LABELS.closed_note);
}

function showShiftEnd(
  summary: {
    tickets_handled: number;
    satisfaction_total: number;
    refunds_cents: number;
    rep_delta?: number;
  },
  newlyUnlocked?: string[],
) {
  $('shift-end').classList.remove('hidden');
  const repPart = summary.rep_delta && summary.rep_delta !== 0
    ? ` · ${LABELS.end_rep}: ${summary.rep_delta > 0 ? '+' : ''}${summary.rep_delta}`
    : '';
  $('end-summary').textContent =
    `${LABELS.end_tickets}: ${summary.tickets_handled} · ${LABELS.end_total_sat}: ${summary.satisfaction_total >= 0 ? '+' : ''}${summary.satisfaction_total} · ${LABELS.end_refunds}: $${(summary.refunds_cents / 100).toFixed(2)}${repPart}`;
  if (newlyUnlocked && newlyUnlocked.length > 0) {
    const ach = document.createElement('p');
    ach.style.cssText = 'margin-top:12px;color:var(--mint,#34d399);font-weight:600;';
    const names = newlyUnlocked.map((id) => {
      const a = LABELS.achievements?.[id];
      return a ? `${a.emoji} ${a.title}` : id.replace(/[_-]+/g, ' ');
    });
    ach.textContent = LABELS.end_unlocked + ': ' + names.join(', ');
    $('end-summary').after(ach);
  }
  if (lastState) lastState.status = 'completed';
  setComposer(false, LABELS.ended_note);
  ws?.close();
}

async function startShift() {
  $('pre-shift').classList.add('hidden');
  $('shift-area').classList.remove('hidden');
  const r = await fetch('/api/shift/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    alert(LABELS.err_could_not_start + ': ' + (await r.text()));
    location.reload();
    return;
  }
  const j = (await r.json()) as { shift_id: string; ws_path: string };
  updateSummary({ shiftsDelta: 1 });
  wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${j.ws_path}`;
  ws = new WebSocket(wsUrl);
  attachWs(ws);
}

$('start-shift')?.addEventListener('click', startShift);

$('msg-send').addEventListener('click', () => {
  const inp = $('msg-input') as HTMLInputElement;
  const text = inp.value.trim();
  if (!text) return;
  if (!safeSend({ type: 'msg', text })) return;
  if (lastState && lastState.active_index >= 0) {
    const c = lastState.queue[lastState.active_index];
    c.conversation.push({ role: 'player', text, ts: Math.floor(Date.now() / 1000) });
    applyState(lastState);
  }
  inp.value = '';
});

$('msg-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('msg-send').click();
});

document.querySelectorAll<HTMLButtonElement>('#shift-area [data-action]').forEach((b) =>
  b.addEventListener('click', () => {
    const action = b.dataset.action;
    if (!safeSend({ type: 'action', action })) return;
    // Látható visszajelzés (korábban a visszatérítés gomb semmit sem mutatott).
    const label = b.textContent || '';
    b.disabled = true;
    b.classList.add('ring-2', 'ring-nt-accent');
    const notice = document.getElementById('shift-notice');
    const doneText = (LABELS.action_done ?? '✓ {action}').replace('{action}', label.trim());
    if (notice) {
      notice.textContent = doneText;
      notice.classList.remove('hidden');
    }
    // Pénzmozgásnál (visszatérítés, eszkaláció) és lezárásnál toast is — a beágyazott ablakból a vezérlőn jelenik meg.
    if (action && /^(refund_|escalate|close)/.test(action)) {
      try {
        const host = (window.parent && window.parent !== window ? window.parent : window) as unknown as { hsToast?: (t: string, k?: string) => void };
        host.hsToast?.(doneText, action === 'close' ? 'good' : 'bad');
      } catch { /* cross-origin guard */ }
    }
    setTimeout(() => {
      b.classList.remove('ring-2', 'ring-nt-accent');
      if (lastState?.status === 'active') b.disabled = false;
    }, 1200);
  }),
);
