// Hyperscaler — D1 CRUD-helpers TDD-tesztcsomag.
// Per function: round-trip + per-user-isolation (ahol applicable) + missing → null/false.
//
// Forrás: spec §12 (8 tábla) + db.ts (22 függvény).

import { describe, it, expect, beforeEach } from 'vitest';
import * as db from '../db';
import type { D1Like } from '../db';
import { createTestDb } from '../../../../test-utils/d1-mock';

async function seedPlayer(d: D1Like, userId: string, companyName = 'Test Inc.') {
  return db.createPlayer(d, { user_id: userId, company_name: companyName, city: 'Budapest' });
}

describe('game/db players', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });

  it('createPlayer + getPlayer round-trip with defaults', async () => {
    const p = await db.createPlayer(d, { user_id: 'u-1', company_name: 'Test Inc.', city: 'Budapest' });
    expect(p.user_id).toBe('u-1');
    expect(p.cash_usd_cents).toBe(100000);
    expect(p.current_era).toBe(1);
    expect(p.reputation).toBe(50);
    expect(p.is_pro).toBe(0);
    const fetched = await db.getPlayer(d, 'u-1');
    expect(fetched?.company_name).toBe('Test Inc.');
    expect(fetched?.city).toBe('Budapest');
  });

  it('getPlayer returns null for missing', async () => {
    expect(await db.getPlayer(d, 'u-nope')).toBeNull();
  });

  it('updatePlayer applies patch', async () => {
    await seedPlayer(d, 'u-1');
    await db.updatePlayer(d, 'u-1', { cash_usd_cents: 50000, reputation: 70 });
    const p = await db.getPlayer(d, 'u-1');
    expect(p?.cash_usd_cents).toBe(50000);
    expect(p?.reputation).toBe(70);
  });

  it('updatePlayer with empty patch returns row unchanged', async () => {
    await seedPlayer(d, 'u-1');
    const r = await db.updatePlayer(d, 'u-1', {});
    expect(r?.user_id).toBe('u-1');
  });

  it('updatePlayer on missing user returns null', async () => {
    const r = await db.updatePlayer(d, 'u-nope', { cash_usd_cents: 1 });
    expect(r).toBeNull();
  });
});

describe('game/db customers', () => {
  let d: D1Like;
  beforeEach(async () => {
    d = (await createTestDb()) as unknown as D1Like;
    await seedPlayer(d, 'u-1');
    await seedPlayer(d, 'u-2');
  });

  it('createCustomer + getCustomer round-trip', async () => {
    const c = await db.createCustomer(d, {
      player_id: 'u-1', name: 'Karen K.',
      persona_archetype: 'karen', plan_tier: 'hobby',
    });
    expect(c.id).toBeGreaterThan(0);
    expect(c.satisfaction).toBe(50);
    expect(c.is_active).toBe(1);
    const fetched = await db.getCustomer(d, c.id, 'u-1');
    expect(fetched?.name).toBe('Karen K.');
  });

  it('getCustomer enforces per-user isolation', async () => {
    const c = await db.createCustomer(d, {
      player_id: 'u-1', name: 'A',
      persona_archetype: 'newbie', plan_tier: 'hobby',
    });
    expect(await db.getCustomer(d, c.id, 'u-2')).toBeNull();
  });

  it('listCustomers per-user isolation + activeOnly default', async () => {
    await db.createCustomer(d, { player_id: 'u-1', name: 'A', persona_archetype: 'pro', plan_tier: 'business' });
    await db.createCustomer(d, { player_id: 'u-1', name: 'B', persona_archetype: 'newbie', plan_tier: 'hobby' });
    await db.createCustomer(d, { player_id: 'u-2', name: 'C', persona_archetype: 'karen', plan_tier: 'vps' });
    const u1 = await db.listCustomers(d, 'u-1');
    expect(u1.length).toBe(2);
    expect(u1.every((c) => c.player_id === 'u-1')).toBe(true);
  });

  it('listCustomers with activeOnly=false includes inactive', async () => {
    const c = await db.createCustomer(d, { player_id: 'u-1', name: 'A', persona_archetype: 'pro', plan_tier: 'business' });
    await db.setCustomerInactive(d, c.id);
    const active = await db.listCustomers(d, 'u-1', true);
    const all = await db.listCustomers(d, 'u-1', false);
    expect(active.length).toBe(0);
    expect(all.length).toBe(1);
  });

  it('updateCustomer applies patch with player_id ownership', async () => {
    const c = await db.createCustomer(d, { player_id: 'u-1', name: 'A', persona_archetype: 'pro', plan_tier: 'business' });
    const r = await db.updateCustomer(d, c.id, 'u-1', { satisfaction: 90, churn_risk: 5 });
    expect(r?.satisfaction).toBe(90);
    expect(r?.churn_risk).toBe(5);
    // wrong owner → null
    const wrong = await db.updateCustomer(d, c.id, 'u-2', { satisfaction: 1 });
    expect(wrong).toBeNull();
  });

  it('setCustomerInactive flips is_active=0 idempotently', async () => {
    const c = await db.createCustomer(d, { player_id: 'u-1', name: 'A', persona_archetype: 'pro', plan_tier: 'business' });
    expect(await db.setCustomerInactive(d, c.id)).toBe(true);
    const fetched = await db.getCustomer(d, c.id, 'u-1');
    expect(fetched?.is_active).toBe(0);
    // already inactive → false
    expect(await db.setCustomerInactive(d, c.id)).toBe(false);
    expect(await db.setCustomerInactive(d, 99999)).toBe(false);
  });
});

