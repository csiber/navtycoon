// src/scripts/shift/shift-app.ts
// Hyperscaler — Plan 2 Task 13: Shift-mode client.
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
    const li = el(
      'li',
      `p-2 rounded ${i === state.active_index ? 'bg-nt-accent-l border border-nt-accent' : 'bg-nt-bg-3'}`,
    );
    const name = el('div', 'font-semibold text-sm');
    name.textContent = c.customer_name;
    const meta = el('div', 'text-xs text-nt-text-dim');
    meta.textContent = `${c.archetype} · sat ${c.current_satisfaction} · ${c.status}`;
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
  $('active-customer').textContent = `${c.customer_name} (${c.archetype})`;
  $('active-meta').textContent = `Subject: ${c.ticket_subject} · Sat: ${c.current_satisfaction}/100`;

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

function applyState(state: ShiftStateMsg) {
  lastState = state;
  renderQueue(state);
  renderActive(state);
}

function showShiftEnd(summary: {
  tickets_handled: number;
  satisfaction_total: number;
  refunds_cents: number;
}) {
  $('shift-end').classList.remove('hidden');
  $('end-summary').textContent =
    `Tickets handled: ${summary.tickets_handled} · Total satisfaction: ${summary.satisfaction_total >= 0 ? '+' : ''}${summary.satisfaction_total} · Refunds: $${(summary.refunds_cents / 100).toFixed(2)}`;
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
    alert('Could not start shift: ' + (await r.text()));
    location.reload();
    return;
  }
  const j = (await r.json()) as { shift_id: string; ws_path: string };
  const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${j.ws_path}`;
  ws = new WebSocket(wsUrl);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') applyState(msg.state);
    else if (msg.type === 'reply') {
      if (lastState) {
        const idx = lastState.queue.findIndex((c) => c.ticket_id === msg.ticket_id);
        if (idx >= 0) {
          lastState.queue[idx].current_satisfaction = msg.new_satisfaction;
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
    } else if (msg.type === 'shift_end') showShiftEnd(msg.summary);
    else if (msg.type === 'error') {
      console.error('shift error', msg.error);
      alert('Error: ' + msg.error);
    }
  };
  ws.onclose = () => {
    console.log('WS closed');
  };
}

$('start-shift')?.addEventListener('click', startShift);

$('msg-send').addEventListener('click', () => {
  const inp = $('msg-input') as HTMLInputElement;
  const text = inp.value.trim();
  if (!text || !ws) return;
  ws.send(JSON.stringify({ type: 'msg', text }));
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

document.querySelectorAll<HTMLElement>('[data-action]').forEach((b) =>
  b.addEventListener('click', () => {
    if (!ws) return;
    const action = b.dataset.action;
    ws.send(JSON.stringify({ type: 'action', action }));
  }),
);
