import { generateChatResponse, type WorkersAIBinding } from './workers-ai';
import { recallCustomerMemory, type VectorizeBinding } from './vectorize';
import { buildTicketPrompt } from './persona-prompts';
import type { PersonaArchetype } from '../game/types';

export type TicketLang = 'en' | 'hu' | 'de';

export interface GenerateTicketInput {
  customer_id: number;
  customer_name: string;
  archetype: PersonaArchetype;
  satisfaction: number;
  current_event?: string;
  /** Player's preferred UI language → drives LLM output language. */
  lang?: TicketLang;
}

export interface GeneratedTicket {
  summary: string;
  full_text: string;
}

function languageDirective(lang: TicketLang): string {
  if (lang === 'hu') return ' Write the message in Hungarian (magyarul).';
  if (lang === 'de') return ' Write the message in German (auf Deutsch).';
  return '';
}

export async function generateAiTicket(
  ai: WorkersAIBinding,
  vectorize: VectorizeBinding,
  input: GenerateTicketInput,
): Promise<GeneratedTicket> {
  const memories = await recallCustomerMemory(ai, vectorize, input.customer_id, 'recent issue', 3).catch(() => []);
  const past_summaries = memories.map(m => m.summary);

  const prompt = buildTicketPrompt({
    archetype: input.archetype,
    customer_name: input.customer_name,
    satisfaction: input.satisfaction,
    past_summaries,
    current_event: input.current_event,
  });

  const lang: TicketLang = input.lang ?? 'en';
  const text = await generateChatResponse(
    ai,
    'You are role-playing as a customer of a hosting company. Stay in character. Output the customer message ONLY.' + languageDirective(lang),
    prompt,
    { max_tokens: 200, temperature: 0.95 },
  );

  const cleanText = text.trim().replace(/^["'`]|["'`]$/g, '');
  return {
    summary: cleanText.slice(0, 80).replace(/\n.*$/s, ''),
    full_text: cleanText,
  };
}
