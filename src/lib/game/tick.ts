// src/lib/game/tick.ts
// Hyperscales — game-tick logic. Runs every 5 minutes via Cron Trigger.
//
// Per-tick responsibilities:
//   1. money-trickle proportional to MRR (cash += MRR * 5min/30days)
//   2.5 szerver-havidíj időarányosan (2026-11-12, játékmag); a tartozás-határnál a legdrágább üres gép eladva
//   2. ticket-spawn for active customers (economy.ts: 0,15%/tick, elégedett ügyfélnél fele)
//        – AI-generated ha env.ai + env.vectorize + LLM-cap engedi
//        – egyébként placeholder-fallback (getPlaceholderTicketForPersona)
//   3. customer-churn for tickets unanswered >48h (30% roll per tick, elégedettnél ¼; 3 törzsügyfél marad)
//   4. MRR-recompute from active customers' plan-tiers
//   5. marketing-driven customer-acquisition (SEO+PPC+referral; PPC a megfizethetőhöz igazodik)
//   5.5 egyszeri áthidaló befektető, ha a pénz a küszöb alá esik
//   6. random-event spawn (economy.ts: 0,1%/tick ≈ hetente 2); a fejlesztések egy részét kivédik
//
// 2026-11-12 (játékmag): kapacitás — új ügyfél csak szabad helyre jön (különben capacity_lost), túlterhelésnél
// több ticket és lassan romló elégedettség; a fejlesztések hatása (upgrade-effects.ts) mindenhol érvényes.
//
// Konvenciók:
//  - Pénz INTEGER (USD cents)
//  - Időbélyeg: epoch-seconds
//  - Per-player-szigetelés: minden write WHERE player_id = ?

import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { Player, PersonaArchetype, PlanTier, EraId } from './types';
import { getPlaceholderTicketForPersona, spawnCustomer } from './customer-spawn';
import { generateAiTicket } from '../ai/ticket-generator';
import { storeTicketMemory, type VectorizeBinding } from '../ai/vectorize';
import { tryConsumeLlmCall } from './llm-cap';
import type { WorkersAIBinding } from '../ai/workers-ai';
import { maybeAdvanceEra } from './era-progress';
import {
  ECONOMY, TICK_MINUTES, ppcSpendPerTick, acquisitionProb, ticketSpawnProb, churnProb, bridgeDue, isEngaged,
  serverFeeForTick, effectiveMonthlyFees, applyServerFee, pickServerToSell, overloadTicketFactor, overloadRatio,
} from './economy';
import { loadUpgradeEffects, eventAvoidProb, NO_EFFECTS } from './upgrade-effects';
import { SERVER_SPECS, serverCapacity } from './server-types';
import { assignLoad } from './capacity';
import { eventPoolForEra } from './event-pool';
import { tickAchievements } from './achievement-tick';
import type { HubCtx } from '../aikahub-achi';

// A gazdaság számai (ticket-, lemorzsolódás-, beszerzés-, PPC-szabályok) 2026-11-12 óta az economy.ts-ben
// élnek: a tick, a pénzáramlás-kijelzés és a szimulátor (economy-sim.ts) ugyanazt használja.
export { TICK_MINUTES };
export const PPC_FULL_COST_PER_TICK_CENTS = ECONOMY.ppc_full_cost_per_tick_cents;

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
  /** true, ha a PPC-keret miatt a beállítottnál kevesebb ment hirdetésre. */
  marketing_throttled: boolean;
  /** Az egyszeri áthidaló befektető összege, ha most jött (különben 0). */
  bridge_granted_cents: number;
  /** A most levont szerver-havidíj (cent). */
  server_fees_cents?: number;
  /** Helyhiány miatt elmaradt új ügyfél ebben a tickben (0/1). */
  customers_lost_capacity?: number;
  /** Tartozás miatt eladott gép (0/1). */
  servers_auto_sold?: number;
  /** Fejlesztés által kivédett esemény típusa (ha volt). */
  event_avoided?: string | null;
  era_advanced_to: EraId | null;
  /** A tick végén feloldott achievementek (lásd achievement-tick.ts). */
  achievements_unlocked?: string[];
}

