// src/lib/game/__tests__/tick.test.ts
// Hyperscales — tickPlayer + tickAllActivePlayers Vitest.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { tickPlayer } from '../tick';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, getPlayer } from '../db';
import { ECONOMY } from '../economy';
import { PPC_FULL_COST_PER_TICK_CENTS } from '../tick';
import type { WorkersAIBinding } from '../../ai/workers-ai';
import type { VectorizeBinding } from '../../ai/vectorize';

// A lemorzsolódás 3 törzsügyfél alá nem visz (ECONOMY.churn_floor_customers): a churn-tesztekhez
// kell ennyi ticket nélküli „töltelék" ügyfél, hogy a vizsgált ügyfél elmehessen.
async function addCoreCustomers(d: D1Database, uid: string, now: number): Promise<void> {
  for (let k = 0; k < ECONOMY.churn_floor_customers; k++) {
    await d.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
      "VALUES (?, 'Core', 'loyalist', 'hobby', ?, 80)",
    ).bind(uid, now - 200 * 3600).run();
  }
}

describe('tickPlayer', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('money trickle: positive MRR adds cash', async () => {
    await createPlayer(db, { user_id: 'u-1', company_name: 'X', city: null });
    await db.prepare(
      'UPDATE players SET mrr_usd_cents = 30000, marketing_seo_pct = 0, ' +
      'marketing_ppc_pct = 0, marketing_referral_pct = 0 WHERE user_id = ?',
    ).bind('u-1').run();
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
    await addCoreCustomers(db, 'u-3', now);

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

  it('marketing-mix drives customer-acquisition (high marketing → eventual spawn)', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-mkt', company_name: 'M', city: null });
    // Maximal marketing-mix: SEO 100, PPC 0 (free), referral 0
    await db2.prepare(
      'UPDATE players SET marketing_seo_pct = 100, marketing_ppc_pct = 0, marketing_referral_pct = 0, reputation = 50 WHERE user_id = ?',
    ).bind('u-mkt').run();
    const now = 1715000000;

    // Force-random: every other tick passes the acquisition-roll
    const origRandom = Math.random;
    let calls = 0;
    Math.random = () => { calls++; return calls % 3 === 0 ? 0.001 : 0.999; };
    try {
      let acquired = 0;
      for (let i = 0; i < 30; i++) {
        const player = await getPlayer(db2, 'u-mkt');
        if (!player) throw new Error('player gone');
        const r = await tickPlayer(db2, player, now);
        acquired += r.customers_acquired;
        if (acquired > 0) break;
      }
      expect(acquired).toBeGreaterThan(0);
    } finally {
      Math.random = origRandom;
    }
  }, 10000);

  it('PPC channel deducts cash when affordable', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-ppc', company_name: 'P', city: null });
    await db2.prepare(
      'UPDATE players SET marketing_seo_pct = 0, marketing_ppc_pct = 100, marketing_referral_pct = 0, ' +
      'reputation = 50, cash_usd_cents = 1000000 WHERE user_id = ?',
    ).bind('u-ppc').run();
    const player = await getPlayer(db2, 'u-ppc');
    if (!player) throw new Error('player gone');
    const r = await tickPlayer(db2, player, 1715000000);
    // $10k-nál a költségkeret bőven fedezi: a teljes névleges PPC-költség megy (× 100/100)
    expect(r.marketing_spent_cents).toBe(PPC_FULL_COST_PER_TICK_CENTS);
    expect(r.marketing_throttled).toBe(false);
    const after = await db2.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ?')
      .bind('u-ppc').first<{ cash_usd_cents: number }>();
    expect(after?.cash_usd_cents).toBe(1000000 - PPC_FULL_COST_PER_TICK_CENTS);
  });

  it('PPC dropped when cash insufficient (no spend, mix shrinks)', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-broke', company_name: 'B', city: null });
    await db2.prepare(
      'UPDATE players SET marketing_seo_pct = 0, marketing_ppc_pct = 100, marketing_referral_pct = 0, ' +
      'reputation = 50, cash_usd_cents = 50 WHERE user_id = ?',
    ).bind('u-broke').run();
    const player = await getPlayer(db2, 'u-broke');
    if (!player) throw new Error('player gone');
    const r = await tickPlayer(db2, player, 1715000000);
    expect(r.marketing_spent_cents).toBe(0); // PPC dropped
    const after = await db2.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ?')
      .bind('u-broke').first<{ cash_usd_cents: number }>();
    expect(after?.cash_usd_cents).toBe(50); // no deduction
  });

  it('zero marketing-mix → no acquisition (even on lucky rolls)', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-zero', company_name: 'Z', city: null });
    await db2.prepare(
      'UPDATE players SET marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0 WHERE user_id = ?',
    ).bind('u-zero').run();
    const origRandom = Math.random;
    Math.random = () => 0.0001; // force every roll to "yes"
    try {
      let totalAcquired = 0;
      for (let i = 0; i < 10; i++) {
        const player = await getPlayer(db2, 'u-zero');
        if (!player) throw new Error('player gone');
        const r = await tickPlayer(db2, player, 1715000000);
        totalAcquired += r.customers_acquired;
      }
      expect(totalAcquired).toBe(0);
    } finally {
      Math.random = origRandom;
    }
  }, 10000);

  it('daily shift-counter reset: stale last_shift_reset_at → counters zeroed', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-reset', company_name: 'R', city: null });
    // Set yesterday's reset + ate-up quota
    const now = 1715000000;
    const yesterday = Math.floor(now / 86400) * 86400 - 86400;
    await db2.prepare(
      'UPDATE players SET free_shifts_today = 1, paid_shifts_today = 4, last_shift_reset_at = ? WHERE user_id = ?',
    ).bind(yesterday, 'u-reset').run();
    const player = await getPlayer(db2, 'u-reset');
    if (!player) throw new Error('player gone');
    await tickPlayer(db2, player, now);
    const after = await db2.prepare(
      'SELECT free_shifts_today, paid_shifts_today, last_shift_reset_at FROM players WHERE user_id = ?',
    ).bind('u-reset').first<{ free_shifts_today: number; paid_shifts_today: number; last_shift_reset_at: number }>();
    expect(after?.free_shifts_today).toBe(0);
    expect(after?.paid_shifts_today).toBe(0);
    expect(after?.last_shift_reset_at).toBe(Math.floor(now / 86400) * 86400);
  });

  it('Pro player: 2× acquisition rate vs free', async () => {
    // Both players use the same forced Math.random sequence. Pro should
    // pass the acq-roll on more tries than free, given same probabilities.
    const seq: number[] = [];
    let i = 0;
    const origRandom = Math.random;
    Math.random = () => seq[i++ % seq.length];

    try {
      // mix=50/300=0.167, rep=0.5, era=1, both founded_at >7d ago (no welcome-boost)
      // Free acqProb = 0.012 * 0.167 * 0.5 * 1 = 0.0010
      // Pro  acqProb = 0.012 * 0.167 * 0.5 * 2 = 0.0020
      // Use 0.0015 → Pro passes, Free fails.
      for (let k = 0; k < 100; k++) seq.push(0.0015);
      const db2 = await createTestDb();
      await createPlayer(db2, { user_id: 'u-pro', company_name: 'P', city: null });
      await createPlayer(db2, { user_id: 'u-free', company_name: 'F', city: null });
      const oldFounded = 1715000000 - 14 * 86400;
      await db2.prepare(
        'UPDATE players SET founded_at = ?, marketing_seo_pct = 50, marketing_ppc_pct = 0, ' +
        'marketing_referral_pct = 0, reputation = 50, is_pro = 1, pro_until = ? WHERE user_id = ?',
      ).bind(oldFounded, Math.floor(Date.now() / 1000) + 86400, 'u-pro').run();
      await db2.prepare(
        'UPDATE players SET founded_at = ?, marketing_seo_pct = 50, marketing_ppc_pct = 0, ' +
        'marketing_referral_pct = 0, reputation = 50 WHERE user_id = ?',
      ).bind(oldFounded, 'u-free').run();

      i = 0;
      const proPlayer = await getPlayer(db2, 'u-pro');
      if (!proPlayer) throw new Error('pro player gone');
      const rPro = await tickPlayer(db2, proPlayer, 1715000000);

      i = 0;
      const freePlayer = await getPlayer(db2, 'u-free');
      if (!freePlayer) throw new Error('free player gone');
      const rFree = await tickPlayer(db2, freePlayer, 1715000000);

      expect(rPro.customers_acquired).toBeGreaterThan(rFree.customers_acquired);
    } finally {
      Math.random = origRandom;
    }
  });

  it('welcome boost: first-week player has 2× acquisition vs >7d player', async () => {
    const seq: number[] = [];
    let i = 0;
    const origRandom = Math.random;
    Math.random = () => seq[i++ % seq.length];
    try {
      // Same forced value that's BETWEEN free-rate (0.0010) and welcome-rate (0.0020).
      for (let k = 0; k < 100; k++) seq.push(0.0015);
      const db2 = await createTestDb();
      const now = 1715000000;
      await createPlayer(db2, { user_id: 'u-new', company_name: 'N', city: null });
      await createPlayer(db2, { user_id: 'u-old', company_name: 'O', city: null });
      // u-new just signed up: founded_at = now
      // u-old: founded 14 days ago
      await db2.prepare(
        'UPDATE players SET founded_at = ?, marketing_seo_pct = 50, marketing_ppc_pct = 0, ' +
        'marketing_referral_pct = 0, reputation = 50 WHERE user_id = ?',
      ).bind(now, 'u-new').run();
      await db2.prepare(
        'UPDATE players SET founded_at = ?, marketing_seo_pct = 50, marketing_ppc_pct = 0, ' +
        'marketing_referral_pct = 0, reputation = 50 WHERE user_id = ?',
      ).bind(now - 14 * 86400, 'u-old').run();

      i = 0;
      const pNew = await getPlayer(db2, 'u-new');
      if (!pNew) throw new Error('new gone');
      const rNew = await tickPlayer(db2, pNew, now);

      i = 0;
      const pOld = await getPlayer(db2, 'u-old');
      if (!pOld) throw new Error('old gone');
      const rOld = await tickPlayer(db2, pOld, now);

      expect(rNew.customers_acquired).toBeGreaterThan(rOld.customers_acquired);
    } finally {
      Math.random = origRandom;
    }
  });

  it('passive rep drift: ≥3 customers with avg satisfaction ≥70 can nudge rep up', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-rep', company_name: 'R', city: null });
    const now = 1715000000;
    for (let i = 0; i < 4; i++) {
      await db2.prepare(
        'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
        "VALUES (?, 'C" + i + "', 'loyalist', 'hobby', ?, 85)",
      ).bind('u-rep', now).run();
    }
    await db2.prepare(
      'UPDATE players SET marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0, reputation = 50 WHERE user_id = ?',
    ).bind('u-rep').run();

    const origRandom = Math.random;
    Math.random = () => 0.005; // below 0.02 threshold → always nudges
    try {
      const player = await getPlayer(db2, 'u-rep');
      if (!player) throw new Error('player gone');
      await tickPlayer(db2, player, now);
      const after = await getPlayer(db2, 'u-rep');
      expect(after?.reputation).toBe(51);
    } finally {
      Math.random = origRandom;
    }
  });

  it('passive rep drift: <30 avg satisfaction nudges down', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-bad', company_name: 'B', city: null });
    const now = 1715000000;
    for (let i = 0; i < 4; i++) {
      await db2.prepare(
        'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
        "VALUES (?, 'C" + i + "', 'karen', 'hobby', ?, 15)",
      ).bind('u-bad', now).run();
    }
    await db2.prepare(
      'UPDATE players SET marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0, reputation = 50 WHERE user_id = ?',
    ).bind('u-bad').run();

    const origRandom = Math.random;
    Math.random = () => 0.005;
    try {
      const player = await getPlayer(db2, 'u-bad');
      if (!player) throw new Error('player gone');
      await tickPlayer(db2, player, now);
      const after = await getPlayer(db2, 'u-bad');
      expect(after?.reputation).toBe(49);
    } finally {
      Math.random = origRandom;
    }
  });

  it('Pro player: lower churn-roll vs free', async () => {
    // With Math.random forced to 0.2: free (churnProb=0.30) churns,
    // Pro (churnProb=0.15) does NOT churn.
    const origRandom = Math.random;
    Math.random = () => 0.2;
    try {
      const db2 = await createTestDb();
      const now = 1715000000;
      for (const [uid, isPro] of [['u-prochurn', 1], ['u-freechurn', 0]] as const) {
        await createPlayer(db2, { user_id: uid, company_name: 'X', city: null });
        await db2.prepare(
          'UPDATE players SET is_pro = ?, marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0 WHERE user_id = ?',
        ).bind(isPro, uid).run();
        const cRes = await db2.prepare(
          'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
          "VALUES (?, 'Test', 'karen', 'hobby', ?, 50) RETURNING id",
        ).bind(uid, now - 100 * 3600).first<{ id: number }>();
        if (!cRes) throw new Error('customer not created');
        await db2.prepare(
          'INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) ' +
          "VALUES (?, ?, 'old', 'old', 'open', ?)",
        ).bind(cRes.id, uid, now - 60 * 3600).run();
        await addCoreCustomers(db2, uid, now);
        const p = await getPlayer(db2, uid);
        if (!p) throw new Error('player gone');
        await tickPlayer(db2, p, now);
      }
      const proActive = await db2.prepare(
        'SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1',
      ).bind('u-prochurn').first<{ n: number }>();
      const freeActive = await db2.prepare(
        'SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1',
      ).bind('u-freechurn').first<{ n: number }>();
      const core = ECONOMY.churn_floor_customers;
      expect(proActive?.n).toBe(core + 1); // Pro survived
      expect(freeActive?.n).toBe(core); // Free churned
    } finally {
      Math.random = origRandom;
    }
  });

  it('daily shift-counter reset: same-day → no zeroing', async () => {
    const db2 = await createTestDb();
    await createPlayer(db2, { user_id: 'u-same', company_name: 'S', city: null });
    const now = 1715000000;
    const todayStart = Math.floor(now / 86400) * 86400;
    await db2.prepare(
      'UPDATE players SET free_shifts_today = 1, paid_shifts_today = 2, last_shift_reset_at = ? WHERE user_id = ?',
    ).bind(todayStart, 'u-same').run();
    const player = await getPlayer(db2, 'u-same');
    if (!player) throw new Error('player gone');
    await tickPlayer(db2, player, now);
    const after = await db2.prepare(
      'SELECT free_shifts_today, paid_shifts_today FROM players WHERE user_id = ?',
    ).bind('u-same').first<{ free_shifts_today: number; paid_shifts_today: number }>();
    expect(after?.free_shifts_today).toBe(1);
    expect(after?.paid_shifts_today).toBe(2);
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
    Math.random = () => { calls++; return calls === 1 ? 0.0001 : 0.5; };

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

describe('tickPlayer — balance v2 safety nets (2026-11-12)', { timeout: 30_000 }, () => {
  const now = 1715000000;
  async function playerWithStaleCustomers(d: D1Database, uid: string, n: number): Promise<number[]> {
    await createPlayer(d, { user_id: uid, company_name: 'S', city: null });
    await d.prepare(
      'UPDATE players SET marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0, founded_at = ? WHERE user_id = ?',
    ).bind(now - 30 * 86400, uid).run();
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      const c = await d.prepare(
        'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) ' +
        "VALUES (?, 'C', 'newbie', 'hobby', ?, 50) RETURNING id",
      ).bind(uid, now - 100 * 3600).first<{ id: number }>();
      await d.prepare(
        'INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) ' +
        "VALUES (?, ?, 'old', 'old', 'open', ?)",
      ).bind(c!.id, uid, now - 60 * 3600).run();
      ids.push(c!.id);
    }
    return ids;
  }

  it('churn never takes the last core customers (base MRR stays)', async () => {
    const d = await createTestDb();
    await playerWithStaleCustomers(d, 'u-floor', ECONOMY.churn_floor_customers);
    const orig = Math.random;
    Math.random = () => 0; // minden dobás „elmegy"
    try {
      const r = await tickPlayer(d, (await getPlayer(d, 'u-floor'))!, now);
      expect(r.churned).toBe(0);
    } finally { Math.random = orig; }
    const n = await d.prepare('SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1')
      .bind('u-floor').first<{ n: number }>();
    expect(n?.n).toBe(ECONOMY.churn_floor_customers);
  });

  it('a churned customer\'s open tickets are closed (they no longer take a shift slot)', async () => {
    const d = await createTestDb();
    const ids = await playerWithStaleCustomers(d, 'u-ct', ECONOMY.churn_floor_customers + 1);
    const orig = Math.random;
    Math.random = () => 0;
    try {
      const r = await tickPlayer(d, (await getPlayer(d, 'u-ct'))!, now);
      expect(r.churned).toBe(1);
    } finally { Math.random = orig; }
    const gone = await d.prepare('SELECT id FROM customers WHERE player_id = ? AND is_active = 0').bind('u-ct').first<{ id: number }>();
    expect(ids).toContain(gone!.id);
    const t = await d.prepare('SELECT status FROM tickets WHERE customer_id = ?').bind(gone!.id).first<{ status: string }>();
    expect(t?.status).toBe('churned');
  });

  it('bridge investor: once per company, when cash falls below the threshold', async () => {
    const d = await createTestDb();
    await createPlayer(d, { user_id: 'u-br', company_name: 'B', city: null });
    await d.prepare(
      'UPDATE players SET cash_usd_cents = 1000, founded_at = ?, marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0 WHERE user_id = ?',
    ).bind(now - 3 * 86400, 'u-br').run();
    const r1 = await tickPlayer(d, (await getPlayer(d, 'u-br'))!, now);
    expect(r1.bridge_granted_cents).toBe(ECONOMY.bridge!.grant_cents);
    const ev = await d.prepare("SELECT COUNT(*) AS n FROM events WHERE player_id = ? AND event_type = 'bridge_investor' AND resolved_at IS NOT NULL")
      .bind('u-br').first<{ n: number }>();
    expect(ev?.n).toBe(1);
    await d.prepare('UPDATE players SET cash_usd_cents = 0 WHERE user_id = ?').bind('u-br').run();
    const r2 = await tickPlayer(d, (await getPlayer(d, 'u-br'))!, now + 300);
    expect(r2.bridge_granted_cents).toBe(0);
  });

  it('broke player: PPC stops instead of draining (cash never below 0 from ads)', async () => {
    const d = await createTestDb();
    await createPlayer(d, { user_id: 'u-ppc0', company_name: 'P', city: null });
    await d.prepare(
      'UPDATE players SET cash_usd_cents = 15000, mrr_usd_cents = 0, marketing_seo_pct = 0, marketing_ppc_pct = 100, marketing_referral_pct = 0 WHERE user_id = ?',
    ).bind('u-ppc0').run();
    const r = await tickPlayer(d, (await getPlayer(d, 'u-ppc0'))!, now);
    expect(r.marketing_spent_cents).toBe(0); // a $200-os tartalék alatt és bevétel nélkül nincs hirdetés
    expect(r.marketing_throttled).toBe(true);
  });
});
