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
// 2026-11-12 (dedikált-kör): a dedikált gépre csak egy nagy ügyfél (plan_tier = 'dedicated') jön, saját úton
// (6.2. lépés); több ticketet hoz, az SLA-t (24 óra) és az elégedettségét félnaponta nézzük (2.2. lépés), és ha
// elmegy, hírnevet visz és egy ideig nem jön új (dedicated.ts). A kapacitás csak a sima ügyfelekre vonatkozik.
// 2026-11-12 (csapat- és hálózat-kör): a bérek és a hálózat havidíja a szerver-havidíjjal együtt fogy (2.5.);
// a tartozás-határnál előbb a legkevésbé hasznos ember megy, aztán a DDoS-védelem, csak utána a gép. Félnaponta
// (2.3.) az ügyfélszolgálat megold néhány ticketet, frissül a hangulat (felmondás, csapatdráma), és a kevés
// sávszélesség (lassulás) −elégedettséget hoz; a lassulás a ticketeket is szaporítja (3.). Az SRE, az értékesítő és
// a DDoS-védelem a fejlesztések hatás-kulcsain hat (combineEffects). Ha a 0013-as migráció még nem futott le, a
// csapat üres és a hálózat az ingyenes alap (staff.loadStaff, network.loadNetwork): csendes visszaesés.
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
  fleetUtilPct,
} from './economy';
import { loadUpgradeEffects, eventAvoidProb, NO_EFFECTS, combineEffects } from './upgrade-effects';
import {
  type StaffMember, loadStaff, staffEffects, totalSalaryCents, staffSalaryCents, supportShare, supportPerDay,
  supportResolveSat, moraleStep, pickLeastUseful,
} from './staff';
import {
  type NetworkState, NO_NETWORK, loadNetwork, networkActive, networkEffects, networkMonthlyCents, bandwidthUnits,
  trafficUnits, slowdownRatio, slowdownTicketFactor,
} from './network';
import { SERVER_SPECS, serverCapacity } from './server-types';
import { assignFleetLoad } from './capacity';
import {
  isDedicatedCustomer, isDedicatedServer, dedicatedFeeCents, dedicatedArrivalProb, dedicatedBoxes, pickDedicatedClient,
  DEDICATED_TIER,
} from './dedicated';
import { getEnterpriseTicket } from './customer-spawn';
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
  /** Dedikált-kör: most jelentkezett / távozott nagy ügyfél (0/1, illetve darab). */
  dedicated_signed?: number;
  dedicated_lost?: number;
  /** Csapat-kör: levont bér és hálózati díj (cent), az ügyfélszolgálat által megoldott ticketek, felmondások,
   *  tartozás miatt elküldött munkatársak, és hogy lassult-e a hálózat. */
  salaries_cents?: number;
  network_fees_cents?: number;
  staff_resolved?: number;
  staff_quit?: number;
  staff_cut?: number;
  network_slow?: boolean;
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
  let dedSigned = 0;
  let dedLostN = 0;
  const DED = ECONOMY.dedicated;
  // Egy nagy ügyfél távozása: inaktív, a ticketjei lezárulnak, hírnevet visz, és eseménysor (ebből számoljuk a
  // várakozási időt is, így nem kell új oszlop).
  const loseDedicated = async (c: { id: number; name: string }, reason: 'unhappy' | 'sla' | 'sold'): Promise<void> => {
    await db.prepare('UPDATE customers SET is_active = 0, churn_risk = 100 WHERE id = ?').bind(c.id).run();
    await db.prepare("UPDATE tickets SET status = 'churned' WHERE customer_id = ? AND status IN ('open', 'in_progress')").bind(c.id).run();
    const repLoss = DED?.leave_rep ?? 0;
    if (repLoss > 0) {
      await db.prepare('UPDATE players SET reputation = MAX(0, reputation - ?) WHERE user_id = ?').bind(repLoss, player.user_id).run();
    }
    await db.prepare(
      'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
      "VALUES (?, 'dedicated_lost', ?, ?, 'negative', ?)",
    ).bind(player.user_id, JSON.stringify({
      customer_name: c.name, reason, rep_delta: repLoss, cooldown_days: DED?.leave_cooldown_days ?? 0,
    }), now, now).run();
    dedLostN++;
  };

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
  const upEff = ECONOMY.upgrade_effects ? await loadUpgradeEffects(db, player.user_id) : NO_EFFECTS;
  // Csapat és hálózat (a 2. korszaktól; a migráció előtt üres csapat / alap-hálózat).
  const SR = ECONOMY.staff;
  const NR = ECONOMY.network;
  let staff: StaffMember[] = SR && player.current_era >= SR.min_era ? await loadStaff(db, player.user_id) : [];
  const netOn = networkActive(NR, player.current_era);
  const net: NetworkState = netOn ? await loadNetwork(db, player.user_id) : { ...NO_NETWORK };
  let eff = combineEffects(upEff, staffEffects(SR, staff, now), netOn ? networkEffects(NR, net) : {});
  let salariesPaid = 0;
  let networkPaid = 0;
  let staffResolved = 0;
  let staffQuitN = 0;
  let staffCutN = 0;
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
  // A kapacitás csak a sima ügyfelekre vonatkozik; a dedikáltak a saját gépükön ülnek.
  let dedCustomers = (customers.results ?? []).filter((c) => isDedicatedCustomer(c.plan_tier));
  const generalNow = activeNow - dedCustomers.length;
  if (ECONOMY.server_fees && (fleet.length > 0 || staff.length > 0)) {
    const listed = fleet.reduce((a, sv) => a + Math.max(0, sv.monthly_cost_cents), 0);
    const feeSrv = serverFeeForTick(effectiveMonthlyFees(listed, eff.fee_pct), now);
    // A bér és a hálózat havidíja ugyanúgy, időarányosan (a szimulátor is így számol).
    const feeSal = serverFeeForTick(totalSalaryCents(SR, staff, now), now);
    const feeNet = netOn ? serverFeeForTick(networkMonthlyCents(NR, net), now) : 0;
    const fee = feeSrv + feeSal + feeNet;
    if (fee > 0) {
      const cashRow = await db.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ?')
        .bind(player.user_id).first<{ cash_usd_cents: number }>();
      const cashBefore = cashRow?.cash_usd_cents ?? player.cash_usd_cents;
      const res = applyServerFee(ECONOMY, cashBefore, fee);
      const paid = cashBefore - res.cash;
      salariesPaid = Math.round((paid * feeSal) / fee);
      networkPaid = Math.round((paid * feeNet) / fee);
      serverFees = paid - salariesPaid - networkPaid;
      if (paid !== 0) {
        await db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?').bind(paid, player.user_id).run();
      }
      // Tartozás-határ: előbb a legkevésbé hasznos ember megy (érthető üzenettel), aztán a DDoS-védelem, csak utána a gép.
      let handled = false;
      if (res.over_limit && SR && staff.length > 0) {
        const fleetFull = fleetUtilPct(generalNow, fleetCapacity()) >= 95;
        const i = pickLeastUseful(SR, staff, now, { fleet_full: fleetFull });
        if (i >= 0) {
          const gone = staff[i];
          await db.prepare('DELETE FROM staff WHERE id = ? AND player_id = ?').bind(gone.id, player.user_id).run();
          await db.prepare('UPDATE staff SET morale = MAX(0, morale - ?) WHERE player_id = ?').bind(SR.morale.fire_hit, player.user_id).run();
          await db.prepare(
            'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
            "VALUES (?, 'staff_cut_debt', ?, ?, 'negative', ?)",
          ).bind(player.user_id, JSON.stringify({
            name: gone.name, role: gone.role, salary_cents: staffSalaryCents(SR, gone, now), wasted: fleetFull && gone.role === 'sales',
          }), now, now).run();
          staff = staff.filter((_, k) => k !== i).map((m) => ({ ...m, morale: Math.max(0, m.morale - SR.morale.fire_hit) }));
          eff = combineEffects(upEff, staffEffects(SR, staff, now), netOn ? networkEffects(NR, net) : {});
          staffCutN = 1;
          handled = true;
        }
      }
      if (res.over_limit && !handled && netOn && net.ddos) {
        try {
          await db.prepare('UPDATE player_network SET ddos = 0, updated_at = ? WHERE player_id = ?').bind(now, player.user_id).run();
          await db.prepare(
            'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
            "VALUES (?, 'network_ddos_cancelled', '{}', ?, 'negative', ?)",
          ).bind(player.user_id, now, now).run();
          net.ddos = 0;
          eff = combineEffects(upEff, staffEffects(SR, staff, now), networkEffects(NR, net));
          handled = true;
        } catch { /* nincs még tábla */ }
      }
      if (res.over_limit && !handled) {
        const loads = assignFleetLoad(
          fleet.map((sv) => ({ ...sv, capacity: serverCapacity(sv.type, sv.capacity, eff.capacity_pct) })), generalNow, dedCustomers.length,
        );
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
          // Ha a nagy ügyfél gépét kellett eladni, az ügyfél is elmegy.
          if (isDedicatedServer(sold.type) && loads.servers[idx].load > 0 && dedCustomers.length > 0) {
            const gone = dedCustomers[dedCustomers.length - 1];
            await loseDedicated(gone, 'sold');
            dedCustomers = dedCustomers.filter((c) => c.id !== gone.id);
          }
        }
      }
    }
  }
  const capacityNow = fleetCapacity();

  // 2.2. Dedikált ügyfél (félnaponta, a csendes elégedettséggel egy ütemben): a sla_hours óránál régebbi
  //      megválaszolatlan ticket elégedettséget és hírnevet visz; leave_below_sat alatt felmond.
  const halfDayTurn = Math.floor(now / 43200) !== Math.floor(lastTicked / 43200);
  if (DED && halfDayTurn && dedCustomers.length > 0) {
    const stale = new Set(((await db.prepare(
      "SELECT DISTINCT t.customer_id AS id FROM tickets t JOIN customers c ON c.id = t.customer_id " +
      "WHERE t.player_id = ? AND c.plan_tier = ? AND c.is_active = 1 AND t.status IN ('open', 'in_progress') AND t.created_at < ?",
    ).bind(player.user_id, DEDICATED_TIER, now - DED.sla_hours * 3600).all<{ id: number }>()).results ?? []).map((r) => r.id));
    for (const c of [...dedCustomers]) {
      const breached = stale.has(c.id);
      if (breached) {
        c.satisfaction = Math.max(-100, c.satisfaction - DED.sla_sat);
        await db.prepare('UPDATE customers SET satisfaction = ? WHERE id = ?').bind(c.satisfaction, c.id).run();
        await db.prepare('UPDATE players SET reputation = MAX(0, reputation - ?) WHERE user_id = ?').bind(DED.sla_rep, player.user_id).run();
      }
      if (c.satisfaction < DED.leave_below_sat) {
        await loseDedicated(c, breached ? 'sla' : 'unhappy');
        dedCustomers = dedCustomers.filter((x) => x.id !== c.id);
      }
    }
  }
  const dedIds = new Set(dedCustomers.map((c) => c.id));

  // 2.3. Hálózat: a forgalom a sima és a nagy ügyfelekből; ha több, mint a sávszélesség, lassulnak az oldalak
  //      (félnaponta −elégedettség a sima ügyfeleknek, és több ticket a 3. lépésben).
  let slowRatio = 0;
  if (netOn && NR) {
    const rows = customers.results ?? [];
    const cnt = { hobby: 0, business: 0, dedicated: 0 };
    for (const c of rows) {
      if (isDedicatedCustomer(c.plan_tier)) { if (dedIds.has(c.id)) cnt.dedicated++; } else if (c.plan_tier === 'business') cnt.business++; else cnt.hobby++;
    }
    slowRatio = slowdownRatio(trafficUnits(NR, cnt), bandwidthUnits(NR, net));
    if (slowRatio > 0 && halfDayTurn) {
      await db.prepare(
        'UPDATE customers SET satisfaction = MAX(-100, satisfaction - ?) WHERE player_id = ? AND is_active = 1 AND plan_tier != ?',
      ).bind(NR.slowdown.sat_step, player.user_id, DEDICATED_TIER).run();
    }
  }

  // 2.4. Csapat (félnaponta): az ügyfélszolgálat megoldja a legrégebbi ticketeket a nem morcos, nem nagy
  //      ügyfelektől; aztán mindenki hangulata (túlterhelés, pénz); a túl rosszkedvű felmond, a 35 alatti szól.
  if (SR && staff.length > 0 && halfDayTurn) {
    const cap = staff.reduce((a, m) => a + supportShare(SR, m, now), 0);
    const queueRow = await db.prepare(
      "SELECT COUNT(*) AS n FROM tickets t JOIN customers c ON c.id = t.customer_id WHERE t.player_id = ? AND t.status = 'open' " +
      'AND c.is_active = 1 AND c.plan_tier != ? AND c.satisfaction >= ?',
    ).bind(player.user_id, DEDICATED_TIER, SR.support_min_sat).first<{ n: number }>();
    const queueBefore = queueRow?.n ?? 0;
    if (cap > 0 && queueBefore > 0) {
      const pick = (await db.prepare(
        "SELECT t.id, t.customer_id, c.satisfaction FROM tickets t JOIN customers c ON c.id = t.customer_id WHERE t.player_id = ? AND t.status = 'open' " +
        'AND c.is_active = 1 AND c.plan_tier != ? AND c.satisfaction >= ? ORDER BY t.created_at ASC, t.id ASC LIMIT ?',
      ).bind(player.user_id, DEDICATED_TIER, SR.support_min_sat, cap).all<{ id: number; customer_id: number; satisfaction: number }>()).results ?? [];
      const sat = new Map<number, number>();
      for (const t of pick) {
        const before = sat.get(t.customer_id) ?? t.satisfaction;
        const after = supportResolveSat(SR, before);
        sat.set(t.customer_id, after);
        await db.prepare(
          "UPDATE tickets SET status = 'resolved', resolution = 'staff', satisfaction_delta = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
        ).bind(after - before, now, t.id).run();
        staffResolved++;
      }
      for (const [cid, v] of sat) await db.prepare('UPDATE customers SET satisfaction = ? WHERE id = ?').bind(v, cid).run();
      if (staffResolved > 0) {
        // Napi egy sor a hírfolyamba (data_json.count gyűlik), ne félnaponként egy.
        const dayStart = Math.floor(now / 86400) * 86400;
        const row = await db.prepare(
          "SELECT id, data_json FROM events WHERE player_id = ? AND event_type = 'staff_work' AND spawned_at >= ? ORDER BY id DESC LIMIT 1",
        ).bind(player.user_id, dayStart).first<{ id: number; data_json: string | null }>();
        if (row) {
          let n = 0;
          try { n = Number((JSON.parse(row.data_json ?? '{}') as { count?: number }).count) || 0; } catch { /* hibás JSON */ }
          await db.prepare('UPDATE events SET data_json = ? WHERE id = ?').bind(JSON.stringify({ count: n + staffResolved }), row.id).run();
        } else {
          await db.prepare(
            'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
            "VALUES (?, 'staff_work', ?, ?, 'positive', ?)",
          ).bind(player.user_id, JSON.stringify({ count: staffResolved }), now, now).run();
        }
      }
    }
    // Hangulat
    const cashRow = await db.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ?').bind(player.user_id).first<{ cash_usd_cents: number }>();
    const cashNowM = cashRow?.cash_usd_cents ?? player.cash_usd_cents;
    const supportOver = queueBefore > SR.morale.overwork_queue_factor * Math.max(1, supportPerDay(SR, staff, now));
    const sreOver = overloadRatio(generalNow, capacityNow) > 0 || slowRatio > 0;
    const salesOver = fleetUtilPct(generalNow, capacityNow) >= 95;
    const openDrama = new Set<number>();
    try {
      const rows = (await db.prepare(
        "SELECT data_json FROM events WHERE player_id = ? AND event_type = 'staff_drama' AND resolved_at IS NULL",
      ).bind(player.user_id).all<{ data_json: string | null }>()).results ?? [];
      for (const r of rows) { try { const id = Number((JSON.parse(r.data_json ?? '{}') as { staff_id?: number }).staff_id); if (id) openDrama.add(id); } catch { /* */ } }
    } catch { /* */ }
    const kept: StaffMember[] = [];
    for (const m of staff) {
      const over = m.role === 'support' ? supportOver : m.role === 'sre' ? sreOver : salesOver;
      const morale = moraleStep(SR, m, { overworked: over, cash_cents: cashNowM });
      if (morale < SR.morale.quit_below) {
        await db.prepare('DELETE FROM staff WHERE id = ? AND player_id = ?').bind(m.id, player.user_id).run();
        await db.prepare(
          'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
          "VALUES (?, 'staff_quit', ?, ?, 'negative', ?)",
        ).bind(player.user_id, JSON.stringify({ name: m.name, role: m.role, why: cashNowM < 0 ? 'money' : over ? 'overwork' : 'mood' }), now, now).run();
        // a még nyitott drámája okafogyott
        await db.prepare(
          "UPDATE events SET resolved_at = ?, outcome = 'negative' WHERE player_id = ? AND event_type = 'staff_drama' AND resolved_at IS NULL AND data_json LIKE ?",
        ).bind(now, player.user_id, `%"staff_id":${m.id},%`).run();
        staffQuitN++;
        continue;
      }
      if (morale !== m.morale) await db.prepare('UPDATE staff SET morale = ? WHERE id = ?').bind(morale, m.id).run();
      kept.push({ ...m, morale });
      // 35 alatt szól: csapatdráma (egyszerre egy nyitott munkatársanként).
      if (morale < SR.morale.drama_below && !openDrama.has(m.id)) {
        await db.prepare('INSERT INTO events (player_id, event_type, data_json, spawned_at) VALUES (?, ?, ?, ?)')
          .bind(player.user_id, 'staff_drama', JSON.stringify({ staff_id: m.id, name: m.name, role: m.role, why: over ? 'overwork' : cashNowM < 0 ? 'money' : 'mood' }), now).run();
        openDrama.add(m.id);
      }
    }
    staff = kept;
    eff = combineEffects(upEff, staffEffects(SR, staff, now), netOn ? networkEffects(NR, net) : {});
  }

  // 3. Ticket spawn — per-active-customer roll; AI first, placeholder fallback.
  //    A fejlesztések ticket_pct-je kevesebb ticketet hoz; túlterhelésnél (több ügyfél, mint hely) több jön.
  const ovlFactor = overloadTicketFactor(ECONOMY, generalNow, capacityNow) * (NR && slowRatio > 0 ? slowdownTicketFactor(NR, slowRatio) : 1);
  if (ECONOMY.capacity_limit && ECONOMY.overload && overloadRatio(generalNow, capacityNow) > 0 && halfDayTurn) {
    // Túlterhelés: 12 óránként −sat_step elégedettség minden aktív sima ügyfélnek (lassú oldalak, kiesések).
    await db.prepare(
      'UPDATE customers SET satisfaction = MAX(-100, satisfaction - ?) WHERE player_id = ? AND is_active = 1 AND plan_tier != ?',
    ).bind(ECONOMY.overload.sat_step, player.user_id, DEDICATED_TIER).run();
  }
  for (const c of customers.results ?? []) {
    const isDed = isDedicatedCustomer(c.plan_tier);
    if (isDed && !dedIds.has(c.id)) continue; // most mondott fel
    // A dedikált ügyfél saját gépen ül (nincs túlterhelés), de ticket_factor-szor annyi ticketet hoz.
    const pTicket = isDed && DED
      ? ticketSpawnProb(ECONOMY, c.satisfaction, eff.ticket_pct, 1) * DED.ticket_factor
      : ticketSpawnProb(ECONOMY, c.satisfaction, eff.ticket_pct, ovlFactor);
    if (Math.random() >= pTicket) continue;

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
      const plLang = ((player as { preferred_lang?: string }).preferred_lang as 'en' | 'hu' | 'de' | undefined) ?? 'en';
      const placeholder = isDed
        ? getEnterpriseTicket(plLang)
        : getPlaceholderTicketForPersona(c.persona_archetype as PersonaArchetype, plLang);
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
  activeCount -= (customers.results ?? []).filter((c) => isDedicatedCustomer(c.plan_tier)).length - dedCustomers.length;
  for (const row of churnCandidates.results ?? []) {
    if (activeCount <= ECONOMY.churn_floor_customers) break;
    const dedRow = dedCustomers.find((c) => c.id === row.id);
    if (isDedicatedCustomer(customers.results?.find((c) => c.id === row.id)?.plan_tier) && !dedRow) continue; // már elment
    if (Math.random() < churnProb(ECONOMY, row.satisfaction, player.is_pro === 1, eff.churn_pct)) {
      if (dedRow) {
        // A nagy ügyfél is elmehet a 48 órás határon — ugyanúgy hírnévvel és várakozással.
        await loseDedicated(dedRow, 'sla');
        dedCustomers = dedCustomers.filter((c) => c.id !== dedRow.id);
        churned++;
        activeCount--;
        continue;
      }
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
    "FROM customers WHERE player_id = ? AND is_active = 1 AND plan_tier != 'dedicated'",
  ).bind(
    player.pricing_hobby_cents,
    player.pricing_business_cents,
    player.user_id,
  ).first<{ mrr: number }>();
  // A fejlesztések mrr_pct-je (pl. PostgreSQL-kiegészítő) ügyfelenként több bevételt hoz.
  // A dedikált ügyfél szerződéses díja fix (az azonosítójából, dedicated.ts) — a fejlesztés nem emeli.
  const dedMrr = DED ? dedCustomers.reduce((a, c) => a + dedicatedFeeCents(DED, c.id), 0) : 0;
  const newMrr = Math.round((mrrRow?.mrr ?? 0) * (ECONOMY.upgrade_effects ? 1 + eff.mrr_pct / 100 : 1)) + dedMrr;
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
      if (acquired && ECONOMY.capacity_limit && activeCount - dedCustomers.length >= capacityNow) {
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

    // 6.2. Nagy ügyfél jelentkezése a szabad dedikált gépre (saját beszerzési út: a marketing és az árak nem
    //      számítanak, a hírnév igen; egy távozás után leave_cooldown_days napig senki).
    if (DED) {
      const free = dedicatedBoxes(fleet, dedCustomers.length).free;
      if (free > 0 && player.reputation >= DED.min_reputation) {
        const lastLost = await db.prepare(
          "SELECT MAX(spawned_at) AS t FROM events WHERE player_id = ? AND event_type = 'dedicated_lost'",
        ).bind(player.user_id).first<{ t: number | null }>();
        const pArr = dedicatedArrivalProb(ECONOMY, {
          free_boxes: free, reputation: player.reputation, now, last_lost_at: lastLost?.t ?? null,
        });
        if (pArr > 0 && Math.random() < pArr) {
          const client = pickDedicatedClient();
          const ins = await db.prepare(
            'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
            'VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
          ).bind(player.user_id, client.name, client.archetype, DEDICATED_TIER, now, DED.start_sat).first<{ id: number }>();
          const fee = ins ? dedicatedFeeCents(DED, ins.id) : DED.fee_min_cents;
          await db.prepare(
            'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
            "VALUES (?, 'dedicated_signed', ?, ?, 'positive', ?)",
          ).bind(player.user_id, JSON.stringify({ customer_name: client.name, fee_cents: fee }), now, now).run();
          // Az MRR azonnal tartalmazza (különben a következő tickig hiányozna).
          await db.prepare('UPDATE players SET mrr_usd_cents = mrr_usd_cents + ? WHERE user_id = ?').bind(fee, player.user_id).run();
          dedSigned = 1;
        }
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
    const pool = eventPoolForEra(player.current_era, SR ? { has_staff: staff.length > 0 } : {});
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
      // A csapatdráma egy valódi munkatársról szól: a legrosszabb kedvűről (élő szabályokkal csak csapattal jön).
      let data: string | null = null;
      if (type === 'staff_drama' && SR && staff.length > 0) {
        const w = staff.reduce((a, m) => (m.morale < a.morale ? m : a));
        data = JSON.stringify({ staff_id: w.id, name: w.name, role: w.role, why: 'random' });
      }
      await db.prepare(
        'INSERT INTO events (player_id, event_type, data_json, spawned_at) VALUES (?, ?, ?, ?)',
      ).bind(player.user_id, type, data, now).run();
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
    dedicated_signed: dedSigned,
    dedicated_lost: dedLostN,
    salaries_cents: salariesPaid,
    network_fees_cents: networkPaid,
    staff_resolved: staffResolved,
    staff_quit: staffQuitN,
    staff_cut: staffCutN,
    network_slow: slowRatio > 0,
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