export interface TickEnv {
  ai?: WorkersAIBinding;
  vectorize?: VectorizeBinding;
  /** AikaHub-továbbítás az itt feloldott achievementekhez (kulcs nélkül kihagyva; a cron úgyis újrapróbálja). */
  hub?: HubCtx;
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
  let marketingThrottled = false;
  let bridgeGranted = 0;
  let serverFees = 0;
  let lostCapacity = 0;
  let autoSold = 0;
  let eventAvoided: string | null = null;

  // Hard guard: NPCs use the archetype engine in npc-tick.ts, not this
  // real-player loop. Step 5 here recomputes MRR from active customers —
  // NPCs have none, so running tickPlayer on them would zero out their
  // MRR. tickAllActivePlayers filters them out already, but if anyone
  // calls tickPlayer directly with an NPC row, fail fast instead of
  // silently corrupting state.
  if ((player as { is_npc?: number }).is_npc === 1) {
    return {
      player_id: player.user_id,
      tickets_spawned: 0, ai_tickets: 0, placeholder_tickets: 0,
      money_added_cents: 0, churned: 0, events_spawned: 0,
      customers_acquired: 0, marketing_spent_cents: 0,
      marketing_throttled: false, bridge_granted_cents: 0,
      era_advanced_to: null,
    };
  }

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

  // 0.5. Csendes elégedettség (economy.quiet_satisfaction): 12 óránként egyszer (az első tick az új félnapban),
  //      az aktív, nyitott ticket nélküli ügyfelek +step elégedettséget kapnak a cap-ig — ha a játékos az utóbbi
  //      engagement_window_hours órában belépett.
  const quiet = ECONOMY.quiet_satisfaction;
  const lastTicked = (player as { last_ticked_at?: number }).last_ticked_at ?? 0;
  const engaged = isEngaged(ECONOMY, now, player.last_active_at);
  if (quiet && engaged && Math.floor(now / 43200) !== Math.floor(lastTicked / 43200)) {
    await db.prepare(
      'UPDATE customers SET satisfaction = MIN(?, satisfaction + ?) ' +
      'WHERE player_id = ? AND is_active = 1 AND satisfaction < ? ' +
      "  AND id NOT IN (SELECT customer_id FROM tickets WHERE player_id = ? AND status IN ('open', 'in_progress'))",
    ).bind(quiet.cap, quiet.step, player.user_id, quiet.cap, player.user_id).run();
  }

  // 0.6. A fejlesztések hatása és a gépek (kapacitás, havidíj) — egyszer kérjük le.
  const eff = ECONOMY.upgrade_effects ? await loadUpgradeEffects(db, player.user_id) : NO_EFFECTS;
  let fleet = ((await db.prepare(
    'SELECT id, type, capacity, monthly_cost_cents FROM servers WHERE player_id = ? ORDER BY purchased_at ASC, id ASC',
  ).bind(player.user_id).all<{ id: number; type: string; capacity: number; monthly_cost_cents: number }>()).results ?? []);
  const fleetCapacity = () => fleet.reduce((a, sv) => a + serverCapacity(sv.type, sv.capacity, eff.capacity_pct), 0);

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

