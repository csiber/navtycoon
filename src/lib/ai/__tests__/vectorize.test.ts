import { describe, it, expect, vi } from 'vitest';
import { storeTicketMemory, recallCustomerMemory, type VectorizeBinding } from '../vectorize';
import type { WorkersAIBinding } from '../workers-ai';

describe('storeTicketMemory', () => {
  it('upserts vector with metadata', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ data: [Array(768).fill(0.1)] }) } as unknown as WorkersAIBinding;
    const vectorize = { upsert: vi.fn().mockResolvedValue({ count: 1 }) } as unknown as VectorizeBinding;
    await storeTicketMemory(ai, vectorize, {
      ticket_id: 42, customer_id: 7, summary: 'Site is down.', sentiment: 'negative', era_id: 1,
    });
    expect(vectorize.upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        id: 't42',
        values: expect.any(Array),
        metadata: expect.objectContaining({ customer_id: 7, ticket_id: 42, sentiment: 'negative' }),
      }),
    ]));
  });
});

describe('recallCustomerMemory', () => {
  it('queries by customer-filter, returns summaries', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ data: [Array(768).fill(0.1)] }) } as unknown as WorkersAIBinding;
    const vectorize = {
      query: vi.fn().mockResolvedValue({
        matches: [
          { id: 't1', score: 0.9, metadata: { ticket_id: 1, customer_id: 7, summary: 'Old downtime', sentiment: 'negative' } },
          { id: 't2', score: 0.8, metadata: { ticket_id: 2, customer_id: 7, summary: 'Slow load', sentiment: 'neutral' } },
        ],
      }),
    } as unknown as VectorizeBinding;
    const r = await recallCustomerMemory(ai, vectorize, 7, 'database problem', 3);
    expect(r).toHaveLength(2);
    expect(r[0].summary).toBe('Old downtime');
    expect(vectorize.query).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      topK: 3, filter: { customer_id: 7 }, returnMetadata: 'all',
    }));
  });

  it('returns empty array when no matches', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ data: [Array(768).fill(0.1)] }) } as unknown as WorkersAIBinding;
    const vectorize = { query: vi.fn().mockResolvedValue({ matches: [] }) } as unknown as VectorizeBinding;
    const r = await recallCustomerMemory(ai, vectorize, 99, 'x');
    expect(r).toEqual([]);
  });
});
