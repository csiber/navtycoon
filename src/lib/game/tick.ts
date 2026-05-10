// src/lib/game/tick.ts
// Hyperscaler — game-tick logic. Runs every 5 minutes via Cron Trigger.
//
// Per-tick responsibilities:
//   1. money-trickle proportional to MRR (cash += MRR * 5min/30days)
//   2. ticket-spawn for active customers (~5%/hour ≈ 0.4%/tick)
//   3. customer-churn for tickets unanswered >48h (30% roll per tick)
//   4. MRR-recompute from active customers' plan-tiers
//   5. random-event spawn (~0.7% per tick → ~2/hour at full active fleet)
//
// Konvenciók:
//  - Pénz INTEGER (USD cents)
//  - Időbélyeg: epoch-seconds
//  - Per-player-szigetelés: minden write WHERE player_id = ?

import type { Player, PersonaArchetype, EventType } from './types';
import { getPlaceholderTicketForPersona } from './customer-spawn';

const TICK_MINUTES = 5;
const CHURN_HOURS = 48;
const TICKET_SPAWN_PROB_PER_TICK = 0.004;
const CHURN_ROLL_PROB = 0.30;
const RANDOM_EVENT_PROB_PER_TICK = 0.007;

const EVENT_TYPES: ReadonlyArray<EventType> = [
  'ddos_attempt',
  'viral_blog',
  'electricity_spike',
  'recruit_ad',
  'intern_incident',
  'dmca',
  'cooling_failure',
  'security_breach',
];

export interface TickResult {
  player_id: string;
  tickets_spawned: number;
  money_added_cents: number;
  churned: number;
  events_spawned: number;
}

// Lokális D1-shape — minimal-interface in-line, db.ts mintára.
interface DBRow { [k: string]: unknown }
interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = DBRow>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number; last_row_id?: number } }>;
  all<T = DBRow>(): Promise<{ results: T[] }>;
}
interface D1Like {
  prepare(query: string): D1Stmt;
}

export async function tickPlayer(
  db: D1Like,
  player: Player,
  now: number,
): Promise<TickResult> {
  let ticketsSpawned = 0;
  let moneyAdded = 0;
  let churned = 0;
  let eventsSpawned = 0;

  // 1. Money trickle: MRR cents/month → per-tick cents
  if (player.mrr_usd_cents > 0) {
    moneyAdded = Math.round(player.mrr_usd_cents * (TICK_MINUTES / (60 * 24 * 30)));
    if (moneyAdded > 0) {
      await db.prepare(
        'UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?',
      ).bind(moneyAdded, player.user_id).run();
    }
  }

  // 2. Active customers — egyszer kérjük le, használjuk #3-hoz
  const customers = await db.prepare(
    'SELECT id, persona_archetype, satisfaction, last_ticket_at, plan_tier, churn_risk ' +
    'FROM customers WHERE player_id = ? AND is_active = 1',
  ).bind(player.user_id).all<{
    id: number;
    persona_archetype: string;
    satisfaction: number;
    last_ticket_at: number | null;
    plan_tier: string;
    churn_risk: number;
  }>();

  // 3. Ticket spawn — per-active-customer roll
  for (const c of customers.results ?? []) {
    if (Math.random() < TICKET_SPAWN_PROB_PER_TICK) {
      const ticketText = getPlaceholderTicketForPersona(c.persona_archetype as PersonaArchetype);
      await db.prepare(
        "INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) " +
        "VALUES (?, ?, ?, ?, 'open', ?)",
      ).bind(c.id, player.user_id, ticketText.slice(0, 80), ticketText, now).run();
      await db.prepare(
        'UPDATE customers SET last_ticket_at = ? WHERE id = ?',
      ).bind(now, c.id).run();
      ticketsSpawned++;
    }
  }

  // 4. Churn check — customers with open/in_progress tickets older than CHURN_HOURS
  const churnCandidates = await db.prepare(
    'SELECT c.id FROM customers c ' +
    'JOIN tickets t ON t.customer_id = c.id ' +
    'WHERE c.player_id = ? AND c.is_active = 1 ' +
    "  AND t.status IN ('open', 'in_progress') " +
    '  AND t.created_at < ? ' +
    'GROUP BY c.id',
  ).bind(player.user_id, now - CHURN_HOURS * 3600).all<{ id: number }>();

  for (const row of churnCandidates.results ?? []) {
    if (Math.random() < CHURN_ROLL_PROB) {
      await db.prepare(
        'UPDATE customers SET is_active = 0, churn_risk = 100 WHERE id = ?',
      ).bind(row.id).run();
      churned++;
    }
  }

  // 5. Recompute MRR from active customers (post-churn)
  const mrrRow = await db.prepare(
    "SELECT " +
    "  COALESCE(SUM(CASE WHEN plan_tier = 'hobby' THEN ? " +
    "                    WHEN plan_tier = 'business' THEN ? " +
    "                    ELSE 0 END), 0) AS mrr " +
    "FROM customers WHERE player_id = ? AND is_active = 1",
  ).bind(
    player.pricing_hobby_cents,
    player.pricing_business_cents,
    player.user_id,
  ).first<{ mrr: number }>();
  const newMrr = mrrRow?.mrr ?? 0;
  if (newMrr !== player.mrr_usd_cents) {
    await db.prepare(
      'UPDATE players SET mrr_usd_cents = ? WHERE user_id = ?',
    ).bind(newMrr, player.user_id).run();
  }

  // 6. Random event spawn
  if (Math.random() < RANDOM_EVENT_PROB_PER_TICK) {
    const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
    await db.prepare(
      'INSERT INTO events (player_id, event_type, spawned_at) VALUES (?, ?, ?)',
    ).bind(player.user_id, type, now).run();
    eventsSpawned++;
  }

  return {
    player_id: player.user_id,
    tickets_spawned: ticketsSpawned,
    money_added_cents: moneyAdded,
    churned,
    events_spawned: eventsSpawned,
  };
}

export async function tickAllActivePlayers(
  db: D1Like,
  now: number,
  idleCutoffSec: number = 7 * 24 * 3600,
): Promise<TickResult[]> {
  const cutoff = now - idleCutoffSec;
  const players = await db.prepare(
    'SELECT * FROM players WHERE last_active_at >= ?',
  ).bind(cutoff).all<Player>();
  const out: TickResult[] = [];
  for (const p of players.results ?? []) {
    out.push(await tickPlayer(db, p, now));
  }
  return out;
}
