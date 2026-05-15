// src/durable-objects/shift-room.ts
// Durable Object: hosts a shift-mode room. Single WS-connection per shift.
import type { ShiftState, ShiftCustomerState } from '../lib/game/shift-state';
import { advanceToNext, isShiftExpired, SHIFT_DURATION_SEC } from '../lib/game/shift-state';
import { applyAction, type ShiftAction } from '../lib/game/action-handler';
import { generateAiReply, ratePlayerResponse } from '../lib/ai/reply-generator';
import { tryConsumeLlmCall } from '../lib/game/llm-cap';
import type { WorkersAIBinding } from '../lib/ai/workers-ai';
import { computeAchievementInput } from '../lib/game/achievements-helper';
import { checkAndUnlockAchievements } from '../lib/game/achievements';

interface DurableEnv {
  AI?: WorkersAIBinding;
  DB: D1Database;
}

interface InitMessage {
  type: 'init';
  player_id: string;
  is_pro: boolean;
  shift_id: string;
  customers: {
    ticket_id: number; customer_id: number; customer_name: string;
    archetype: ShiftCustomerState['archetype']; current_satisfaction: number;
    ticket_subject: string; ticket_first_message: string;
  }[];
}

type WsInbound =
  | { type: 'msg'; text: string }
  | { type: 'action'; action: ShiftAction }
  | { type: 'switch_ticket'; index: number };

type WsOutbound =
  | { type: 'state'; state: ShiftState }
  | { type: 'reply'; ticket_id: number; text: string; satisfaction_delta: number; new_satisfaction: number }
  | { type: 'action_result'; ticket_id: number; result: { satisfaction_delta: number; cash_delta_cents: number; resolves_ticket: boolean; message: string } }
  | { type: 'shift_end'; summary: { tickets_handled: number; satisfaction_total: number; refunds_cents: number; rep_delta: number }; newly_unlocked: string[] }
  | { type: 'error'; error: string };

export class ShiftRoomDO {
  state: DurableObjectState;
  env: DurableEnv;
  shift: ShiftState | null = null;
  ws: WebSocket | null = null;
  // Achievement-IDs unlocked during persistShiftHistory(), surfaced in shift_end.
  private pendingAchievementUnlocks: string[] = [];
  // Reputation delta applied at shift-end (signed). Surfaced in shift_end.
  private lastShiftRepDelta: number = 0;

