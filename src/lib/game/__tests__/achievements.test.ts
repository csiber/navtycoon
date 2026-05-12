// Hyperscaler — achievement unlock-flow tesztelése (in-memory D1).
// Verifies: counts-driven unlocks fire, idempotent (no re-unlock),
// owned-set check works.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACHIEVEMENTS,
  checkAndUnlockAchievements,
  unlockAchievement,
} from '../achievements';
import { createPlayer } from '../db';
import { createTestDb } from '../../../../test-utils/d1-mock';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { D1Like } from '../db';

describe('ACHIEVEMENTS catalog', () => {
  it('has 12 entries with unique ids', () => {
    expect(ACHIEVEMENTS.length).toBe(12);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every achievement has emoji + title + description', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toMatch(/^[a-z0-9_]+$/);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(a.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('checkAndUnlockAchievements', () => {
  let db: D1Database;
  let dbLike: D1Like;
  beforeEach(async () => {
    db = await createTestDb();
    dbLike = db as unknown as D1Like;
  });

  it('first_blood unlocks at customer_count >= 1', async () => {
    const p = await createPlayer(dbLike, {
      user_id: 'u1',
      company_name: 'X',
      city: null,
    });
    const r = await checkAndUnlockAchievements(db, 'u1', {
      player: p,
      customer_count: 1,
      ticket_count: 0,
      resolved_ticket_count: 0,
      total_refund_cents: 0,
      shift_count: 0,
    });
    expect(r).toContain('first_blood');
  });

  it('idempotent: second call does not re-unlock', async () => {
    const p = await createPlayer(dbLike, {
      user_id: 'u2',
      company_name: 'X',
      city: null,
    });
    const input = {
      player: p,
      customer_count: 1,
      ticket_count: 0,
      resolved_ticket_count: 0,
      total_refund_cents: 0,
      shift_count: 0,
    };
    const r1 = await checkAndUnlockAchievements(db, 'u2', input);
    const r2 = await checkAndUnlockAchievements(db, 'u2', input);
    expect(r1).toContain('first_blood');
    expect(r2).not.toContain('first_blood');
  });

  it('unlocks multiple at once when thresholds met', async () => {
    const p = await createPlayer(dbLike, {
      user_id: 'u3',
      company_name: 'X',
      city: null,
    });
    const r = await checkAndUnlockAchievements(db, 'u3', {
      player: { ...p, mrr_usd_cents: 1_000_000, reputation: 95 },
      customer_count: 100,
      ticket_count: 60,
      resolved_ticket_count: 60,
      total_refund_cents: 200_000,
      shift_count: 12,
    });
    expect(r).toContain('first_blood');
    expect(r).toContain('ten_customers');
    expect(r).toContain('hundred_customers');
    expect(r).toContain('first_k_mrr');
    expect(r).toContain('first_10k_mrr');
    expect(r).toContain('ticket_whisperer');
    expect(r).toContain('refund_king');
    expect(r).toContain('first_shift');
    expect(r).toContain('shift_marathon');
    expect(r).toContain('high_rep');
    // narrative achievement is not unlocked by counts
    expect(r).not.toContain('survived_first_ddos');
  });

  it('survived_first_ddos NOT unlocked by counts (narrative-driven)', async () => {
    const p = await createPlayer(dbLike, {
      user_id: 'u4',
      company_name: 'X',
      city: null,
    });
    const r = await checkAndUnlockAchievements(db, 'u4', {
      player: p,
      customer_count: 0,
      ticket_count: 0,
      resolved_ticket_count: 0,
      total_refund_cents: 0,
      shift_count: 0,
    });
    expect(r).not.toContain('survived_first_ddos');
  });

  it('per-user isolation: u1 unlocks do not leak to u2', async () => {
    const p1 = await createPlayer(dbLike, {
      user_id: 'iso1',
      company_name: 'A',
      city: null,
    });
    const p2 = await createPlayer(dbLike, {
      user_id: 'iso2',
      company_name: 'B',
      city: null,
    });
    await checkAndUnlockAchievements(db, 'iso1', {
      player: p1,
      customer_count: 5,
      ticket_count: 0,
      resolved_ticket_count: 0,
      total_refund_cents: 0,
      shift_count: 0,
    });
    const r2 = await checkAndUnlockAchievements(db, 'iso2', {
      player: p2,
      customer_count: 5,
      ticket_count: 0,
      resolved_ticket_count: 0,
      total_refund_cents: 0,
      shift_count: 0,
    });
    expect(r2).toContain('first_blood');
  });
});

describe('unlockAchievement (narrative)', () => {
  let db: D1Database;
  let dbLike: D1Like;
  beforeEach(async () => {
    db = await createTestDb();
    dbLike = db as unknown as D1Like;
    await createPlayer(dbLike, {
      user_id: 'narr1',
      company_name: 'N',
      city: null,
    });
  });

  it('unlocks unknown narrative achievement returns false', async () => {
    expect(await unlockAchievement(db, 'narr1', 'fake_id')).toBe(false);
  });

  it('survived_first_ddos can be force-unlocked, idempotent', async () => {
    const a = await unlockAchievement(db, 'narr1', 'survived_first_ddos');
    expect(a).toBe(true);
    const b = await unlockAchievement(db, 'narr1', 'survived_first_ddos');
    expect(b).toBe(false);
  });
});