  // 2.5. Szerver-havidíj (economy.server_fees): időarányosan, a fejlesztések fee_pct-jével. A pénz legfeljebb
  //      −debt_limit-ig mehet; ha eléri, a legdrágább ÜRES fizetős gép leáll (eladjuk a vételár 30%-áért, ami a
  //      tartozást rendezi), és ezt eseményként látja a játékos. A díjmentes kezdőgép soha nem áll le.
  const activeNow = (customers.results ?? []).length;
  if (ECONOMY.server_fees && fleet.length > 0) {
    const listed = fleet.reduce((a, sv) => a + Math.max(0, sv.monthly_cost_cents), 0);
    const fee = serverFeeForTick(effectiveMonthlyFees(listed, eff.fee_pct), now);
    if (fee > 0) {
      const cashRow = await db.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ?')
        .bind(player.user_id).first<{ cash_usd_cents: number }>();
      const cashBefore = cashRow?.cash_usd_cents ?? player.cash_usd_cents;
      const res = applyServerFee(ECONOMY, cashBefore, fee);
      serverFees = cashBefore - res.cash;
      if (serverFees !== 0) {
        await db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?').bind(serverFees, player.user_id).run();
      }
      if (res.over_limit) {
        const loads = assignLoad(fleet.map((sv) => ({ ...sv, capacity: serverCapacity(sv.type, sv.capacity, eff.capacity_pct) })), activeNow);
        const idx = pickServerToSell(loads.servers.map((sv) => ({ monthly_cost_cents: sv.monthly_cost_cents, load: sv.load })));
        if (idx >= 0) {
          const sold = fleet[idx];
          const spec = (SERVER_SPECS as Record<string, { purchase_cost_cents: number } | undefined>)[sold.type];
          const refund = Math.round(((spec?.purchase_cost_cents ?? 0) * ECONOMY.auto_sell_refund_pct) / 100);
          await db.prepare('DELETE FROM servers WHERE id = ? AND player_id = ?').bind(sold.id, player.user_id).run();
          await db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?').bind(refund, player.user_id).run();
          await db.prepare(
            'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
            "VALUES (?, 'server_auto_sold', ?, ?, 'negative', ?)",
          ).bind(player.user_id, JSON.stringify({
            server_type: sold.type, cash_delta_cents: refund, had_customers: loads.servers[idx].load,
          }), now, now).run();
          fleet = fleet.filter((_, i) => i !== idx);
          autoSold = 1;
        }
      }
    }
  }
  const capacityNow = fleetCapacity();

