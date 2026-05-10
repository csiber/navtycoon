// src/lib/game/__tests__/tick.test.ts
// Hyperscaler — tickPlayer + tickAllActivePlayers Vitest.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { tickPlayer } from '../tick';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, getPlayer } from '../db';
import type { WorkersAIBinding } from '../../ai/workers-ai';
import type { VectorizeBinding } from '../../ai/vectorize';

describe('tickPlayer', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('money trickle: positive MRR adds cash', async () => {
    await createPlayer(db, { user_id: 'u-1', company_name: 'X', city: null });
    await db.prepare('UPDATE players SET mrr_usd_cents = 30000 WHERE user_id = ?')
      .bind('u-1').run();
    const refreshed = await getPlayer(db, 'u-1');
    if (!refreshed) throw new Error('player not found');
    const cashBefore = refreshed.cash_usd_cents;
    const result = await tickPlayer(db, refreshed, 1715000000);
    expect(result.money_added_cents).toBeGreaterThan(0);
    const after = await db.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ?')
      .bind('u-1').first<{ cash_usd_cents: number }>();
    expect(after?.cash_usd_cents).toBe(cashBefore + result.money_added_cents);
  });

  it('zero-MRR player adds zero cash', async () => {
    const p = await createPlayer(db, { user_id: 'u-2', company_name: 'Y', city: null });
    const result = await tickPlayer(db, p, 1715000000);
    expect(result.money_added_cents).toBe(0);
  });

  it('idle customer with old open ticket can churn (probabilistic)', async () => {
    await createPlayer(db, { user_id: 'u-3', company_name: 'Z', city: null });
    const now = 1715000000;
    const cRes = await db.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
      "VALUES (?, 'Test', 'karen', 'hobby', ?, 50) RETURNING id",
    ).bind('u-3', now - 100 * 3600).first<{ id: number }>();
    if (!cRes) throw new Error('customer not created');
    await db.prepare(
      'INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) ' +
      "VALUES (?, ?, 'old', 'old', 'open', ?)",
    ).bind(cRes.id, 'u-3', now - 60 * 3600).run();

    // 30% per tick → very high probability of at least one churn in 200 tries
    for (let i = 0; i < 200; i++) {
      const player = await getPlayer(db, 'u-3');
      if (!player) throw new Error('player gone');
      await tickPlayer(db, player, now);
      const c = await db.prepare('SELECT is_active FROM customers WHERE id = ?')
        .bind(cRes.id).first<{ is_active: number }>();
      if (c?.is_active === 0) {
        return; // success
      }
    }
    throw new Error('expected churn after 200 ticks');
  });

  it('MRR recomputes from active customers', async () => {
    await createPlayer(db, { user_id: 'u-4', company_name: 'M', city: null });
    const now = 1715000000;
    // 2× hobby (500 cents) + 1× business (1500 cents) = 2500 cents
    for (let i = 0; i < 2; i++) {
      await db.prepare(
        'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
        "VALUES (?, 'C', 'newbie', 'hobby', ?, 60)",
      ).bind('u-4', now).run();
    }
    await db.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
      "VALUES (?, 'B', 'pro', 'business', ?, 50)",
    ).bind('u-4', now).run();

    const player = await getPlayer(db, 'u-4');
    if (!player) throw new Error('player gone');
    await tickPlayer(db, player, now);
    const after = await getPlayer(db, 'u-4');
    expect(after?.mrr_usd_cents).toBe(2 * 500 + 1500);
  });

  it('uses AI when env.ai + env.vectorize provided and budget allows', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-ai', company_name: 'AI Inc', city: null });
    const now = 1715000000;
    await db2.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
      "VALUES (?, 'Karen Test', 'karen', 'hobby', ?, 30)",
    ).bind('u-ai', now).run();

    const ai = {
      run: vi.fn().mockImplementation((model: string) => {
        if (model.includes('embed') || model.includes('bge')) {
          return Promise.resolve({ data: [Array(768).fill(0.1)] });
        }
        return Promise.resolve({ response: 'AI-GENERATED ANGRY MESSAGE' });
      }),
    } as unknown as WorkersAIBinding;
    const vectorize = {
      query: vi.fn().mockResolvedValue({ matches: [] }),
      upsert: vi.fn().mockResolvedValue({ count: 1 }),
    } as unknown as VectorizeBinding;

    const origRandom = Math.random;
    let calls = 0;
    Math.random = () => { calls++; return calls === 1 ? 0.001 : 0.5; };

    try {
      const player = await getPlayer(db2, 'u-ai');
      if (!player) throw new Error('player gone');
      const result = await tickPlayer(db2, player, now, { ai, vectorize });
      expect(result.tickets_spawned).toBe(1);
      expect(result.ai_tickets).toBe(1);
      const tickets = await db2.prepare('SELECT full_text FROM tickets WHERE player_id = ?')
        .bind('u-ai').all();
      expect((tickets.results?.[0] as { full_text: string }).full_text).toBe('AI-GENERATED ANGRY MESSAGE');
    } finally {
      Math.random = origRandom;
    }
  });
});
