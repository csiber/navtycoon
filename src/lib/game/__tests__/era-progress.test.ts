// src/lib/game/__tests__/era-progress.test.ts
// Hyperscales — era-progression tests.

import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { meetsNextEra, nextEraTarget, maybeAdvanceEra } from '../era-progress';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, getPlayer } from '../db';

describe('era-progress pure helpers', () => {
  it('nextEraTarget returns era 2 for current_era 1', () => {
    const t = nextEraTarget(1);
    expect(t?.era).toBe(2);
  });
  it('nextEraTarget returns null at max era', () => {
    expect(nextEraTarget(4)).toBeNull();
  });
  it('meetsNextEra returns null if any req unmet', () => {
    const r = meetsNextEra({
      current_era: 1,
      mrr_usd_cents: 9999, // just below 10000
      server_count: 1,
      days_alive: 7,
      reputation: 60,
    });
    expect(r).toBeNull();
  });
  it('meetsNextEra returns target when all reqs met', () => {
    const r = meetsNextEra({
      current_era: 1,
      mrr_usd_cents: 10000,
      server_count: 1,
      days_alive: 7,
      reputation: 60,
    });
    expect(r?.era).toBe(2);
  });
});

describe('maybeAdvanceEra DB', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('does not advance when reqs unmet', async () => {
    await createPlayer(db, { user_id: 'u-low', company_name: 'L', city: null });
    const player = await getPlayer(db, 'u-low');
    if (!player) throw new Error('player gone');
    const newEra = await maybeAdvanceEra(db, player, 1715000000);
    expect(newEra).toBeNull();
    const refreshed = await getPlayer(db, 'u-low');
    expect(refreshed?.current_era).toBe(1);
  });

  it('advances to era 2 + spawns era_unlock event when reqs met', async () => {
    await createPlayer(db, { user_id: 'u-ok', company_name: 'OK', city: null });
    const now = 1715000000;
    // Era-2 reqs: $100 MRR, 1 server, 7 days, 60 rep
    await db.prepare(
      'UPDATE players SET mrr_usd_cents = 15000, reputation = 65, founded_at = ? WHERE user_id = ?',
    ).bind(now - 10 * 86400, 'u-ok').run();
    await db.prepare(
      "INSERT INTO servers (player_id, era, type, capacity, monthly_cost_cents, purchased_at) " +
      "VALUES ('u-ok', 1, 'lamp_box', 5, 100, ?)",
    ).bind(now - 8 * 86400).run();

    const player = await getPlayer(db, 'u-ok');
    if (!player) throw new Error('player gone');
    const newEra = await maybeAdvanceEra(db, player, now);
    expect(newEra).toBe(2);

    const refreshed = await getPlayer(db, 'u-ok');
    expect(refreshed?.current_era).toBe(2);

    // Era-unlock event spawned
    const evRow = await db.prepare(
      "SELECT event_type, outcome, data_json FROM events WHERE player_id = ? AND event_type = 'era_unlock'",
    ).bind('u-ok').first<{ event_type: string; outcome: string; data_json: string }>();
    expect(evRow?.event_type).toBe('era_unlock');
    expect(evRow?.outcome).toBe('positive');
    const data = JSON.parse(evRow?.data_json ?? '{}');
    expect(data.to_era).toBe(2);
  });

  it('idempotent — second call after advance does nothing', async () => {
    await createPlayer(db, { user_id: 'u-idem', company_name: 'I', city: null });
    const now = 1715000000;
    await db.prepare(
      'UPDATE players SET current_era = 2, mrr_usd_cents = 15000, reputation = 65, founded_at = ? WHERE user_id = ?',
    ).bind(now - 10 * 86400, 'u-idem').run();
    await db.prepare(
      "INSERT INTO servers (player_id, era, type, capacity, monthly_cost_cents, purchased_at) " +
      "VALUES ('u-idem', 1, 'lamp_box', 5, 100, ?)",
    ).bind(now - 8 * 86400).run();

    const player = await getPlayer(db, 'u-idem');
    if (!player) throw new Error('player gone');
    const newEra = await maybeAdvanceEra(db, player, now);
    // Era-3 reqs are MUCH higher than current state, so should NOT advance further
    expect(newEra).toBeNull();
    const refreshed = await getPlayer(db, 'u-idem');
    expect(refreshed?.current_era).toBe(2);
  });
});

// 2026-11-11: eraProgress — az egyetlen forrás, amit a vezérlő, az oldalsáv, a csapat- és hálózat-lap mutat.
import { eraProgress, daysAlive, ERA_REQUIREMENTS } from '../era-progress';

describe('eraProgress (single source of truth for the UI)', () => {
  const base = { current_era: 1 as const, mrr_usd_cents: 1500, server_count: 1, days_alive: 0, reputation: 50 };
  it('lists exactly the four meetsNextEra requirements with real targets', () => {
    const p = eraProgress(base)!;
    expect(p.target_era).toBe(2);
    expect(p.reqs.map((r) => r.key)).toEqual(['mrr', 'servers', 'days', 'reputation']);
    const t = ERA_REQUIREMENTS[0];
    expect(p.reqs.map((r) => r.needed)).toEqual([t.min_mrr_cents / 100, t.min_servers, t.min_days_alive, t.min_reputation]);
  });
  it('checkmark only when the requirement is really met', () => {
    const p = eraProgress(base)!;
    const done = Object.fromEntries(p.reqs.map((r) => [r.key, r.done]));
    expect(done).toEqual({ mrr: false, servers: true, days: false, reputation: false });
    expect(p.met_count).toBe(1);
  });
  it('MRR checkmark uses cents (99.99 is not 100)', () => {
    const p = eraProgress({ ...base, mrr_usd_cents: 9999 })!;
    expect(p.reqs[0].current).toBe(99);
    expect(p.reqs[0].done).toBe(false);
  });
  it('all met ⇔ meetsNextEra advances', () => {
    const input = { current_era: 1 as const, mrr_usd_cents: 10000, server_count: 1, days_alive: 7, reputation: 60 };
    expect(eraProgress(input)!.met_count).toBe(4);
    expect(meetsNextEra(input)?.era).toBe(2);
  });
  it('null at max era', () => {
    expect(eraProgress({ ...base, current_era: 4 })).toBeNull();
  });
  it('daysAlive counts whole real days', () => {
    expect(daysAlive(1000, 1000 + 86399)).toBe(0);
    expect(daysAlive(1000, 1000 + 86400)).toBe(1);
  });
});