describe('game/db tickets', () => {
  let d: D1Like;
  let custId: number;
  beforeEach(async () => {
    d = (await createTestDb()) as unknown as D1Like;
    await seedPlayer(d, 'u-1');
    await seedPlayer(d, 'u-2');
    const c = await db.createCustomer(d, {
      player_id: 'u-1', name: 'Karen', persona_archetype: 'karen', plan_tier: 'hobby',
    });
    custId = c.id;
  });

  it('createTicket + listTickets round-trip with default status=open', async () => {
    const t = await db.createTicket(d, {
      customer_id: custId, player_id: 'u-1',
      summary: 'help', full_text: 'site is down',
    });
    expect(t.status).toBe('open');
    const list = await db.listTickets(d, 'u-1');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(t.id);
  });

  it('listTickets per-user isolation', async () => {
    await db.createTicket(d, { customer_id: custId, player_id: 'u-1', summary: 's', full_text: 'f' });
    expect((await db.listTickets(d, 'u-2')).length).toBe(0);
  });

  it('listTickets filters by status', async () => {
    const t1 = await db.createTicket(d, { customer_id: custId, player_id: 'u-1', summary: 's1', full_text: 'f1' });
    await db.createTicket(d, { customer_id: custId, player_id: 'u-1', summary: 's2', full_text: 'f2' });
    await db.closeTicket(d, t1.id, 'fixed', 10);
    const open = await db.listTickets(d, 'u-1', 'open');
    const resolved = await db.listTickets(d, 'u-1', 'resolved');
    expect(open.length).toBe(1);
    expect(resolved.length).toBe(1);
  });

  it('updateTicket applies patch', async () => {
    const t = await db.createTicket(d, { customer_id: custId, player_id: 'u-1', summary: 's', full_text: 'f' });
    const r = await db.updateTicket(d, t.id, { status: 'in_progress', ai_quality_rating: 4 });
    expect(r?.status).toBe('in_progress');
    expect(r?.ai_quality_rating).toBe(4);
  });

  it('updateTicket on missing returns null', async () => {
    expect(await db.updateTicket(d, 99999, { status: 'in_progress' })).toBeNull();
  });

  it('closeTicket sets resolved + delta + timestamp', async () => {
    const t = await db.createTicket(d, { customer_id: custId, player_id: 'u-1', summary: 's', full_text: 'f' });
    const r = await db.closeTicket(d, t.id, 'restarted apache', 8);
    expect(r?.status).toBe('resolved');
    expect(r?.resolution).toBe('restarted apache');
    expect(r?.satisfaction_delta).toBe(8);
    expect(r?.resolved_at).toBeGreaterThan(0);
  });

  it('closeTicket on missing returns null', async () => {
    expect(await db.closeTicket(d, 99999, 'x', 0)).toBeNull();
  });
});

