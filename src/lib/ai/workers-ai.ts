// CF Workers AI client wrappers — chat (Llama-3.1-8b) + embed (bge-base-en).

export interface WorkersAIBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

const CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
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
  const result = await ai.run(CHAT_MODEL, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: opts.max_tokens ?? 200,
    temperature: opts.temperature ?? 0.85,
  }) as { response?: string };
  const text = result.response ?? '';
  return text.length > MAX_RESPONSE_LENGTH ? text.slice(0, MAX_RESPONSE_LENGTH) : text;
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
