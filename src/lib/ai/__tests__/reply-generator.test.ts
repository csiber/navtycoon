import { describe, it, expect, vi } from 'vitest';
import { generateAiReply, ratePlayerResponse } from '../reply-generator';
import type { WorkersAIBinding } from '../workers-ai';

describe('generateAiReply', () => {
  const ai = { run: vi.fn().mockResolvedValue({ response: 'Fine. But I am still unhappy.' }) } as unknown as WorkersAIBinding;

  it('returns reply text', async () => {
    const r = await generateAiReply(ai, {
      archetype: 'cheapskate', customer_name: 'X', satisfaction: 40,
      ticket_subject: 'Refund', conversation: [{ role: 'customer', text: 'Refund pls.' }],
    });
    expect(r.length).toBeGreaterThan(5);
  });
});

describe('ratePlayerResponse', () => {
  const ai = { run: vi.fn() } as unknown as WorkersAIBinding;

  it('returns satisfaction delta in -50..+50 range', async () => {
    (ai.run as any).mockResolvedValue({ response: '{"delta": 15, "reason": "polite and helpful"}' });
    const d = await ratePlayerResponse(ai, {
      archetype: 'karen', customer_name: 'K', satisfaction: 30,
      ticket_subject: 'Down', player_response: 'I understand your frustration. Let me check.',
    });
    expect(d.delta).toBe(15);
    expect(d.reason).toContain('polite');
  });

  it('clamps out-of-range delta', async () => {
    (ai.run as any).mockResolvedValue({ response: '{"delta": 999, "reason": "x"}' });
    const d = await ratePlayerResponse(ai, {
      archetype: 'pro', customer_name: 'P', satisfaction: 50,
      ticket_subject: 's', player_response: 'r',
    });
    expect(d.delta).toBe(50);
  });

  it('handles malformed JSON gracefully', async () => {
    (ai.run as any).mockResolvedValue({ response: 'this is not JSON at all' });
    const d = await ratePlayerResponse(ai, {
      archetype: 'newbie', customer_name: 'N', satisfaction: 50,
      ticket_subject: 's', player_response: 'r',
    });
    expect(d.delta).toBe(0);
    expect(d.reason).toBe('rating-parse-failed');
  });
});