  constructor(state: DurableObjectState, env: DurableEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/init' && req.method === 'POST') {
      const init = await req.json() as InitMessage;
      const now = Math.floor(Date.now() / 1000);
      this.shift = {
        shift_id: init.shift_id,
        player_id: init.player_id,
        started_at: now,
        expires_at: now + SHIFT_DURATION_SEC,
        status: 'active',
        tickets_handled: 0,
        active_index: init.customers.length > 0 ? 0 : -1,
        queue: init.customers.map((c, i) => ({
          ticket_id: c.ticket_id,
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          archetype: c.archetype,
          current_satisfaction: c.current_satisfaction,
          ticket_subject: c.ticket_subject,
          conversation: [{ role: 'customer', text: c.ticket_first_message, ts: now }],
          status: i === 0 ? 'active' : 'pending',
          satisfaction_delta_total: 0,
          refund_given_cents: 0,
        })),
      };
      await this.state.storage.put('shift', this.shift);
      return new Response(JSON.stringify({ ok: true, shift_id: init.shift_id }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/ws') {
      const upgrade = req.headers.get('Upgrade');
      if (upgrade !== 'websocket') return new Response('expected WS', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ws = server;
      if (!this.shift) this.shift = await this.state.storage.get<ShiftState>('shift') ?? null;
      server.accept();
      server.addEventListener('message', (e) => {
        void this.handleMessage(typeof e.data === 'string' ? e.data : '');
      });
      server.addEventListener('close', () => { this.ws = null; });
      if (this.shift) this.send({ type: 'state', state: this.shift });
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  send(msg: WsOutbound) {
    if (this.ws) this.ws.send(JSON.stringify(msg));
  }

  async handleMessage(raw: string) {
    if (!this.shift) {
      this.send({ type: 'error', error: 'no shift' });
      return;
    }
    if (isShiftExpired(this.shift, Math.floor(Date.now() / 1000))) {
      this.shift.status = 'expired';
      await this.state.storage.put('shift', this.shift);
      this.send({ type: 'shift_end', summary: this.summary(), newly_unlocked: this.pendingAchievementUnlocks });
      return;
    }
    let m: WsInbound;
    try { m = JSON.parse(raw) as WsInbound; }
    catch { this.send({ type: 'error', error: 'bad json' }); return; }

    // Manual ticket-switch happens BEFORE the active-customer guard:
    // the player can jump to any pending ticket in the queue without
    // resolving the current one first. Resolved/abandoned tickets are
    // skipped server-side so a stale click can't desync the queue.
    if (m.type === 'switch_ticket') {
      const i = m.index;
      if (i >= 0 && i < this.shift.queue.length) {
        const target = this.shift.queue[i];
        if (target.status === 'pending' || target.status === 'active') {
          this.shift.active_index = i;
          await this.state.storage.put('shift', this.shift);
          this.send({ type: 'state', state: this.shift });
        }
      }
      return;
    }

    const active = this.shift.queue[this.shift.active_index];
    if (!active) {
      this.send({ type: 'error', error: 'no active customer' });
      return;
    }

    if (m.type === 'msg') {
      await this.handlePlayerMessage(active, m.text);
    } else if (m.type === 'action') {
      await this.handleAction(active, m.action);
    }
    await this.state.storage.put('shift', this.shift);
    this.send({ type: 'state', state: this.shift });
  }

  async handlePlayerMessage(c: ShiftCustomerState, text: string) {
    if (!this.shift) return;
    if (text.trim().length === 0) return;
    const now = Math.floor(Date.now() / 1000);
    c.conversation.push({ role: 'player', text: text.slice(0, 1000), ts: now });

    if (!this.env.AI) {
      this.send({ type: 'error', error: 'AI unavailable' });
      return;
    }

    const isPro = await this.isPlayerPro();
    const budget = await tryConsumeLlmCall(this.env.DB, this.shift.player_id, isPro);
    if (!budget) {
      this.send({ type: 'error', error: 'daily LLM cap reached' });
      return;
    }

    let delta = 0;
    try {
      const rating = await ratePlayerResponse(this.env.AI, {
        archetype: c.archetype,
        customer_name: c.customer_name,
        satisfaction: c.current_satisfaction,
        ticket_subject: c.ticket_subject,
        player_response: text,
      });
      delta = rating.delta;
    } catch { /* delta stays 0 */ }

    c.current_satisfaction = Math.max(-100, Math.min(100, c.current_satisfaction + delta));
    c.satisfaction_delta_total += delta;

    // Resolve player's preferred UI language so the AI customer replies
    // in the same language the player is reading the UI in. "Magyar
    // felület = magyar LLM-beszéd" was the explicit user request.
    const langRow = await this.env.DB
      .prepare('SELECT preferred_lang FROM players WHERE user_id = ? LIMIT 1')
      .bind(this.shift.player_id)
      .first<{ preferred_lang?: string }>();
    const lang = (langRow?.preferred_lang as 'en' | 'hu' | 'de' | undefined) ?? 'en';

    const reply = await generateAiReply(this.env.AI, {
      archetype: c.archetype,
      customer_name: c.customer_name,
      satisfaction: c.current_satisfaction,
      ticket_subject: c.ticket_subject,
      conversation: c.conversation.map(m => ({ role: m.role, text: m.text })),
      lang,
    }).catch(() => 'I... I do not know what to say.');

    c.conversation.push({ role: 'customer', text: reply, ts: now });

    this.send({
      type: 'reply',
      ticket_id: c.ticket_id,
      text: reply,
      satisfaction_delta: delta,
      new_satisfaction: c.current_satisfaction,
    });
  }

  async handleAction(c: ShiftCustomerState, action: ShiftAction) {
    if (!this.shift) return;
    const planTier = 'hobby';
    const result = applyAction(c, action, planTier);
    c.current_satisfaction = Math.max(-100, Math.min(100, c.current_satisfaction + result.satisfaction_delta));
    c.satisfaction_delta_total += result.satisfaction_delta;
    if (result.cash_delta_cents < 0) {
      c.refund_given_cents += -result.cash_delta_cents;
    }
    this.send({
      type: 'action_result',
      ticket_id: c.ticket_id,
      result: {
        satisfaction_delta: result.satisfaction_delta,
        cash_delta_cents: result.cash_delta_cents,
        resolves_ticket: result.resolves_ticket,
        message: result.message,
      },
    });

    await this.persistActionToDb(c, result.cash_delta_cents, result.resolves_ticket);

    if (result.resolves_ticket) {
      c.status = 'resolved';
      this.shift.tickets_handled++;
      const hasNext = advanceToNext(this.shift);
      if (!hasNext) {
        this.shift.status = 'completed';
        await this.persistShiftHistory();
        this.send({ type: 'shift_end', summary: this.summary(), newly_unlocked: this.pendingAchievementUnlocks });
      }
    }
  }

  async persistActionToDb(c: ShiftCustomerState, cashDelta: number, resolvesTicket: boolean) {
    if (!this.shift) return;
    if (cashDelta !== 0) {
      await this.env.DB.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?')
        .bind(cashDelta, this.shift.player_id).run();
    }
    await this.env.DB.prepare('UPDATE customers SET satisfaction = ? WHERE id = ?')
      .bind(c.current_satisfaction, c.customer_id).run();
    if (resolvesTicket) {
      const nowSec = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(`
        UPDATE tickets SET status = 'resolved', resolved_at = ?, satisfaction_delta = ?
        WHERE id = ?
      `).bind(nowSec, c.satisfaction_delta_total, c.ticket_id).run();

      // Event-feed: ticket_resolved row so the dashboard "Live event feed"
      // panel reflects shift-mode wins instead of staying empty until the
      // next cron-tick fires.
      const data = JSON.stringify({
        customer_name: c.customer_name,
        archetype: c.archetype,
        satisfaction_delta: c.satisfaction_delta_total,
        refund_cents: c.refund_given_cents,
        outcome: c.satisfaction_delta_total >= 0 ? 'positive' : 'negative',
      });
      await this.env.DB.prepare(
        'INSERT INTO events (player_id, event_type, data_json, spawned_at, resolved_at) ' +
        "VALUES (?, 'ticket_resolved', ?, ?, ?)",
      ).bind(this.shift.player_id, data, nowSec, nowSec).run();
    }
  }

  async persistShiftHistory() {
    if (!this.shift) return;
    const s = this.summary();
    const nowSec = Math.floor(Date.now() / 1000);
    await this.env.DB.prepare(`
      INSERT INTO shift_history (player_id, started_at, ended_at, tickets_handled, satisfaction_total, refunds_given_cents, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      this.shift.player_id, this.shift.started_at, nowSec,
      this.shift.tickets_handled, s.satisfaction_total, s.refunds_cents,
      this.shift.status === 'completed' ? 'completed' : this.shift.status,
    ).run();

    // Event-feed: shift_end summary so the dashboard "Live event feed"
    // panel surfaces the post-shift recap (tickets handled / total sat /
    // refund total / rep delta — the latter filled in below).
    const shiftEndData = JSON.stringify({
      resolved: this.shift.tickets_handled,
      total: this.shift.queue.length,
      satisfaction_total: s.satisfaction_total,
      refunds_cents: s.refunds_cents,
      outcome: this.shift.status,
    });
    await this.env.DB.prepare(
      'INSERT INTO events (player_id, event_type, data_json, spawned_at, resolved_at) ' +
      "VALUES (?, 'shift_end', ?, ?, ?)",
    ).bind(this.shift.player_id, shiftEndData, nowSec, nowSec).run();

    // Reputation award based on shift outcome — active-play rep gain.
    // Without this, players stalled at rep=50 (default) and couldn't hit
    // Era 2's 60-rep gate without grinding the slow event-resolution path.
    // Per-ticket avg satisfaction-delta maps to:
    //   ≥ 20 → +3 · ≥ 10 → +2 · ≥ 0 → +1 · ≥ -10 → 0 · < -10 → -2
    if (this.shift.tickets_handled > 0) {
      const avgSat = s.satisfaction_total / this.shift.tickets_handled;
      let repDelta = 0;
      if (avgSat >= 20) repDelta = 3;
      else if (avgSat >= 10) repDelta = 2;
      else if (avgSat >= 0) repDelta = 1;
      else if (avgSat >= -10) repDelta = 0;
      else repDelta = -2;
      this.lastShiftRepDelta = repDelta;
      if (repDelta !== 0) {
        await this.env.DB.prepare(
          'UPDATE players SET reputation = MAX(0, MIN(100, reputation + ?)) WHERE user_id = ?',
        ).bind(repDelta, this.shift.player_id).run();
      }
    }

    // Achievement-check: shift_count épp változott, így a first_shift / shift_marathon
    // most unlock-olódhat. Non-fatal: bármilyen hibát elnyel, a shift-end normálisan fut tovább.
    try {
      const input = await computeAchievementInput(this.env.DB, this.shift.player_id);
      if (input) {
        const newlyUnlocked = await checkAndUnlockAchievements(
          this.env.DB,
          this.shift.player_id,
          input,
        );
        if (newlyUnlocked.length > 0) {
          this.pendingAchievementUnlocks = newlyUnlocked;
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  summary() {
    if (!this.shift) return { tickets_handled: 0, satisfaction_total: 0, refunds_cents: 0, rep_delta: 0 };
    return {
      tickets_handled: this.shift.tickets_handled,
      satisfaction_total: this.shift.queue.reduce((s, c) => s + c.satisfaction_delta_total, 0),
      refunds_cents: this.shift.queue.reduce((s, c) => s + c.refund_given_cents, 0),
      rep_delta: this.lastShiftRepDelta,
    };
  }

  async isPlayerPro(): Promise<boolean> {
    if (!this.shift) return false;
    const r = await this.env.DB.prepare('SELECT is_pro FROM players WHERE user_id = ?')
      .bind(this.shift.player_id).first<{ is_pro: number }>();
    return r?.is_pro === 1;
  }
}
