// src/lib/game/tick.ts
// Hyperscaler — game-tick logic. Runs every 5 minutes via Cron Trigger.
//
// Per-tick responsibilities:
//   1. money-trickle proportional to MRR (cash += MRR * 5min/30days)
//   2. ticket-spawn for active customers (~5%/hour ≈ 0.4%/tick)
//        – AI-generated ha env.ai + env.vectorize + LLM-cap engedi
//        – egyébként placeholder-fallback (getPlaceholderTicketForPersona)
//   3. customer-churn for tickets unanswered >48h (30% roll per tick)
//   4. MRR-recompute from active customers' plan-tiers
//   5. marketing-driven customer-acquisition (SEO+PPC+referral, PPC costs cash)
//   6. random-event spawn (~0.7% per tick → ~2/hour at full active fleet)
//
// Konvenciók:
//  - Pénz INTEGER (USD cents)
//  - Időbélyeg: epoch-seconds
//  - Per-player-szigetelés: minden write WHERE player_id = ?

import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { Player, PersonaArchetype, EventType, PlanTier, EraId } from './types';
import { getPlaceholderTicketForPersona, spawnCustomer } from './customer-spawn';
import { generateAiTicket } from '../ai/ticket-generator';
import { storeTicketMemory, type VectorizeBinding } from '../ai/vectorize';
import { tryConsumeLlmCall } from './llm-cap';
import type { WorkersAIBinding } from '../ai/workers-ai';
import { maybeAdvanceEra } from './era-progress';

const TICK_MINUTES = 5;
const CHURN_HOURS = 48;
const TICKET_SPAWN_PROB_PER_TICK = 0.004;
const CHURN_ROLL_PROB = 0.30;
const RANDOM_EVENT_PROB_PER_TICK = 0.007;
// Customer acquisition (Plan 4): marketing-mix drives spawn-rate.
// Base prob = base × (mix_total/300) × era_factor × rep_factor × pro_factor.
// At full mix (300pct) + Era 1 + 50 rep: ~2.5%/tick ≈ 1 customer / ~3h.
// PPC channel costs $1/tick at 100%, scales linearly. Unaffordable → PPC mix is dropped.
// Pro perk: 2× acquisition + 0.5× churn.
const ACQUISITION_BASE_PROB = 0.025;
const ERA_FACTOR: Record<number, number> = { 1: 1, 2: 1.5, 3: 2, 4: 3 };
const PPC_FULL_COST_PER_TICK_CENTS = 100;
const PRO_ACQUISITION_MULTIPLIER = 2;
const PRO_CHURN_MULTIPLIER = 0.5;
// Welcome-boost: first 7 days of a player's run get 2× acquisition rate so
// new players see growth quickly (critical for retention given default
// ~0.4%/tick rate at signup-default mix).
const WELCOME_BOOST_DAYS = 7;
const WELCOME_BOOST_MULTIPLIER = 2;

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
  ai_tickets: number;
  placeholder_tickets: number;
  money_added_cents: number;
  churned: number;
  events_spawned: number;
  customers_acquired: number;
  marketing_spent_cents: number;
  era_advanced_to: EraId | null;
}

export interface TickEnv {
  ai?: WorkersAIBinding;
  vectorize?: VectorizeBinding;
}

