// src/lib/game/__tests__/dedicated.test.ts
// Hyperscales — a dedikált gép és a nagy ügyfél (2026-11-12, dedikált-kör): tiszta függvények + a valódi tick.
import { describe, it, expect, afterEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { tickPlayer } from '../tick';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, getPlayer } from '../db';
import { ECONOMY, BALANCE_V2_RULES, TICKS_PER_DAY } from '../economy';
import {
  dedicatedFeeCents, dedicatedArrivalProb, dedicatedCloseDelta, dedicatedReplyDelta, dedicatedBoxes, feeSteps,
} from '../dedicated';
import { assignFleetLoad } from '../capacity';
import { serverCapacity, SERVER_SPECS } from '../server-types';
import { localizePlaceholderTicket, ENTERPRISE_TICKET_TABLES } from '../customer-spawn';

const D = ECONOMY.dedicated!;
const origRandom = Math.random;
afterEach(() => { Math.random = origRandom; });

describe('dedicated rules (pure)', () => {
  it('fee: deterministic per customer id, inside the band, all steps used', () => {
    const seen = new Set<number>();
    for (let id = 1; id <= 300; id++) {
      const f = dedicatedFeeCents(D, id);
      expect(f).toBe(dedicatedFeeCents(D, id));
      expect(f).toBeGreaterThanOrEqual(D.fee_min_cents);
      expect(f).toBeLessThanOrEqual(D.fee_max_cents);
      expect((f - D.fee_min_cents) % D.fee_step_cents).toBe(0);
      seen.add(f);
    }
    expect(seen.size).toBe(feeSteps(D));
  });

  it('arrival: only with a free box, enough reputation, and not during the cooldown after a loss', () => {
    const now = 100 * 86400;
    expect(dedicatedArrivalProb(ECONOMY, { free_boxes: 0, reputation: 100 })).toBe(0);
    expect(dedicatedArrivalProb(ECONOMY, { free_boxes: 1, reputation: D.min_reputation - 1 })).toBe(0);
    expect(dedicatedArrivalProb(ECONOMY, { free_boxes: 1, reputation: D.min_reputation })).toBeCloseTo(D.arrival_per_day / TICKS_PER_DAY);
    expect(dedicatedArrivalProb(ECONOMY, { free_boxes: 1, reputation: 90, now, last_lost_at: now - 86400 })).toBe(0);
    expect(dedicatedArrivalProb(ECONOMY, { free_boxes: 1, reputation: 90, now, last_lost_at: now - (D.leave_cooldown_days + 1) * 86400 })).toBeGreaterThan(0);
    // a régi szabályokkal nincs nagy ügyfél
    expect(dedicatedArrivalProb(BALANCE_V2_RULES, { free_boxes: 1, reputation: 100 })).toBe(0);
  });

  it('high expectations: a good reply is worth less, a bad one hurts more, closing only helps when already happy', () => {
    expect(dedicatedReplyDelta(D, 8)).toBeLessThan(8);
    expect(dedicatedReplyDelta(D, -8)).toBeLessThan(-8);
    expect(dedicatedCloseDelta(D, 80)).toBeGreaterThan(0);
    expect(dedicatedCloseDelta(D, 55)).toBeLessThan(0);
    expect(dedicatedCloseDelta(D, 20)).toBeLessThanOrEqual(-30);
  });

  it('the dedicated box gives no slots to normal customers; its one slot is for the big client', () => {
    expect(serverCapacity('dedicated_box', 1)).toBe(0);
    expect(serverCapacity('dedicated_box', 1, 100)).toBe(0); // a kapacitás-fejlesztés sem bővíti
    const servers = [
      { id: 1, type: 'lamp_box', capacity: 15 },
      { id: 2, type: 'dedicated_box', capacity: 0 },
      { id: 3, type: 'lamp_box', capacity: 15 },
    ];
    const l = assignFleetLoad(servers, 20, 1);
    expect(l.servers.map((s) => s.load)).toEqual([15, 1, 5]);
    expect(l.servers[1].dedicated).toBe(true);
    expect(l.totalCapacity).toBe(30);
    expect(l.overflow).toBe(0);
    expect(dedicatedBoxes(servers, 0)).toEqual({ boxes: 1, free: 1 });
    expect(dedicatedBoxes(servers, 1)).toEqual({ boxes: 1, free: 0 });
  });

  it('enterprise tickets exist in all three languages and stored English ones are translated', () => {
    expect(ENTERPRISE_TICKET_TABLES.hu.length).toBe(ENTERPRISE_TICKET_TABLES.en.length);
    expect(ENTERPRISE_TICKET_TABLES.de.length).toBe(ENTERPRISE_TICKET_TABLES.en.length);
    expect(localizePlaceholderTicket(ENTERPRISE_TICKET_TABLES.en[0], 'hu')).toBe(ENTERPRISE_TICKET_TABLES.hu[0]);
  });

  it('catalog spec: era 2, cheaper than before, payback 1.5–4 months at the mid fee', () => {
    const box = SERVER_SPECS.dedicated_box;
    expect(box.era).toBe(2);
    const mid = (D.fee_min_cents + D.fee_max_cents) / 2;
    const months = box.purchase_cost_cents / (mid - box.monthly_cost_cents);
    expect(months).toBeGreaterThanOrEqual(1.5); // 2026-11-12 este: $350 → ~1,8 hónap
    expect(months).toBeLessThanOrEqual(4);
  });
});

