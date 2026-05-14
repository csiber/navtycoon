// src/lib/game/__tests__/llm-cap.test.ts
// Hyperscales — Plan 2 Task 4: per-user daily LLM-call budget tracker.

import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { tryConsumeLlmCall, getLlmUsageToday, FREE_DAILY_CAP, PRO_DAILY_CAP } from '../llm-cap';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer } from '../db';

describe('tryConsumeLlmCall', () => {
  let db: D1Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('free user consumes up to FREE_DAILY_CAP', async () => {
    await createPlayer(db, { user_id: 'u1', company_name: 'A', city: null });
    for (let i = 0; i < FREE_DAILY_CAP; i++) {
      expect(await tryConsumeLlmCall(db, 'u1', false)).toBe(true);
    }
    expect(await tryConsumeLlmCall(db, 'u1', false)).toBe(false);
  });

  it('pro user gets PRO_DAILY_CAP', async () => {
    await createPlayer(db, { user_id: 'u2', company_name: 'B', city: null });
    for (let i = 0; i < PRO_DAILY_CAP; i++) {
      expect(await tryConsumeLlmCall(db, 'u2', true)).toBe(true);
    }
    expect(await tryConsumeLlmCall(db, 'u2', true)).toBe(false);
  });

  it('per-user isolation', async () => {
    await createPlayer(db, { user_id: 'u3', company_name: 'C', city: null });
    await createPlayer(db, { user_id: 'u4', company_name: 'D', city: null });
    for (let i = 0; i < FREE_DAILY_CAP; i++) {
      await tryConsumeLlmCall(db, 'u3', false);
    }
    expect(await tryConsumeLlmCall(db, 'u3', false)).toBe(false);
    expect(await tryConsumeLlmCall(db, 'u4', false)).toBe(true);
  });

  it('getLlmUsageToday reports current count', async () => {
    await createPlayer(db, { user_id: 'u5', company_name: 'E', city: null });
    await tryConsumeLlmCall(db, 'u5', false);
    await tryConsumeLlmCall(db, 'u5', false);
    expect(await getLlmUsageToday(db, 'u5')).toBe(2);
  });
});
