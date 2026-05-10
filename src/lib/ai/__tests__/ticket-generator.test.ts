import { describe, it, expect, vi } from 'vitest';
import { generateAiTicket } from '../ticket-generator';
import type { WorkersAIBinding } from '../workers-ai';
import type { VectorizeBinding } from '../vectorize';

describe('generateAiTicket', () => {
  const buildAi = (response = 'My site is down again. This is the third time this week.') => ({
    run: vi.fn().mockImplementation((model: string) => {
      if (model.includes('embed') || model.includes('bge')) return Promise.resolve({ data: [Array(768).fill(0.1)] });
      return Promise.resolve({ response });
    }),
  } as unknown as WorkersAIBinding);

  const vectorize = {
    query: vi.fn().mockResolvedValue({ matches: [] }),
    upsert: vi.fn().mockResolvedValue({ count: 1 }),
  } as unknown as VectorizeBinding;

  it('returns a non-empty ticket text + summary ≤ 80', async () => {
    const r = await generateAiTicket(buildAi(), vectorize, {
      customer_id: 1, customer_name: 'Test User', archetype: 'karen', satisfaction: 30,
    });
    expect(r.full_text.length).toBeGreaterThan(10);
    expect(r.summary.length).toBeGreaterThan(5);
    expect(r.summary.length).toBeLessThanOrEqual(80);
  });

  it('queries customer memory with customer_id filter', async () => {
    await generateAiTicket(buildAi(), vectorize, {
      customer_id: 42, customer_name: 'A', archetype: 'newbie', satisfaction: 50,
    });
    expect(vectorize.query).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      filter: { customer_id: 42 },
    }));
  });

  it('strips wrapping quotes from response', async () => {
    const r = await generateAiTicket(buildAi('"Some quoted text"'), vectorize, {
      customer_id: 1, customer_name: 'X', archetype: 'pro', satisfaction: 50,
    });
    expect(r.full_text).not.toMatch(/^["']|["']$/);
  });
});