describe('game/db servers', () => {
  let d: D1Like;
  beforeEach(async () => {
    d = (await createTestDb()) as unknown as D1Like;
    await seedPlayer(d, 'u-1');
    await seedPlayer(d, 'u-2');
  });

  it('createServer + listServers round-trip', async () => {
    const s = await db.createServer(d, {
      player_id: 'u-1', era: 1, type: 'lamp_box',
      capacity: 100, monthly_cost_cents: 5000,
    });
    expect(s.upgrades_json).toBe('[]');
    expect(s.current_load).toBe(0);
    const list = await db.listServers(d, 'u-1');
    expect(list.length).toBe(1);
    expect(list[0].type).toBe('lamp_box');
  });

  it('listServers per-user isolation', async () => {
    await db.createServer(d, { player_id: 'u-1', era: 1, type: 'lamp_box', capacity: 50, monthly_cost_cents: 1000 });
    expect((await db.listServers(d, 'u-2')).length).toBe(0);
  });

  it('getTotalCapacity sums per-user', async () => {
    await db.createServer(d, { player_id: 'u-1', era: 1, type: 'lamp_box', capacity: 50, monthly_cost_cents: 1000 });
    await db.createServer(d, { player_id: 'u-1', era: 1, type: 'rack_unit', capacity: 200, monthly_cost_cents: 8000 });
    await db.createServer(d, { player_id: 'u-2', era: 2, type: 'vps_node', capacity: 9999, monthly_cost_cents: 1 });
    expect(await db.getTotalCapacity(d, 'u-1')).toBe(250);
    expect(await db.getTotalCapacity(d, 'u-empty')).toBe(0);
  });

  it('getTotalLoad sums per-user', async () => {
    const s1 = await db.createServer(d, { player_id: 'u-1', era: 1, type: 'lamp_box', capacity: 100, monthly_cost_cents: 500 });
    const s2 = await db.createServer(d, { player_id: 'u-1', era: 1, type: 'rack_unit', capacity: 100, monthly_cost_cents: 500 });
    // setting load directly via update (no API for that, but DB-level for test):
    await (d as unknown as { prepare(q: string): { bind(...a: unknown[]): { run(): Promise<unknown> } } })
      .prepare('UPDATE servers SET current_load = ? WHERE id = ?').bind(30, s1.id).run();
    await (d as unknown as { prepare(q: string): { bind(...a: unknown[]): { run(): Promise<unknown> } } })
      .prepare('UPDATE servers SET current_load = ? WHERE id = ?').bind(45, s2.id).run();
    expect(await db.getTotalLoad(d, 'u-1')).toBe(75);
    expect(await db.getTotalLoad(d, 'u-empty')).toBe(0);
  });
});

describe('game/db upgrades', () => {
  let d: D1Like;
  beforeEach(async () => {
    d = (await createTestDb()) as unknown as D1Like;
    await seedPlayer(d, 'u-1');
    await seedPlayer(d, 'u-2');
  });

  it('addUpgrade + hasUpgrade + listUpgrades round-trip', async () => {
    await db.addUpgrade(d, 'u-1', 'ssd_storage');
    expect(await db.hasUpgrade(d, 'u-1', 'ssd_storage')).toBe(true);
    expect(await db.hasUpgrade(d, 'u-1', 'cdn')).toBe(false);
    const list = await db.listUpgrades(d, 'u-1');
    expect(list.length).toBe(1);
    expect(list[0].upgrade_id).toBe('ssd_storage');
  });

  it('addUpgrade is idempotent (no duplicate row)', async () => {
    await db.addUpgrade(d, 'u-1', 'ssd_storage');
    await db.addUpgrade(d, 'u-1', 'ssd_storage');
    const list = await db.listUpgrades(d, 'u-1');
    expect(list.length).toBe(1);
  });

  it('per-user isolation for upgrades', async () => {
    await db.addUpgrade(d, 'u-1', 'ssd_storage');
    expect(await db.hasUpgrade(d, 'u-2', 'ssd_storage')).toBe(false);
    expect((await db.listUpgrades(d, 'u-2')).length).toBe(0);
  });
});

describe('game/db events', () => {
  let d: D1Like;
  beforeEach(async () => {
    d = (await createTestDb()) as unknown as D1Like;
    await seedPlayer(d, 'u-1');
    await seedPlayer(d, 'u-2');
  });

  it('spawnEvent + listRecentEvents round-trip', async () => {
    const e = await db.spawnEvent(d, 'u-1', 'ddos_attempt', JSON.stringify({ size: 'small' }));
    expect(e.event_type).toBe('ddos_attempt');
    expect(e.outcome).toBeNull();
    const list = await db.listRecentEvents(d, 'u-1', 0);
    expect(list.length).toBe(1);
  });

  it('listRecentEvents respects sinceTs and per-user isolation', async () => {
    await db.spawnEvent(d, 'u-1', 'viral_blog');
    await db.spawnEvent(d, 'u-2', 'ddos_attempt');
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect((await db.listRecentEvents(d, 'u-1', future)).length).toBe(0);
    expect((await db.listRecentEvents(d, 'u-1', 0)).length).toBe(1);
    expect((await db.listRecentEvents(d, 'u-2', 0)).length).toBe(1);
  });

  it('resolveEvent sets outcome + resolved_at', async () => {
    const e = await db.spawnEvent(d, 'u-1', 'electricity_spike');
    const r = await db.resolveEvent(d, e.id, 'negative');
    expect(r?.outcome).toBe('negative');
    expect(r?.resolved_at).toBeGreaterThan(0);
  });

  it('resolveEvent on missing returns null', async () => {
    expect(await db.resolveEvent(d, 99999, 'positive')).toBeNull();
  });
});
