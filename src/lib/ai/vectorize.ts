import { generateEmbedding, type WorkersAIBinding } from './workers-ai';

export interface VectorizeBinding {
  upsert(vectors: { id: string; values: number[]; metadata?: Record<string, unknown> }[]): Promise<{ count: number }>;
  query(vector: number[], opts?: {
    topK?: number;
    filter?: Record<string, unknown>;
    returnMetadata?: 'none' | 'indexed' | 'all';
  }): Promise<{ matches: { id: string; score: number; metadata?: Record<string, unknown> }[] }>;
}

export interface TicketMemoryInput {
  ticket_id: number;
  customer_id: number;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  era_id: number;
}

export async function storeTicketMemory(
  ai: WorkersAIBinding,
  vectorize: VectorizeBinding,
  input: TicketMemoryInput,
): Promise<void> {
  const values = await generateEmbedding(ai, input.summary);
  await vectorize.upsert([{
    id: `t${input.ticket_id}`,
    values,
    metadata: {
      ticket_id: input.ticket_id,
      customer_id: input.customer_id,
      summary: input.summary.slice(0, 500),
      sentiment: input.sentiment,
      era_id: input.era_id,
    },
  }]);
}

export interface RecalledMemory {
  ticket_id: number;
  summary: string;
  sentiment: string;
  score: number;
}

export async function recallCustomerMemory(
  ai: WorkersAIBinding,
  vectorize: VectorizeBinding,
  customer_id: number,
  query_text: string,
  topK = 3,
): Promise<RecalledMemory[]> {
  const queryVec = await generateEmbedding(ai, query_text);
  const result = await vectorize.query(queryVec, {
    topK, filter: { customer_id }, returnMetadata: 'all',
  });
  return (result.matches ?? []).map(m => ({
    ticket_id: Number(m.metadata?.ticket_id ?? 0),
    summary: String(m.metadata?.summary ?? ''),
    sentiment: String(m.metadata?.sentiment ?? 'neutral'),
    score: m.score,
  }));
}