async function setup(uid: string, rep: number): Promise<D1Database> {
  const d = await createTestDb();
  await createPlayer(d, { user_id: uid, company_name: 'Ded', city: null });
  await d.prepare(
    "INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at) VALUES (?, 1, 'lamp_box', 15, 0, 0, 0)",
  ).bind(uid).run();
  await d.prepare(
    "INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at) VALUES (?, 2, 'dedicated_box', 1, 0, ?, 1)",
  ).bind(uid, SERVER_SPECS.dedicated_box.monthly_cost_cents).run();
  await d.prepare('UPDATE players SET current_era = 2, reputation = ?, cash_usd_cents = 100000 WHERE user_id = ?').bind(rep, uid).run();
  return d;
}

describe('dedicated client in the real tick', { timeout: 30_000 }, () => {
  it('a big client signs for the free box (own path), pays its fee in MRR, and normal customers cannot take the slot', async () => {
    const d = await setup('u-ded', 80);
    const now = 1715000000;
    for (let k = 0; k < 15; k++) {
      await d.prepare(
        "INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES ('u-ded', 'C', 'loyalist', 'hobby', ?, 80)",
      ).bind(now - 3600).run();
    }
    await d.prepare('UPDATE players SET marketing_seo_pct = 100, marketing_ppc_pct = 0, marketing_referral_pct = 0 WHERE user_id = ?').bind('u-ded').run();
    Math.random = () => 0.0000001;
    const p = await getPlayer(d, 'u-ded');
    const r = await tickPlayer(d, p!, now);
    Math.random = origRandom;
    expect(r.customers_acquired).toBe(0);
    expect(r.customers_lost_capacity).toBe(1); // a lamp tele, a dedikált gép nem sima hely
    expect(r.dedicated_signed).toBe(1);
    const c = await d.prepare("SELECT id, plan_tier, satisfaction FROM customers WHERE player_id = 'u-ded' AND plan_tier = 'dedicated'")
      .first<{ id: number; plan_tier: string; satisfaction: number }>();
    expect(c?.satisfaction).toBe(D.start_sat);
    const fee = dedicatedFeeCents(D, c!.id);
    const ev = await d.prepare("SELECT data_json FROM events WHERE player_id = 'u-ded' AND event_type = 'dedicated_signed'").first<{ data_json: string }>();
    expect(JSON.parse(ev!.data_json).fee_cents).toBe(fee);
    // a következő tick az MRR-t a díjjal együtt számolja (15 hobbi + a nagy ügyfél)
    const p2 = await getPlayer(d, 'u-ded');
    Math.random = () => 0.99;
    await tickPlayer(d, p2!, now + 300);
    const after = await getPlayer(d, 'u-ded');
    expect(after!.mrr_usd_cents).toBe(15 * after!.pricing_hobby_cents + fee);
  });

  it('no client below the reputation threshold, and none without a free box', async () => {
    const d = await setup('u-low', D.min_reputation - 5);
    Math.random = () => 0.0000001;
    const r = await tickPlayer(d, (await getPlayer(d, 'u-low'))!, 1715000000);
    expect(r.dedicated_signed).toBe(0);
  });

  it('an unhappy big client cancels: reputation loss, event, and no new client during the cooldown', async () => {
    const d = await setup('u-gone', 80);
    const now = 1715000000;
    await d.prepare(
      "INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES ('u-gone', 'Northwind Logistics', 'pro', 'dedicated', ?, ?)",
    ).bind(now - 5 * 86400, D.leave_below_sat - 5).run(); // (a csendes elégedettség +1-et ad előtte)
    Math.random = () => 0.99; // semmi más ne történjen
    const r = await tickPlayer(d, (await getPlayer(d, 'u-gone'))!, now);
    expect(r.dedicated_lost).toBe(1);
    const p = await getPlayer(d, 'u-gone');
    expect(p!.reputation).toBe(80 - D.leave_rep);
    const active = await d.prepare("SELECT COUNT(*) AS n FROM customers WHERE player_id = 'u-gone' AND plan_tier = 'dedicated' AND is_active = 1").first<{ n: number }>();
    expect(active?.n).toBe(0);
    const ev = await d.prepare("SELECT data_json FROM events WHERE player_id = 'u-gone' AND event_type = 'dedicated_lost'").first<{ data_json: string }>();
    expect(JSON.parse(ev!.data_json).customer_name).toBe('Northwind Logistics');
    // a rossz referencia miatt a következő napokban nem jön új, hiába szabad a gép
    Math.random = () => 0.0000001;
    const r2 = await tickPlayer(d, p!, now + 3 * 86400);
    expect(r2.dedicated_signed).toBe(0);
  });

  it('era advancement ignores the big client fee, the displayed MRR keeps it', async () => {
    const d = await setup('u-era', 80);
    const now = 1715000000;
    // 3. korszak feltételei: MRR $1000, 3 gép, 30 nap, hírnév 70 — a nagy ügyfél nélkül csak ~$900 MRR van.
    await d.prepare("INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at) VALUES ('u-era', 2, 'lamp_box', 15, 0, 0, 2)").run();
    for (let k = 0; k < 60; k++) {
      await d.prepare(
        "INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES ('u-era', 'C', 'loyalist', 'business', ?, 80)",
      ).bind(now - 3600).run();
    }
    await d.prepare(
      "INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES ('u-era', 'Big', 'pro', 'dedicated', ?, 80)",
    ).bind(now - 3600).run();
    await d.prepare('UPDATE players SET founded_at = ?, pricing_business_cents = 1500 WHERE user_id = ?').bind(now - 40 * 86400, 'u-era').run();
    Math.random = () => 0.99;
    const r = await tickPlayer(d, (await getPlayer(d, 'u-era'))!, now);
    const p = await getPlayer(d, 'u-era');
    expect(p!.mrr_usd_cents).toBeGreaterThan(100000); // 60 × $15 + a nagy ügyfél díja
    expect(r.era_advanced_to).toBeNull();
    expect(p!.current_era).toBe(2);
  });

  it('an SLA breach (unanswered ticket > sla_hours) costs satisfaction and reputation every half day', async () => {
    const d = await setup('u-sla', 80);
    const now = 1715000000;
    const ins = await d.prepare(
      "INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES ('u-sla', 'Atlas Ticketing', 'pro', 'dedicated', ?, 60) RETURNING id",
    ).bind(now - 5 * 86400).first<{ id: number }>();
    await d.prepare(
      "INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) VALUES (?, 'u-sla', 's', 'f', 'open', ?)",
    ).bind(ins!.id, now - (D.sla_hours + 1) * 3600).run();
    Math.random = () => 0.99;
    await tickPlayer(d, (await getPlayer(d, 'u-sla'))!, now);
    const c = await d.prepare('SELECT satisfaction FROM customers WHERE id = ?').bind(ins!.id).first<{ satisfaction: number }>();
    expect(c?.satisfaction).toBe(60 - D.sla_sat);
    expect((await getPlayer(d, 'u-sla'))!.reputation).toBe(80 - D.sla_rep);
  });
});
