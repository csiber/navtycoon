// src/lib/game/__tests__/lazy-tick.test.ts
// Hyperscaler — maybeLazyTick throttle + atomic-claim Vitest.

import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { maybeLazyTick, LAZY_TICK_MIN_INTERVAL_SEC } from '../lazy-tick';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, getPlayer } from '../db';

describe('maybeLazyTick', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('first call ticks when last_ticked_at = 0 (default)', async () => {
    await createPlayer(db, { user_id: 'u1', company_name: 'X', city: null });
    const p = await getPlayer(db, 'u1');
    if (!p) throw new Error('player missing');
    expect((p as { last_ticked_at?: number }).last_ticked_at ?? 0).toBe(0);
    const fired = await maybeLazyTick(db, p, {});
    expect(fired).toBe(true);
  });

  it('second call within 5 minutes does NOT tick (throttled)', async () => {
    await createPlayer(db, { user_id: 'u2', company_name: 'X', city: null });
    const p1 = await getPlayer(db, 'u2');
    if (!p1) throw new Error('player missing');
    const fired1 = await maybeLazyTick(db, p1, {});
    expect(fired1).toBe(true);

    // Re-fetch so player carries updated last_ticked_at
    const p2 = await getPlayer(db, 'u2');
    if (!p2) throw new Error('player missing after first tick');
    const fired2 = await maybeLazyTick(db, p2, {});
    expect(fired2).toBe(false);
  });

  it('after MIN_INTERVAL passes, next call ticks again', async () => {
    await createPlayer(db, { user_id: 'u3', company_name: 'X', city: null });
    const p1 = await getPlayer(db, 'u3');
    if (!p1) throw new Error('player missing');
    await maybeLazyTick(db, p1, {});

    // Manually backdate last_ticked_at past the throttle window.
    const longAgo = Math.floor(Date.now() / 1000) - LAZY_TICK_MIN_INTERVAL_SEC - 60;
    await db.prepare('UPDATE players SET last_ticked_at = ? WHERE user_id = ?')
      .bind(longAgo, 'u3').run();
    const p2 = await getPlayer(db, 'u3');
    if (!p2) throw new Error('player missing after backdate');
    const fired = await maybeLazyTick(db, p2, {});
    expect(fired).toBe(true);
  });

  it('atomic-claim: stale-cached player object cannot double-tick', async () => {
    // Sim: két párhuzamos /play-load ugyanazzal a stale player-rekorddal
    // (last_ticked_at=0). Csak az egyik kérés tickelhet.
    await createPlayer(db, { user_id: 'u4', company_name: 'X', city: null });
    const stale = await getPlayer(db, 'u4');
    if (!stale) throw new Error('player missing');
    // Külön példányokon hívjuk, mindkettő szerint last_ticked_at=0.
    const [a, b] = await Promise.all([
      maybeLazyTick(db, stale, {}),
      maybeLazyTick(db, stale, {}),
    ]);
    // Pontosan egyikük tickel.
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
