import { describe, it, expect, vi } from 'vitest';
import { CHAT_MODELS, generateChatResponse, generateEmbedding, type WorkersAIBinding } from '../workers-ai';

describe('generateChatResponse', () => {
  it('calls AI binding with chat-shape', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: 'Hi there!' }) } as unknown as WorkersAIBinding;
    const r = await generateChatResponse(ai, 'You are a helpful bot.', 'Hi');
    expect(r).toBe('Hi there!');
    expect(ai.run).toHaveBeenCalledWith('@cf/meta/llama-3.3-70b-instruct-fp8-fast', expect.objectContaining({
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

describe('generateChatResponse — model fallback', () => {
  it('falls back to the second model when the first is retired (5028)', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('5028: model was deprecated'))
      .mockResolvedValueOnce({ response: 'from fallback' });
    const r = await generateChatResponse({ run } as unknown as WorkersAIBinding, 's', 'm');
    expect(r).toBe('from fallback');
    expect(run.mock.calls.map(c => c[0])).toEqual([...CHAT_MODELS]);
  });

  it('treats an empty answer as failure and reads OpenAI-shaped output', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ response: '' })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'openai shape' } }] });
    expect(await generateChatResponse({ run } as unknown as WorkersAIBinding, 's', 'm')).toBe('openai shape');
  });

  it('throws when every model fails (caller falls back to placeholder)', async () => {
    const run = vi.fn().mockRejectedValue(new Error('down'));
    await expect(generateChatResponse({ run } as unknown as WorkersAIBinding, 's', 'm')).rejects.toThrow('down');
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
