// src/lib/game/__tests__/pro-sync.test.ts
// Hyperscaler — syncProStatus tests.
//
// PromNET-D1 mock-ja in-memory subscriptions tábla. A nav-D1 a sztenderd
// test-mock (players tábla a migration-okból).

import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { syncProStatus } from '../pro-sync';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer } from '../db';

async function createPromnetMock(): Promise<D1Database> {
  // Reuse nav test-mock for PromNET — only subscriptions table needed.
  const db = await createTestDb();
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS subscriptions (' +
    '  id TEXT PRIMARY KEY,' +
    '  user_id TEXT NOT NULL,' +
    '  plan_id TEXT NOT NULL,' +
    '  status TEXT NOT NULL,' +
    '  current_period_end INTEGER' +
    ')',
  ).run();
  return db;
}

describe('syncProStatus', () => {
  let navDB: D1Database;
  let promnetDB: D1Database;
  beforeEach(async () => {
    navDB = await createTestDb();
    promnetDB = await createPromnetMock();
    await createPlayer(navDB, { user_id: 'u-1', company_name: 'X', city: null });
  });

  it('no promnetDB → returns free, leaves player untouched', async () => {
    const r = await syncProStatus(navDB, undefined, 'u-1');
    expect(r.is_pro).toBe(0);
    expect(r.pro_until).toBeNull();
  });

  it('active subscription with non-free plan + future period_end → grants Pro', async () => {
    const future = Math.floor(Date.now() / 1000) + 30 * 86400;
    await promnetDB.prepare(
      "INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_end) " +
      "VALUES ('s1', 'u-1', 'pro_monthly', 'active', ?)",
    ).bind(future).run();
    const r = await syncProStatus(navDB, promnetDB, 'u-1');
    expect(r.is_pro).toBe(1);
    expect(r.pro_until).toBe(future);
    const p = await navDB.prepare('SELECT is_pro, pro_until FROM players WHERE user_id = ?')
      .bind('u-1').first<{ is_pro: number; pro_until: number }>();
    expect(p?.is_pro).toBe(1);
    expect(p?.pro_until).toBe(future);
  });

  it('free plan_id → not Pro', async () => {
    const future = Math.floor(Date.now() / 1000) + 30 * 86400;
    await promnetDB.prepare(
      "INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_end) " +
      "VALUES ('s2', 'u-1', 'free', 'active', ?)",
    ).bind(future).run();
    const r = await syncProStatus(navDB, promnetDB, 'u-1');
    expect(r.is_pro).toBe(0);
  });

  it('expired period_end → not Pro', async () => {
    const past = Math.floor(Date.now() / 1000) - 100;
    await promnetDB.prepare(
      "INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_end) " +
      "VALUES ('s3', 'u-1', 'pro_monthly', 'active', ?)",
    ).bind(past).run();
    const r = await syncProStatus(navDB, promnetDB, 'u-1');
    expect(r.is_pro).toBe(0);
  });

  it('inactive status → not Pro', async () => {
    const future = Math.floor(Date.now() / 1000) + 30 * 86400;
    await promnetDB.prepare(
      "INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_end) " +
      "VALUES ('s4', 'u-1', 'pro_monthly', 'cancelled', ?)",
    ).bind(future).run();
    const r = await syncProStatus(navDB, promnetDB, 'u-1');
    expect(r.is_pro).toBe(0);
  });

  it('previously-Pro player whose sub expired → demoted to free', async () => {
    await navDB.prepare(
      'UPDATE players SET is_pro = 1, pro_until = ? WHERE user_id = ?',
    ).bind(Math.floor(Date.now() / 1000) + 86400, 'u-1').run();
    // No active sub in PromNET
    const r = await syncProStatus(navDB, promnetDB, 'u-1');
    expect(r.is_pro).toBe(0);
    expect(r.pro_until).toBeNull();
    const p = await navDB.prepare('SELECT is_pro, pro_until FROM players WHERE user_id = ?')
      .bind('u-1').first<{ is_pro: number; pro_until: number | null }>();
    expect(p?.is_pro).toBe(0);
    expect(p?.pro_until).toBeNull();
  });
});
