import { describe, it, expect, vi } from 'vitest';
import { generateChatResponse, generateEmbedding, type WorkersAIBinding } from '../workers-ai';

describe('generateChatResponse', () => {
  it('calls AI binding with chat-shape', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: 'Hi there!' }) } as unknown as WorkersAIBinding;
    const r = await generateChatResponse(ai, 'You are a helpful bot.', 'Hi');
    expect(r).toBe('Hi there!');
    expect(ai.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct', expect.objectContaining({
      messages: [
        { role: 'system', content: 'You are a helpful bot.' },
        { role: 'user', content: 'Hi' },
      ],
      max_tokens: expect.any(Number),
    }));
  });

  it('supports max_tokens override', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: 'x' }) } as unknown as WorkersAIBinding;
    await generateChatResponse(ai, 'sys', 'msg', { max_tokens: 50 });
    expect(ai.run).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ max_tokens: 50 }));
  });

  it('truncates oversized response', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: 'a'.repeat(2000) }) } as unknown as WorkersAIBinding;
    const r = await generateChatResponse(ai, 's', 'm');
    expect(r.length).toBeLessThanOrEqual(1500);
  });
});

describe('generateEmbedding', () => {
  it('returns 768-dim vector', async () => {
    const fakeVec = Array.from({ length: 768 }, () => Math.random());
    const ai = { run: vi.fn().mockResolvedValue({ data: [fakeVec] }) } as unknown as WorkersAIBinding;
    const v = await generateEmbedding(ai, 'test text');
    expect(v.length).toBe(768);
    expect(ai.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: ['test text'] });
  });

  it('throws on empty embed result', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ data: [] }) } as unknown as WorkersAIBinding;
    await expect(generateEmbedding(ai, 'x')).rejects.toThrow();
  });
});