  // 3. Ticket spawn — per-active-customer roll; AI first, placeholder fallback.
  //    A fejlesztések ticket_pct-je kevesebb ticketet hoz; túlterhelésnél (több ügyfél, mint hely) több jön.
  const ovlFactor = overloadTicketFactor(ECONOMY, activeNow, capacityNow);
  if (ECONOMY.capacity_limit && ECONOMY.overload && overloadRatio(activeNow, capacityNow) > 0
    && Math.floor(now / 43200) !== Math.floor(lastTicked / 43200)) {
    // Túlterhelés: 12 óránként −sat_step elégedettség minden aktív ügyfélnek (lassú oldalak, kiesések).
    await db.prepare(
      'UPDATE customers SET satisfaction = MAX(-100, satisfaction - ?) WHERE player_id = ? AND is_active = 1',
    ).bind(ECONOMY.overload.sat_step, player.user_id).run();
  }
  for (const c of customers.results ?? []) {
    if (Math.random() >= ticketSpawnProb(ECONOMY, c.satisfaction, eff.ticket_pct, ovlFactor)) continue;

    let summary = '';
    let fullText = '';
    let usedAi = false;

    const canUseAi = !!env.ai && !!env.vectorize;
    if (canUseAi) {
      const isPro = player.is_pro === 1;
      const allowed = await tryConsumeLlmCall(db, player.user_id, isPro, eff.ai_calls);
      if (allowed) {
        try {
          const t = await generateAiTicket(env.ai!, env.vectorize!, {
            customer_id: c.id,
            customer_name: c.name,
            archetype: c.persona_archetype as PersonaArchetype,
            satisfaction: c.satisfaction,
            // If the player set a UI language, the LLM-generated ticket
            // should match — "HU felület = HU ticket" was the explicit
            // user request.
            lang: ((player as { preferred_lang?: string }).preferred_lang as 'en' | 'hu' | 'de' | undefined) ?? 'en',
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
      const placeholder = getPlaceholderTicketForPersona(
        c.persona_archetype as PersonaArchetype,
        ((player as { preferred_lang?: string }).preferred_lang as 'en' | 'hu' | 'de' | undefined) ?? 'en',
      );
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

  // 4. Churn check — customers with open/in_progress tickets older than churn_hours.
  //    Az elégedett ügyfél türelmesebb (happy_churn_factor), és a törzsügyfél-padló (churn_floor_customers)
  //    alá a lemorzsolódás nem visz: így a tétlen játékosnak is marad egy kis MRR.
  const churnCandidates = await db.prepare(
    'SELECT c.id, c.satisfaction FROM customers c ' +
    'JOIN tickets t ON t.customer_id = c.id ' +
    'WHERE c.player_id = ? AND c.is_active = 1 ' +
    "  AND t.status IN ('open', 'in_progress') " +
    '  AND t.created_at < ? ' +
    'GROUP BY c.id',
  ).bind(player.user_id, now - ECONOMY.churn_hours * 3600).all<{ id: number; satisfaction: number }>();

  let activeCount = (customers.results ?? []).length;
  for (const row of churnCandidates.results ?? []) {
    if (activeCount <= ECONOMY.churn_floor_customers) break;
    if (Math.random() < churnProb(ECONOMY, row.satisfaction, player.is_pro === 1, eff.churn_pct)) {
      await db.prepare(
        'UPDATE customers SET is_active = 0, churn_risk = 100 WHERE id = ?',
      ).bind(row.id).run();
      if (ECONOMY.close_tickets_on_churn) {
        // A távozott ügyfél ticketje ne foglaljon helyet a következő műszakban.
        await db.prepare(
          "UPDATE tickets SET status = 'churned' WHERE customer_id = ? AND status IN ('open', 'in_progress')",
        ).bind(row.id).run();
      }
      churned++;
      activeCount--;
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
  // A fejlesztések mrr_pct-je (pl. PostgreSQL-kiegészítő) ügyfelenként több bevételt hoz.
  const newMrr = Math.round((mrrRow?.mrr ?? 0) * (ECONOMY.upgrade_effects ? 1 + eff.mrr_pct / 100 : 1));
  if (newMrr !== player.mrr_usd_cents) {
    await db.prepare(
      'UPDATE players SET mrr_usd_cents = ? WHERE user_id = ?',
    ).bind(newMrr, player.user_id).run();
  }

  // 6. Marketing-driven customer acquisition
  //    Channels: SEO (free), PPC (costs cash, ppc_acquisition_weight× stronger), referral (free; rep-multiplied).
  //    A PPC-költés a megfizethetőhöz igazodik (economy.ppcSpendPerTick): a napi bevétel egy része + a tartalék
  //    fölötti pénz kis hányada; a beszerzésbe csak a ténylegesen elköltött rész számít.
  {
    // Re-read latest cash because money-trickle (#1) may have updated it.
    const cashRow = await db.prepare(
      'SELECT cash_usd_cents FROM players WHERE user_id = ?',
    ).bind(player.user_id).first<{ cash_usd_cents: number }>();
    const cashNow = cashRow?.cash_usd_cents ?? player.cash_usd_cents;
    const spend = ppcSpendPerTick(ECONOMY, {
      ppc_pct: player.marketing_ppc_pct, cash_cents: cashNow, mrr_cents: newMrr,
    });
    marketingThrottled = spend.throttled;
    const acqProb = acquisitionProb(ECONOMY, {
      seo_pct: player.marketing_seo_pct,
      ppc_effective_pct: spend.effective_pct,
      referral_pct: player.marketing_referral_pct,
      reputation: player.reputation,
      era: player.current_era,
      is_pro: player.is_pro === 1,
      age_days: (now - player.founded_at) / 86400,
      pricing_hobby_cents: player.pricing_hobby_cents,
      pricing_business_cents: player.pricing_business_cents,
      acq_pct: eff.acq_pct,
    });
    if (acqProb > 0) {
      const acquired = Math.random() < acqProb;
      if (acquired && ECONOMY.capacity_limit && activeCount >= capacityNow) {
        // Nincs szabad hely: az új ügyfél máshoz megy. Naponta egy eseménysor gyűjti (data_json.count).
        lostCapacity = 1;
        const dayStart = Math.floor(now / 86400) * 86400;
        const row = await db.prepare(
          "SELECT id, data_json FROM events WHERE player_id = ? AND event_type = 'capacity_lost' AND spawned_at >= ? ORDER BY id DESC LIMIT 1",
        ).bind(player.user_id, dayStart).first<{ id: number; data_json: string | null }>();
        if (row) {
          let n = 1;
          try { n = Number((JSON.parse(row.data_json ?? '{}') as { count?: number }).count) || 1; } catch { /* hibás JSON */ }
          await db.prepare('UPDATE events SET data_json = ? WHERE id = ?').bind(JSON.stringify({ count: n + 1 }), row.id).run();
        } else {
          await db.prepare(
            'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
            "VALUES (?, 'capacity_lost', ?, ?, 'negative', ?)",
          ).bind(player.user_id, JSON.stringify({ count: 1 }), now, now).run();
        }
      } else if (acquired) {
        // Plan-tier: rep-weighted. Higher rep → more business-tier customers.
        const tier: PlanTier = Math.random() < player.reputation / 200 ? 'business' : 'hobby';
        const sp = spawnCustomer(tier);
        await db.prepare(
          'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(player.user_id, sp.name, sp.persona_archetype, tier, now, sp.starting_satisfaction).run();
        customersAcquired++;
      }
      if (spend.cost_cents > 0) {
        await db.prepare(
          'UPDATE players SET cash_usd_cents = MAX(0, cash_usd_cents - ?) WHERE user_id = ?',
        ).bind(spend.cost_cents, player.user_id).run();
        marketingSpent = spend.cost_cents;
      }
    }

    // 6.5. Egyszeri áthidaló befektető: ha a pénz a küszöb alá esett, cégenként egyszer jön egy juttatás
    //      (eseményként a hírfolyamban). A „volt-e már" az events táblából derül ki, így nem kell új oszlop.
    const bridge = ECONOMY.bridge;
    const cashAfter = cashNow - marketingSpent;
    if (bridge && cashAfter < bridge.below_cents) {
      const used = await db.prepare(
        "SELECT 1 AS x FROM events WHERE player_id = ? AND event_type = 'bridge_investor' LIMIT 1",
      ).bind(player.user_id).first<{ x: number }>();
      if (bridgeDue(ECONOMY, {
        cash_cents: cashAfter, age_days: (now - player.founded_at) / 86400, already_used: !!used,
      })) {
        await db.prepare(
          'UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?',
        ).bind(bridge.grant_cents, player.user_id).run();
        await db.prepare(
          'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
          "VALUES (?, 'bridge_investor', ?, ?, 'positive', ?)",
        ).bind(player.user_id, JSON.stringify({ cash_delta_cents: bridge.grant_cents }), now, now).run();
        bridgeGranted = bridge.grant_cents;
      }
    }
  }

  // 7. Random event spawn — pool depends on player's current era.
  if (Math.random() < ECONOMY.random_event_prob_per_tick) {
    const pool = eventPoolForEra(player.current_era);
    const type = pool[Math.floor(Math.random() * pool.length)];
    const avoid = ECONOMY.upgrade_effects ? eventAvoidProb(type, eff) : 0;
    if (avoid > 0 && Math.random() < avoid) {
      // Egy fejlesztés kivédte: lezárt sor a hírfolyamba, hogy látsszon, mit ért a fejlesztés.
      await db.prepare(
        'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
        "VALUES (?, 'event_avoided', ?, ?, 'positive', ?)",
      ).bind(player.user_id, JSON.stringify({ avoided_type: type }), now, now).run();
      eventAvoided = type;
    } else {
      await db.prepare(
        'INSERT INTO events (player_id, event_type, spawned_at) VALUES (?, ?, ?)',
      ).bind(player.user_id, type, now).run();
      eventsSpawned++;
    }
  }

  // 7.5. Passive reputation drift: average customer satisfaction nudges rep.
  //      Without this, players with no active events can't grow rep at all,
  //      blocking Era progression. Slow rate: ±1 rep per ~50 ticks (~4h) at extremes.
  //      Only fires when ≥3 active customers exist (otherwise too noisy).
  {
    const repRow = await db.prepare(
      'SELECT AVG(satisfaction) AS avg_sat, COUNT(*) AS n FROM customers ' +
      'WHERE player_id = ? AND is_active = 1',
    ).bind(player.user_id).first<{ avg_sat: number; n: number }>();
    const avgSat = repRow?.avg_sat ?? 50;
    const custN = repRow?.n ?? 0;
    if (custN >= 3) {
      // Map avg satisfaction (0-100) to a rep-nudge probability per tick:
      //   ≥70 → 2% chance of +1 rep
      //   <30 → 2% chance of -1 rep
      // Otherwise no change. Bounded: rep stays in [0, 100].
      const roll = Math.random();
      const staleOk = !ECONOMY.rep_drift_requires_no_stale_tickets || (churnCandidates.results ?? []).length === 0;
      if (avgSat >= 70 && staleOk && engaged && roll < 0.02) {
        await db.prepare(
          'UPDATE players SET reputation = MIN(100, reputation + 1) WHERE user_id = ?',
        ).bind(player.user_id).run();
      } else if (avgSat < 30 && roll < 0.02) {
        await db.prepare(
          'UPDATE players SET reputation = MAX(0, reputation - 1) WHERE user_id = ?',
        ).bind(player.user_id).run();
      }
    }
    // Lassú visszatérés: a mélyre esett hírnév magától visszakúszik a rec.below-ig (nincs hírnév-spirál).
    const rec = ECONOMY.rep_recovery;
    if (rec && player.reputation < rec.below && Math.random() < rec.prob_per_tick) {
      await db.prepare(
        'UPDATE players SET reputation = MIN(?, reputation + 1) WHERE user_id = ?',
      ).bind(rec.below, player.user_id).run();
    }
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

  // 9. Achievementek a tick után (korszak, MRR, ügyfélszám, DDoS-túlélés, mélypont). Best-effort.
  let achievementsUnlocked: string[] = [];
  try {
    achievementsUnlocked = await tickAchievements(db, player.user_id, now, env.hub);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('tickAchievements failed', (e as Error)?.message);
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
    marketing_throttled: marketingThrottled,
    bridge_granted_cents: bridgeGranted,
    server_fees_cents: serverFees,
    customers_lost_capacity: lostCapacity,
    servers_auto_sold: autoSold,
    event_avoided: eventAvoided,
    era_advanced_to: eraAdvancedTo,
    achievements_unlocked: achievementsUnlocked,
  };
}

export async function tickAllActivePlayers(
  db: D1Database,
  now: number,
  env: TickEnv = {},
  idleCutoffSec: number = 7 * 24 * 3600,
): Promise<TickResult[]> {
  const cutoff = now - idleCutoffSec;
  // Exclude NPCs — they live on the same table but use the archetype
  // engine in npc-tick.ts, not the real-customer / ticket / churn loop.
  const players = await db.prepare(
    'SELECT * FROM players WHERE last_active_at >= ? AND is_npc = 0',
  ).bind(cutoff).all<Player>();
  const out: TickResult[] = [];
  for (const p of players.results ?? []) {
    out.push(await tickPlayer(db, p, now, env));
  }
  return out;
}
