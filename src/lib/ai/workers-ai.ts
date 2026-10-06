// CF Workers AI client wrappers — chat (Llama-3.3-70b, fallback 3.1-8b-fast) + embed (bge-base-en).

export interface WorkersAIBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

// 2026-10-06: CF deprecated @cf/meta/llama-3.1-8b-instruct on 2026-05-30 (error 5028), so every AI ticket
// and reply had silently fallen back to placeholder text since then. 3.3-70b writes good Hungarian/German;
// the 8b-fast model is the fallback if the primary is ever retired too. Failures are logged, never silent.
// (gemma-4 / glm-4.7 were tried: reasoning models, they spend max_tokens on thinking and return empty text.)
export const CHAT_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fast'] as const;
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const MAX_RESPONSE_LENGTH = 1500;

export interface ChatOptions {
  max_tokens?: number;
  temperature?: number;
}

export async function generateChatResponse(
  ai: WorkersAIBinding,
  systemPrompt: string,
  userPrompt: string,
  opts: ChatOptions = {},
): Promise<string> {
  const input = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: opts.max_tokens ?? 200,
    temperature: opts.temperature ?? 0.85,
  };
  let lastErr: unknown = new Error('no chat model configured');
  for (const model of CHAT_MODELS) {
    try {
      const text = extractText(await ai.run(model, input));
      if (!text.trim()) throw new Error('empty response');
      return text.length > MAX_RESPONSE_LENGTH ? text.slice(0, MAX_RESPONSE_LENGTH) : text;
    } catch (e) {
      lastErr = e;
      console.error(`workers-ai: ${model} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr;
}

// Newer models answer in OpenAI shape (choices[0].message.content); `response` is still filled on most.
function extractText(result: unknown): string {
  const r = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
  if (typeof r?.response === 'string') return r.response;
  const c = r?.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : '';
}

export async function generateEmbedding(
  ai: WorkersAIBinding,
  text: string,
): Promise<number[]> {
  const result = await ai.run(EMBED_MODEL, { text: [text] }) as { data?: number[][] };
  if (!result.data || result.data.length === 0) {
    throw new Error('embedding returned no data');
  }
  return result.data[0];
}