export async function tickPlayer(
  db: D1Database,
  player: Player,
  now: number,
  env: TickEnv = {},
): Promise<TickResult> {
  let ticketsSpawned = 0;
  let aiTickets = 0;
  let placeholderTickets = 0;
  let moneyAdded = 0;
  let churned = 0;
  let eventsSpawned = 0;
  let customersAcquired = 0;
  let marketingSpent = 0;

  // 0. Daily shift-counter rollover (UTC midnight). Without this,
  //    free_shifts_today / paid_shifts_today never reset → players are
  //    capped at the day-1 quota forever (real bug found in prod).
  const todayUtcStart = Math.floor(now / 86400) * 86400;
  const lastShiftReset = (player as { last_shift_reset_at?: number }).last_shift_reset_at ?? 0;
  if (lastShiftReset < todayUtcStart) {
    await db.prepare(
      'UPDATE players SET free_shifts_today = 0, paid_shifts_today = 0, last_shift_reset_at = ? WHERE user_id = ?',
    ).bind(todayUtcStart, player.user_id).run();
  }

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
    'SELECT id, persona_archetype, satisfaction, last_ticket_at, plan_tier, churn_risk, name ' +
    'FROM customers WHERE player_id = ? AND is_active = 1',
  ).bind(player.user_id).all<{
    id: number;
    persona_archetype: string;
    satisfaction: number;
    last_ticket_at: number | null;
    plan_tier: string;
    churn_risk: number;
    name: string;
  }>();

  // 3. Ticket spawn — per-active-customer roll; AI first, placeholder fallback
  for (const c of customers.results ?? []) {
    if (Math.random() >= TICKET_SPAWN_PROB_PER_TICK) continue;

    let summary = '';
    let fullText = '';
    let usedAi = false;

    const canUseAi = !!env.ai && !!env.vectorize;
    if (canUseAi) {
      const isPro = player.is_pro === 1;
      const allowed = await tryConsumeLlmCall(db, player.user_id, isPro);
      if (allowed) {
        try {
          const t = await generateAiTicket(env.ai!, env.vectorize!, {
            customer_id: c.id,
            customer_name: c.name,
            archetype: c.persona_archetype as PersonaArchetype,
            satisfaction: c.satisfaction,
          });
          summary = t.summary;
          fullText = t.full_text;
          usedAi = true;
        } catch {
          // fall through to placeholder
        }
      }
    }

    if (!usedAi) {
      const placeholder = getPlaceholderTicketForPersona(c.persona_archetype as PersonaArchetype);
      summary = placeholder.slice(0, 80);
      fullText = placeholder;
    }

    const ticketRes = await db.prepare(
      'INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) ' +
      "VALUES (?, ?, ?, ?, 'open', ?) RETURNING id",
    ).bind(c.id, player.user_id, summary, fullText, now).first<{ id: number }>();
    await db.prepare(
      'UPDATE customers SET last_ticket_at = ? WHERE id = ?',
    ).bind(now, c.id).run();

    if (usedAi && ticketRes && env.vectorize && env.ai) {
      const sentiment: 'positive' | 'neutral' | 'negative' =
        c.satisfaction >= 60 ? 'positive' : c.satisfaction >= 30 ? 'neutral' : 'negative';
      try {
        await storeTicketMemory(env.ai, env.vectorize, {
          ticket_id: ticketRes.id,
          customer_id: c.id,
          summary,
          sentiment,
          era_id: player.current_era,
        });
      } catch {
        // non-blocking — memory-store best-effort
      }
    }

    ticketsSpawned++;
    if (usedAi) aiTickets++;
    else placeholderTickets++;
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

  const churnProb = player.is_pro === 1
    ? CHURN_ROLL_PROB * PRO_CHURN_MULTIPLIER
    : CHURN_ROLL_PROB;
  for (const row of churnCandidates.results ?? []) {
    if (Math.random() < churnProb) {
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

  // 6. Marketing-driven customer acquisition
  //    Channels: SEO (free), PPC (costs cash), referral (free; rep-multiplied)
  //    PPC cost per tick = full_cost × (ppc_pct / 100). If cash < ppc_cost,
  //    PPC channel drops out of the mix this tick.
  {
    const seoPct = player.marketing_seo_pct;
    const referralPct = player.marketing_referral_pct;
    let ppcPct = player.marketing_ppc_pct;
    const ppcCost = Math.round(PPC_FULL_COST_PER_TICK_CENTS * (ppcPct / 100));
    // Re-read latest cash because money-trickle (#1) may have updated it.
    const cashRow = await db.prepare(
      'SELECT cash_usd_cents FROM players WHERE user_id = ?',
    ).bind(player.user_id).first<{ cash_usd_cents: number }>();
    const cashNow = cashRow?.cash_usd_cents ?? player.cash_usd_cents;
    let ppcEffectiveCost = 0;
    if (ppcPct > 0 && cashNow >= ppcCost) {
      ppcEffectiveCost = ppcCost;
    } else {
      ppcPct = 0; // PPC drops if unaffordable
    }
    const mixTotal = seoPct + ppcPct + referralPct;
    if (mixTotal > 0) {
      // Referral bonus: rep boosts referral-channel weight
      const referralBoost = 1 + Math.max(0, player.reputation - 50) / 100;
      const effectiveMix = seoPct + ppcPct + referralPct * referralBoost;
      const mixFactor = effectiveMix / 300;
      const eraFactor = ERA_FACTOR[player.current_era] ?? 1;
      const repFactor = Math.max(0.1, player.reputation / 100);
      const proFactor = player.is_pro === 1 ? PRO_ACQUISITION_MULTIPLIER : 1;
      const ageDays = (now - player.founded_at) / 86400;
      const welcomeFactor = ageDays < WELCOME_BOOST_DAYS ? WELCOME_BOOST_MULTIPLIER : 1;
      const acqProb = ACQUISITION_BASE_PROB * mixFactor * eraFactor * repFactor * proFactor * welcomeFactor;
      if (Math.random() < acqProb) {
        // Plan-tier: rep-weighted. Higher rep → more business-tier customers.
        const tier: PlanTier = Math.random() < player.reputation / 200 ? 'business' : 'hobby';
        const sp = spawnCustomer(tier);
        await db.prepare(
          'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(player.user_id, sp.name, sp.persona_archetype, tier, now, sp.starting_satisfaction).run();
        customersAcquired++;
      }
      if (ppcEffectiveCost > 0) {
        await db.prepare(
          'UPDATE players SET cash_usd_cents = MAX(0, cash_usd_cents - ?) WHERE user_id = ?',
        ).bind(ppcEffectiveCost, player.user_id).run();
        marketingSpent = ppcEffectiveCost;
      }
    }
  }

  // 7. Random event spawn
  if (Math.random() < RANDOM_EVENT_PROB_PER_TICK) {
    const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
    await db.prepare(
      'INSERT INTO events (player_id, event_type, spawned_at) VALUES (?, ?, ?)',
    ).bind(player.user_id, type, now).run();
    eventsSpawned++;
  }

  // 8. Era-progression: auto-advance if requirements met. Re-read player to
  //    use post-tick MRR (acquisition + churn may have changed it).
  let eraAdvancedTo: EraId | null = null;
  try {
    const fresh = await db.prepare('SELECT * FROM players WHERE user_id = ?')
      .bind(player.user_id).first<Player>();
    if (fresh) {
      eraAdvancedTo = await maybeAdvanceEra(db, fresh, now);
    }
  } catch (e) {
    // Non-fatal — era advancement failure shouldn't break the tick.
    // eslint-disable-next-line no-console
    console.error('maybeAdvanceEra failed', e);
  }

  // Mark this tick — both cron and lazy-tick paths converge here, so the
  // dashboard's "last tick X min ago" and the lazy-tick 5-min throttle stay
  // consistent regardless of which path fired.
  await db.prepare(
    'UPDATE players SET last_ticked_at = ? WHERE user_id = ?',
  ).bind(now, player.user_id).run();

  return {
    player_id: player.user_id,
    tickets_spawned: ticketsSpawned,
    ai_tickets: aiTickets,
    placeholder_tickets: placeholderTickets,
    money_added_cents: moneyAdded,
    churned,
    events_spawned: eventsSpawned,
    customers_acquired: customersAcquired,
    marketing_spent_cents: marketingSpent,
    era_advanced_to: eraAdvancedTo,
  };
}

export async function tickAllActivePlayers(
  db: D1Database,
  now: number,
  env: TickEnv = {},
  idleCutoffSec: number = 7 * 24 * 3600,
): Promise<TickResult[]> {
  const cutoff = now - idleCutoffSec;
  const players = await db.prepare(
    'SELECT * FROM players WHERE last_active_at >= ?',
  ).bind(cutoff).all<Player>();
  const out: TickResult[] = [];
  for (const p of players.results ?? []) {
    out.push(await tickPlayer(db, p, now, env));
  }
  return out;
}
