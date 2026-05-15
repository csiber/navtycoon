import { generateChatResponse, type WorkersAIBinding } from './workers-ai';
import { buildReplyPrompt, type ReplyPromptInput } from './persona-prompts';
import type { PersonaArchetype } from '../game/types';

export type ReplyLang = 'en' | 'hu' | 'de';

function languageDirective(lang: ReplyLang): string {
  if (lang === 'hu') return ' Reply in Hungarian (magyarul).';
  if (lang === 'de') return ' Reply in German (auf Deutsch).';
  return '';
}

export async function generateAiReply(
  ai: WorkersAIBinding,
  input: ReplyPromptInput & { lang?: ReplyLang },
): Promise<string> {
  const prompt = buildReplyPrompt(input);
  const lang: ReplyLang = (input.lang as ReplyLang) ?? 'en';
  const text = await generateChatResponse(
    ai,
    'You are role-playing as a customer responding to support. Stay in character. 1-2 sentences. Output the reply text ONLY.' + languageDirective(lang),
    prompt,
    { max_tokens: 150, temperature: 0.9 },
  );
  return text.trim().replace(/^["'`]|["'`]$/g, '');
}

export interface RateInput {
  archetype: PersonaArchetype;
  customer_name: string;
  satisfaction: number;
  ticket_subject: string;
  player_response: string;
}

export interface RatingResult {
  delta: number;
  reason: string;
}

export async function ratePlayerResponse(
  ai: WorkersAIBinding,
  input: RateInput,
): Promise<RatingResult> {
  const sys = 'You are a sentiment-judge for a hosting-tycoon game. Rate how the support response would change the customer\'s satisfaction. Output ONLY a JSON object with "delta" (integer -50 to +50) and "reason" (short string). No prose. No markdown.';
  const user = `Customer persona: ${input.archetype}
Customer name: ${input.customer_name}
Current satisfaction: ${input.satisfaction}
Ticket subject: ${input.ticket_subject}
Support response: "${input.player_response}"

Output the JSON judgment now.`;

  const raw = await generateChatResponse(ai, sys, user, { max_tokens: 100, temperature: 0.3 });

  const match = raw.match(/\{[^{}]*"delta"[^{}]*\}/);
  if (!match) return { delta: 0, reason: 'rating-parse-failed' };
  try {
    const parsed = JSON.parse(match[0]) as { delta?: number; reason?: string };
    const delta = Math.max(-50, Math.min(50, Number(parsed.delta ?? 0)));
    return { delta, reason: String(parsed.reason ?? 'no-reason') };
  } catch {
    return { delta: 0, reason: 'rating-parse-failed' };
  }
}
