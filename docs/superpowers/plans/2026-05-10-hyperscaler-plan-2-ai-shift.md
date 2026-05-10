# Hyperscaler Plan 2 — AI Engine + Shift-Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customers ACTUALLY AI-driven. Replace Plan 1 placeholder ticket-text with Workers AI Llama-3.1-8b. Add Vectorize-based per-customer memory. Build shift-mode: real-time WebSocket chat in a Durable Object with action-buttons (refund / escalate / investigate / close).

**Architecture:** CF Pages Functions can bind Durable Objects + Workers AI + Vectorize. Add `ShiftRoomDO` (per-shift WS-room with hibernation). Background tick-loop calls Workers AI in batched fashion (cost-amortized via `Queues` only if needed — Plan 1 cron handles it inline for now). Vectorize index stores 768-dim embeddings of past tickets for prompt-context recall.

**Tech Stack:** Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct` + `@cf/baai/bge-base-en-v1.5` for embeddings), Vectorize (768-dim, cosine), Durable Objects (sqlite-storage class), WebSockets, Astro 5.

**Spec:** [docs/superpowers/specs/2026-05-10-hyperscaler-mvp-design.md](../specs/2026-05-10-hyperscaler-mvp-design.md) — sections §3.2, §4, §10 (humor)

**Plan series:**
- ✅ Plan 1: Infra + Game Core (deployed v0.1.0-plan1-infra-core)
- **Plan 2 (this):** AI engine + Shift-mode — ~3 weeks, 14 tasks
- Plan 3: Monetization + i18n + events + polish — coming

---

## File Structure

**New files:**
```
src/lib/ai/
├── workers-ai.ts             # Workers AI client (chat + embed)
├── persona-prompts.ts        # 8 archetype prompt-templates (humor-rich)
├── ticket-generator.ts       # AI-driven ticket-spawn
├── reply-generator.ts        # AI customer-reply during shift
└── vectorize.ts              # embed + recall customer memory

src/lib/game/
├── shift-state.ts            # shift state-machine + types
├── action-handler.ts         # refund/escalate/investigate/close logic
└── llm-cap.ts                # per-user daily LLM budget tracker

src/durable-objects/
└── shift-room.ts             # ShiftRoomDO — WS room, customer-NPC state

src/pages/api/shift/
├── start.ts                  # POST → DO bind, returns shiftId
└── [shiftId].ts              # GET → WS-upgrade, relays to DO

src/pages/play/
└── shift.astro               # shift-mode page

src/scripts/pos/  → src/scripts/shift/  (new dir)
└── shift-app.ts              # client WS + DOM-build (XSS-safe)

migrations/
└── 0002_llm_cap_and_shift.sql  # llm_usage daily counter, shift_history table
```

**Modified files:**
- `wrangler.toml` — add Workers AI, Vectorize, DO bindings
- `src/lib/game/customer-spawn.ts` — keep placeholder for tests, but tick.ts replaces with AI
- `src/lib/game/tick.ts` — call AI ticket-generator instead of placeholder
- `src/pages/api/auth/signup.ts` — bootstrap uses real AI for first 3 customers' tickets
- `src/pages/play/tickets.astro` — add "Start Shift" button
- `src/pages/play/index.astro` — show daily-LLM-cap status + Start-Shift CTA

**Test files (Vitest):**
```
src/lib/ai/__tests__/persona-prompts.test.ts
src/lib/ai/__tests__/ticket-generator.test.ts  (mock Workers AI)
src/lib/ai/__tests__/reply-generator.test.ts
src/lib/ai/__tests__/vectorize.test.ts
src/lib/game/__tests__/shift-state.test.ts
src/lib/game/__tests__/action-handler.test.ts
src/lib/game/__tests__/llm-cap.test.ts
```

---

## Tasks

### Task 1: wrangler.toml bindings + Vectorize index + migration 0002

**Files:**
- Modify: `/home/aika/navtycoon/wrangler.toml`
- Create: `/home/aika/navtycoon/migrations/0002_llm_cap_and_shift.sql`

- [ ] **Step 1: Add bindings to wrangler.toml**

Append to existing wrangler.toml:

```toml
# Workers AI (Llama-3.1-8b + bge-base embeddings)
[ai]
binding = "AI"

# Vectorize index for customer-memory (768-dim, cosine, bge-base)
[[vectorize]]
binding = "VECTORIZE"
index_name = "navtycoon-customer-memory"

# Durable Objects for shift-mode rooms
[[durable_objects.bindings]]
name = "SHIFT_ROOM"
class_name = "ShiftRoomDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["ShiftRoomDO"]
```

- [ ] **Step 2: Create Vectorize index via REST**

Per memory `feedback_d1_rest_api.md`: REST + Global Key.

```
POST https://api.cloudflare.com/client/v4/accounts/4e3646aaf967d8895e6596df2d62c3bf/vectorize/v2/indexes
Headers: X-Auth-Email, X-Auth-Key
Body:
{
  "name": "navtycoon-customer-memory",
  "config": {
    "dimensions": 768,
    "metric": "cosine"
  },
  "description": "Per-customer ticket memory (bge-base-en-v1.5 embeddings)"
}
```

If 409 (already exists), confirm + skip.

- [ ] **Step 3: Migration 0002**

```sql
-- migrations/0002_llm_cap_and_shift.sql
-- Plan 2: LLM-usage daily counter + shift_history

CREATE TABLE IF NOT EXISTS llm_usage (
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,            -- YYYY-MM-DD
  call_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, day)
);

CREATE TABLE IF NOT EXISTS shift_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  tickets_handled INTEGER NOT NULL DEFAULT 0,
  satisfaction_total INTEGER NOT NULL DEFAULT 0,
  refunds_given_cents INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,                 -- 'completed' | 'abandoned' | 'expired'
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shift_history_player ON shift_history(player_id, started_at DESC);
```

- [ ] **Step 4: Apply migration to PROD D1 via REST**

```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/b044638b-743d-4287-b0ee-181288b8c3a4/raw
Body: { "sql": "<contents of 0002 file>" }
```

- [ ] **Step 5: Verify**

```bash
# Verify Vectorize index
curl -s "https://api.cloudflare.com/client/v4/accounts/{account_id}/vectorize/v2/indexes" \
  -H "X-Auth-Email: ..." -H "X-Auth-Key: ..." | jq '.result[].name'
# Should include "navtycoon-customer-memory"

# Verify D1 schema
# Use wrangler or REST to query: SELECT name FROM sqlite_master WHERE type='table';
# Should now also include llm_usage + shift_history
```

- [ ] **Step 6: Commit**

```bash
cd /home/aika/navtycoon
git add wrangler.toml migrations/0002_llm_cap_and_shift.sql
git commit -m "feat(infra): Plan 2 bindings (AI, Vectorize, DO) + migration 0002 (llm_usage, shift_history)"
git push origin main
```

---

### Task 2: Persona prompts (8 archetypes, humor-rich)

**Files:**
- Create: `/home/aika/navtycoon/src/lib/ai/persona-prompts.ts`
- Create: `/home/aika/navtycoon/src/lib/ai/__tests__/persona-prompts.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/ai/__tests__/persona-prompts.test.ts
import { describe, it, expect } from 'vitest';
import { buildTicketPrompt, buildReplyPrompt, PERSONA_PROMPTS } from '../persona-prompts';
import type { PersonaArchetype } from '../../game/types';

describe('PERSONA_PROMPTS', () => {
  it('has all 8 archetypes', () => {
    const expected: PersonaArchetype[] = ['karen', 'newbie', 'pro', 'cheapskate', 'ghost', 'loyalist', 'drama', 'crypto'];
    for (const a of expected) {
      expect(PERSONA_PROMPTS[a]).toBeDefined();
      expect(PERSONA_PROMPTS[a].system_prompt.length).toBeGreaterThan(50);
    }
  });
});

describe('buildTicketPrompt', () => {
  it('includes persona + customer name + history', () => {
    const p = buildTicketPrompt({
      archetype: 'karen',
      customer_name: 'Anita Forbes',
      satisfaction: 30,
      past_summaries: ['Site went down for 2 hours last month — they refunded only 30%.'],
    });
    expect(p).toContain('Anita Forbes');
    expect(p).toContain('30');
    expect(p).toContain('refunded only 30');
  });

  it('handles empty history', () => {
    const p = buildTicketPrompt({
      archetype: 'newbie', customer_name: 'Bob', satisfaction: 60, past_summaries: [],
    });
    expect(p).toContain('Bob');
    expect(p.length).toBeGreaterThan(100);
  });
});

describe('buildReplyPrompt', () => {
  it('includes player message + persona + sentiment', () => {
    const p = buildReplyPrompt({
      archetype: 'cheapskate',
      customer_name: 'Carl',
      satisfaction: 40,
      ticket_subject: 'Refund request',
      conversation: [
        { role: 'customer', text: 'I want a refund.' },
        { role: 'player', text: 'I checked the logs, no downtime occurred.' },
      ],
    });
    expect(p).toContain('Carl');
    expect(p).toContain('refund');
    expect(p).toContain('checked the logs');
  });
});
```

- [ ] **Step 2: Run, FAIL**

```bash
cd /home/aika/navtycoon
npm test -- src/lib/ai/__tests__/persona-prompts.test.ts
```

Expected: FAIL ("Cannot find module '../persona-prompts'").

- [ ] **Step 3: Implement**

```typescript
// src/lib/ai/persona-prompts.ts
import type { PersonaArchetype } from '../game/types';

export interface PersonaPromptSet {
  system_prompt: string;        // base persona description for system role
  voice_rules: string;          // tone + style instructions
}

export const PERSONA_PROMPTS: Record<PersonaArchetype, PersonaPromptSet> = {
  karen: {
    system_prompt: 'You are an irate, entitled customer who escalates everything. Real name optional, but "I want to speak to your manager" is your default. You do NOT understand technology, but you understand RIGHTS.',
    voice_rules: 'Use ALL CAPS at least once per message. Threaten Twitter, your lawyer, or your nephew "who works in IT". Short, accusatory sentences. Never apologize. End with veiled threats or demands for compensation.',
  },
  newbie: {
    system_prompt: 'You are a confused customer who set up a website yesterday. You don\'t know what a "domain" is. You think "FTP" might be a kind of pasta.',
    voice_rules: 'Confuse technical terms (call "database" the "WordPress thingy", "cookies" the "browser snacks"). Be polite, apologetic, and very lost. Ask questions a senior dev would never expect. Use "thingy", "stuff", "the thing".',
  },
  pro: {
    system_prompt: 'You are a senior backend engineer who runs your own SaaS. You know more about HTTP than the support team. You are technically right and slightly insufferable.',
    voice_rules: 'Quote man-pages, RFC numbers, or kernel-version specifics. Mention obscure CLI flags. Sigh in writing ("As any sysadmin knows..."). Be polite but condescending. Include code snippets or curl commands when relevant.',
  },
  cheapskate: {
    system_prompt: 'You are a customer who tracks every cent and looks for refunds, discounts, or promo codes constantly. You know what every competitor charges.',
    voice_rules: 'Reference competitor pricing. Demand pro-rated refunds for every micro-incident. Mention you "could switch any time". Use specific dollar amounts. Frequently bring up "value for money".',
  },
  ghost: {
    system_prompt: 'You are a customer who barely interacts. You went silent months ago. Your tickets are short, vague, possibly pre-departure.',
    voice_rules: 'Use 1-3 sentences max. Vague language ("not working", "weird"). Drop the conversation midway. Random punctuation. Sometimes just "...".',
  },
  loyalist: {
    system_prompt: 'You are a happy long-time customer who likes the team. You sometimes write in just to praise. When you do complain, it\'s gentle and constructive.',
    voice_rules: 'Friendly tone. Use first names if known. Compliment past help. Frame complaints as questions. Add ❤️ or 🙏 emoji. Mention you\'ve been a customer for years.',
  },
  drama: {
    system_prompt: 'You are a customer who treats every minor issue as catastrophic. You post on social media. You write blog posts about service experiences.',
    voice_rules: 'Use emotionally charged language ("absolutely devastating", "soul-crushing"). Reference your "audience" or "followers". Threaten to write about this on Twitter / Medium / TikTok. Self-aggrandizing.',
  },
  crypto: {
    system_prompt: 'You are a Web3-obsessed customer running suspicious high-traffic workloads. You speak fluent crypto-Twitter.',
    voice_rules: 'Use "gm", "wagmi", "ngmi", "bullish", "ser", "anon". Refer to your project as "the alpha". Ask for crypto-payment options. Be evasive about what you actually run on the server. Reference your "discord" or "DAO".',
  },
};

export interface TicketPromptInput {
  archetype: PersonaArchetype;
  customer_name: string;
  satisfaction: number;          // -100..+100
  past_summaries: string[];      // last N ticket summaries
  current_event?: string;        // optional context (e.g. "viral_blog active")
}

export function buildTicketPrompt(i: TicketPromptInput): string {
  const persona = PERSONA_PROMPTS[i.archetype];
  const sentiment = i.satisfaction >= 60 ? 'happy' : i.satisfaction >= 30 ? 'neutral' : 'angry';
  const memoryBlock = i.past_summaries.length > 0
    ? `Past complaints/issues you remember:\n${i.past_summaries.map(s => `- ${s}`).join('\n')}\n\n`
    : 'You have no notable past issues with this host.\n\n';
  const eventBlock = i.current_event ? `Current situation: ${i.current_event}\n\n` : '';

  return `${persona.system_prompt}

VOICE RULES: ${persona.voice_rules}

Your name: ${i.customer_name}
Your current sentiment: ${sentiment} (satisfaction: ${i.satisfaction}/100)

${memoryBlock}${eventBlock}Now write a NEW support ticket — a single message to the host. 1-3 sentences. Stay in character. The ticket should reflect your personality, satisfaction, and history. Output the ticket text ONLY (no metadata, no quotes, no "Subject:" line).`;
}

export interface ReplyPromptInput {
  archetype: PersonaArchetype;
  customer_name: string;
  satisfaction: number;
  ticket_subject: string;
  conversation: { role: 'customer' | 'player'; text: string }[];
  last_action?: 'refund_30' | 'refund_50' | 'refund_100' | 'escalate' | 'investigate' | 'close';
}

export function buildReplyPrompt(i: ReplyPromptInput): string {
  const persona = PERSONA_PROMPTS[i.archetype];
  const convo = i.conversation.map(m =>
    m.role === 'customer' ? `${i.customer_name}: ${m.text}` : `Support: ${m.text}`,
  ).join('\n');
  const actionContext = i.last_action ? `\nThe support agent just took action: ${i.last_action.replace('_', ' ')}.` : '';

  return `${persona.system_prompt}

VOICE RULES: ${persona.voice_rules}

You (${i.customer_name}) opened a support ticket about: ${i.ticket_subject}.
Current satisfaction: ${i.satisfaction}/100.

Conversation so far:
${convo}${actionContext}

Now write your NEXT reply to the support agent. 1-2 sentences. Stay in character. React to their last message AND any action they took. Output the reply text ONLY.`;
}
```

- [ ] **Step 4: Run, PASS**

```bash
npm test -- src/lib/ai/__tests__/persona-prompts.test.ts
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/persona-prompts.ts src/lib/ai/__tests__/persona-prompts.test.ts
git commit -m "feat(ai): persona-prompt templates for 8 archetypes (humor-rich)"
git push origin main
```

---

### Task 3: Workers AI client wrappers

**Files:**
- Create: `/home/aika/navtycoon/src/lib/ai/workers-ai.ts`
- Create: `/home/aika/navtycoon/src/lib/ai/__tests__/workers-ai.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/ai/__tests__/workers-ai.test.ts
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

  it('truncates oversized response and returns string', async () => {
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
});
```

- [ ] **Step 2: Run FAIL**

```bash
npm test -- src/lib/ai/__tests__/workers-ai.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/ai/workers-ai.ts
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
```

- [ ] **Step 4: Run PASS**

```bash
npm test -- src/lib/ai/__tests__/workers-ai.test.ts
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/workers-ai.ts src/lib/ai/__tests__/workers-ai.test.ts
git commit -m "feat(ai): Workers AI wrappers (chat + embed)"
git push origin main
```

---

### Task 4: LLM cap (per-user daily budget tracker)

**Files:**
- Create: `/home/aika/navtycoon/src/lib/game/llm-cap.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/llm-cap.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/game/__tests__/llm-cap.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { tryConsumeLlmCall, getLlmUsageToday, FREE_DAILY_CAP, PRO_DAILY_CAP } from '../llm-cap';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer } from '../db';

describe('tryConsumeLlmCall', () => {
  let db: D1Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('free user can consume up to FREE_DAILY_CAP times', async () => {
    await createPlayer(db, { user_id: 'u1', company_name: 'A', city: null });
    for (let i = 0; i < FREE_DAILY_CAP; i++) {
      const ok = await tryConsumeLlmCall(db, 'u1', false);
      expect(ok).toBe(true);
    }
    const overflow = await tryConsumeLlmCall(db, 'u1', false);
    expect(overflow).toBe(false);
  });

  it('pro user gets PRO_DAILY_CAP', async () => {
    await createPlayer(db, { user_id: 'u2', company_name: 'B', city: null });
    for (let i = 0; i < PRO_DAILY_CAP; i++) {
      expect(await tryConsumeLlmCall(db, 'u2', true)).toBe(true);
    }
    expect(await tryConsumeLlmCall(db, 'u2', true)).toBe(false);
  });

  it('per-user isolation', async () => {
    await createPlayer(db, { user_id: 'u3', company_name: 'C', city: null });
    await createPlayer(db, { user_id: 'u4', company_name: 'D', city: null });
    for (let i = 0; i < FREE_DAILY_CAP; i++) {
      await tryConsumeLlmCall(db, 'u3', false);
    }
    expect(await tryConsumeLlmCall(db, 'u3', false)).toBe(false);
    expect(await tryConsumeLlmCall(db, 'u4', false)).toBe(true);
  });

  it('getLlmUsageToday reports current count', async () => {
    await createPlayer(db, { user_id: 'u5', company_name: 'E', city: null });
    await tryConsumeLlmCall(db, 'u5', false);
    await tryConsumeLlmCall(db, 'u5', false);
    expect(await getLlmUsageToday(db, 'u5')).toBe(2);
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/lib/game/llm-cap.ts
// Per-user daily LLM-call budget. Free=5/day, Pro=50/day. UPSERT-pattern.

export const FREE_DAILY_CAP = 5;
export const PRO_DAILY_CAP = 50;

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function tryConsumeLlmCall(
  db: D1Database, playerId: string, isPro: boolean,
): Promise<boolean> {
  const day = todayKey();
  const cap = isPro ? PRO_DAILY_CAP : FREE_DAILY_CAP;
  // Atomic UPSERT-then-check
  const r = await db.prepare(`
    INSERT INTO llm_usage (player_id, day, call_count) VALUES (?, ?, 1)
    ON CONFLICT (player_id, day) DO UPDATE SET call_count = call_count + 1
    RETURNING call_count
  `).bind(playerId, day).first<{ call_count: number }>();
  const newCount = r?.call_count ?? 0;
  if (newCount > cap) {
    // Refund the increment
    await db.prepare(`
      UPDATE llm_usage SET call_count = call_count - 1 WHERE player_id = ? AND day = ?
    `).bind(playerId, day).run();
    return false;
  }
  return true;
}

export async function getLlmUsageToday(db: D1Database, playerId: string): Promise<number> {
  const r = await db.prepare(`
    SELECT call_count FROM llm_usage WHERE player_id = ? AND day = ?
  `).bind(playerId, todayKey()).first<{ call_count: number }>();
  return r?.call_count ?? 0;
}

export function getDailyCap(isPro: boolean): number {
  return isPro ? PRO_DAILY_CAP : FREE_DAILY_CAP;
}
```

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/llm-cap.ts src/lib/game/__tests__/llm-cap.test.ts
git commit -m "feat(game): per-user daily LLM-call cap (free=5, pro=50)"
git push origin main
```

---

### Task 5: Vectorize wrappers (embed + recall)

**Files:**
- Create: `/home/aika/navtycoon/src/lib/ai/vectorize.ts`
- Create: `/home/aika/navtycoon/src/lib/ai/__tests__/vectorize.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/ai/__tests__/vectorize.test.ts
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
      topK: 3,
      filter: { customer_id: 7 },
      returnMetadata: 'all',
    }));
  });

  it('returns empty array when no matches', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ data: [Array(768).fill(0.1)] }) } as unknown as WorkersAIBinding;
    const vectorize = { query: vi.fn().mockResolvedValue({ matches: [] }) } as unknown as VectorizeBinding;
    const r = await recallCustomerMemory(ai, vectorize, 99, 'x');
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/lib/ai/vectorize.ts
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
    topK,
    filter: { customer_id },
    returnMetadata: 'all',
  });
  return (result.matches ?? []).map(m => ({
    ticket_id: Number(m.metadata?.ticket_id ?? 0),
    summary: String(m.metadata?.summary ?? ''),
    sentiment: String(m.metadata?.sentiment ?? 'neutral'),
    score: m.score,
  }));
}
```

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/vectorize.ts src/lib/ai/__tests__/vectorize.test.ts
git commit -m "feat(ai): Vectorize wrappers (storeTicketMemory + recallCustomerMemory)"
git push origin main
```

---

### Task 6: Ticket-generator (AI-driven, replaces placeholder in cron)

**Files:**
- Create: `/home/aika/navtycoon/src/lib/ai/ticket-generator.ts`
- Create: `/home/aika/navtycoon/src/lib/ai/__tests__/ticket-generator.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/ai/__tests__/ticket-generator.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateAiTicket } from '../ticket-generator';
import type { WorkersAIBinding } from '../workers-ai';
import type { VectorizeBinding } from '../vectorize';

describe('generateAiTicket', () => {
  const ai = {
    run: vi.fn().mockImplementation((model: string) => {
      if (model.includes('embed')) return Promise.resolve({ data: [Array(768).fill(0.1)] });
      return Promise.resolve({ response: 'My site is down again. This is the third time this week.' });
    }),
  } as unknown as WorkersAIBinding;

  const vectorize = {
    query: vi.fn().mockResolvedValue({ matches: [] }),
    upsert: vi.fn().mockResolvedValue({ count: 1 }),
  } as unknown as VectorizeBinding;

  it('returns a non-empty ticket text', async () => {
    const r = await generateAiTicket(ai, vectorize, {
      customer_id: 1,
      customer_name: 'Test User',
      archetype: 'karen',
      satisfaction: 30,
    });
    expect(r.full_text.length).toBeGreaterThan(10);
    expect(r.summary.length).toBeGreaterThan(5);
    expect(r.summary.length).toBeLessThanOrEqual(80);
  });

  it('queries customer memory for context', async () => {
    await generateAiTicket(ai, vectorize, {
      customer_id: 42, customer_name: 'A', archetype: 'newbie', satisfaction: 50,
    });
    expect(vectorize.query).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      filter: { customer_id: 42 },
    }));
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/lib/ai/ticket-generator.ts
import { generateChatResponse, type WorkersAIBinding } from './workers-ai';
import { recallCustomerMemory, type VectorizeBinding } from './vectorize';
import { buildTicketPrompt } from './persona-prompts';
import type { PersonaArchetype } from '../game/types';

export interface GenerateTicketInput {
  customer_id: number;
  customer_name: string;
  archetype: PersonaArchetype;
  satisfaction: number;
  current_event?: string;
}

export interface GeneratedTicket {
  summary: string;        // first 80 chars
  full_text: string;
}

export async function generateAiTicket(
  ai: WorkersAIBinding,
  vectorize: VectorizeBinding,
  input: GenerateTicketInput,
): Promise<GeneratedTicket> {
  // Recall up to 3 past tickets to inject as context
  const memories = await recallCustomerMemory(ai, vectorize, input.customer_id, 'recent issue', 3).catch(() => []);
  const past_summaries = memories.map(m => m.summary);

  const prompt = buildTicketPrompt({
    archetype: input.archetype,
    customer_name: input.customer_name,
    satisfaction: input.satisfaction,
    past_summaries,
    current_event: input.current_event,
  });

  const text = await generateChatResponse(
    ai,
    'You are role-playing as a customer of a hosting company. Stay in character. Output the customer message ONLY.',
    prompt,
    { max_tokens: 200, temperature: 0.95 },
  );

  const cleanText = text.trim().replace(/^["'`]|["'`]$/g, '');
  return {
    summary: cleanText.slice(0, 80).replace(/\n.*$/s, ''),
    full_text: cleanText,
  };
}
```

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/ticket-generator.ts src/lib/ai/__tests__/ticket-generator.test.ts
git commit -m "feat(ai): AI-driven ticket-generator (Workers AI + Vectorize-recall)"
git push origin main
```

---

### Task 7: Reply-generator (in-shift AI customer replies)

**Files:**
- Create: `/home/aika/navtycoon/src/lib/ai/reply-generator.ts`
- Create: `/home/aika/navtycoon/src/lib/ai/__tests__/reply-generator.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/ai/__tests__/reply-generator.test.ts
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
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/lib/ai/reply-generator.ts
import { generateChatResponse, type WorkersAIBinding } from './workers-ai';
import { buildReplyPrompt, type ReplyPromptInput } from './persona-prompts';
import type { PersonaArchetype } from '../game/types';

export async function generateAiReply(
  ai: WorkersAIBinding,
  input: ReplyPromptInput,
): Promise<string> {
  const prompt = buildReplyPrompt(input);
  const text = await generateChatResponse(
    ai,
    'You are role-playing as a customer responding to support. Stay in character. 1-2 sentences. Output the reply text ONLY.',
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
  delta: number;       // -50..+50
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

  // Extract JSON (handle ```json fences or stray text)
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
```

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/reply-generator.ts src/lib/ai/__tests__/reply-generator.test.ts
git commit -m "feat(ai): AI reply-generator + player-response sentiment rating"
git push origin main
```

---

### Task 8: Replace tick.ts placeholder with AI ticket-spawn

**Files:**
- Modify: `/home/aika/navtycoon/src/lib/game/tick.ts`
- Modify: `/home/aika/navtycoon/src/lib/game/__tests__/tick.test.ts`

- [ ] **Step 1: Read existing tick.ts to understand the structure**

```bash
cat /home/aika/navtycoon/src/lib/game/tick.ts
```

The current ticket-spawn block uses `getPlaceholderTicketForPersona`. Replace that ONLY with AI-driven generation. KEEP the placeholder fallback path for when AI is unavailable (test-mode, env missing, or LLM-cap exhausted).

- [ ] **Step 2: New tick.ts**

```typescript
// src/lib/game/tick.ts
// Run every 5 minutes by Cron Trigger.
import type { Player, PersonaArchetype } from './types';
import { getPlaceholderTicketForPersona } from './customer-spawn';
import { generateAiTicket } from '../ai/ticket-generator';
import { storeTicketMemory } from '../ai/vectorize';
import { tryConsumeLlmCall } from './llm-cap';
import type { WorkersAIBinding } from '../ai/workers-ai';
import type { VectorizeBinding } from '../ai/vectorize';

const TICK_MINUTES = 5;
const CHURN_HOURS = 48;
const TICKET_SPAWN_PROB_PER_TICK = 0.004;
const CHURN_ROLL_PROB = 0.30;
const RANDOM_EVENT_PROB_PER_TICK = 0.007;

const EVENT_TYPES = ['ddos_attempt', 'viral_blog', 'electricity_spike', 'recruit_ad', 'intern_incident', 'dmca', 'cooling_failure', 'security_breach'] as const;

export interface TickResult {
  player_id: string;
  tickets_spawned: number;
  ai_tickets: number;
  placeholder_tickets: number;
  money_added_cents: number;
  churned: number;
  events_spawned: number;
}

export interface TickEnv {
  ai?: WorkersAIBinding;
  vectorize?: VectorizeBinding;
}

export async function tickPlayer(
  db: D1Database,
  player: Player,
  now: number,
  env: TickEnv = {},
): Promise<TickResult> {
  let ticketsSpawned = 0;
  let aiTickets = 0;
  let placeholderTickets = 0;
  let moneyAdded = 0;
  let churned = 0;
  let eventsSpawned = 0;

  // 1. Money trickle
  if (player.mrr_usd_cents > 0) {
    moneyAdded = Math.round(player.mrr_usd_cents * (TICK_MINUTES / (60 * 24 * 30)));
    if (moneyAdded > 0) {
      await db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?')
        .bind(moneyAdded, player.user_id).run();
    }
  }

  // 2. Active customers
  const customers = await db.prepare(`
    SELECT id, persona_archetype, satisfaction, last_ticket_at, plan_tier, churn_risk, name
    FROM customers WHERE player_id = ? AND is_active = 1
  `).bind(player.user_id).all<{
    id: number; persona_archetype: string; satisfaction: number;
    last_ticket_at: number | null; plan_tier: string; churn_risk: number; name: string;
  }>();

  // 3. Ticket spawn — AI if available + budget allows, else placeholder
  for (const c of customers.results ?? []) {
    if (Math.random() >= TICKET_SPAWN_PROB_PER_TICK) continue;

    let summary = '';
    let fullText = '';
    let usedAi = false;

    const canUseAi = !!env.ai && !!env.vectorize;
    if (canUseAi) {
      const isPro = player.is_pro === 1;
      const allowed = await tryConsumeLlmCall(db, player.user_id, isPro);
      if (allowed) {
        try {
          const t = await generateAiTicket(env.ai!, env.vectorize!, {
            customer_id: c.id,
            customer_name: c.name,
            archetype: c.persona_archetype as PersonaArchetype,
            satisfaction: c.satisfaction,
          });
          summary = t.summary;
          fullText = t.full_text;
          usedAi = true;
        } catch {
          // fall through to placeholder
        }
      }
    }

    if (!usedAi) {
      const placeholder = getPlaceholderTicketForPersona(c.persona_archetype as PersonaArchetype);
      summary = placeholder.slice(0, 80);
      fullText = placeholder;
    }

    const ticketRes = await db.prepare(`
      INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at)
      VALUES (?, ?, ?, ?, 'open', ?)
      RETURNING id
    `).bind(c.id, player.user_id, summary, fullText, now).first<{ id: number }>();
    await db.prepare('UPDATE customers SET last_ticket_at = ? WHERE id = ?').bind(now, c.id).run();

    // Store memory if AI was used and we have ticket id
    if (usedAi && ticketRes && env.vectorize && env.ai) {
      const sentiment = c.satisfaction >= 60 ? 'positive' : c.satisfaction >= 30 ? 'neutral' : 'negative';
      try {
        await storeTicketMemory(env.ai, env.vectorize, {
          ticket_id: ticketRes.id,
          customer_id: c.id,
          summary,
          sentiment,
          era_id: player.current_era,
        });
      } catch { /* non-blocking */ }
    }

    ticketsSpawned++;
    if (usedAi) aiTickets++; else placeholderTickets++;
  }

  // 4. Churn
  const churnCandidates = await db.prepare(`
    SELECT c.id FROM customers c
    JOIN tickets t ON t.customer_id = c.id
    WHERE c.player_id = ? AND c.is_active = 1
      AND t.status IN ('open', 'in_progress')
      AND t.created_at < ?
    GROUP BY c.id
  `).bind(player.user_id, now - CHURN_HOURS * 3600).all<{ id: number }>();

  for (const row of churnCandidates.results ?? []) {
    if (Math.random() < CHURN_ROLL_PROB) {
      await db.prepare('UPDATE customers SET is_active = 0, churn_risk = 100 WHERE id = ?').bind(row.id).run();
      churned++;
    }
  }

  // 5. MRR recompute
  const mrrRow = await db.prepare(`
    SELECT
      SUM(CASE WHEN plan_tier = 'hobby' THEN ? WHEN plan_tier = 'business' THEN ? ELSE 0 END) AS mrr
    FROM customers WHERE player_id = ? AND is_active = 1
  `).bind(player.pricing_hobby_cents, player.pricing_business_cents, player.user_id).first<{ mrr: number }>();
  const newMrr = mrrRow?.mrr ?? 0;
  if (newMrr !== player.mrr_usd_cents) {
    await db.prepare('UPDATE players SET mrr_usd_cents = ? WHERE user_id = ?').bind(newMrr, player.user_id).run();
  }

  // 6. Random event
  if (Math.random() < RANDOM_EVENT_PROB_PER_TICK) {
    const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
    await db.prepare('INSERT INTO events (player_id, event_type, spawned_at) VALUES (?, ?, ?)')
      .bind(player.user_id, type, now).run();
    eventsSpawned++;
  }

  return {
    player_id: player.user_id,
    tickets_spawned: ticketsSpawned,
    ai_tickets: aiTickets,
    placeholder_tickets: placeholderTickets,
    money_added_cents: moneyAdded,
    churned,
    events_spawned: eventsSpawned,
  };
}

export async function tickAllActivePlayers(
  db: D1Database, now: number,
  env: TickEnv = {},
  idleCutoffSec = 7 * 24 * 3600,
): Promise<TickResult[]> {
  const cutoff = now - idleCutoffSec;
  const players = await db.prepare(
    'SELECT * FROM players WHERE last_active_at >= ?'
  ).bind(cutoff).all<Player>();
  const out: TickResult[] = [];
  for (const p of players.results ?? []) {
    out.push(await tickPlayer(db, p, now, env));
  }
  return out;
}
```

- [ ] **Step 3: Update existing tick test (no env passed → falls back to placeholder)**

The existing tests in `src/lib/game/__tests__/tick.test.ts` don't pass `env`, so the fallback path runs. Tests should still PASS.

```bash
npm test -- src/lib/game/__tests__/tick.test.ts
```

Add an additional test for the AI path:

```typescript
// Append to tick.test.ts
import { vi } from 'vitest';
import type { WorkersAIBinding } from '../../ai/workers-ai';
import type { VectorizeBinding } from '../../ai/vectorize';

it('uses AI when env.ai + env.vectorize provided and budget allows', async () => {
  const db2 = await createTestDb();
  await createPlayer(db2, { user_id: 'u-ai', company_name: 'AI Inc', city: null });
  const now = 1715000000;
  // Insert 1 customer guaranteed to spawn (override Math.random for determinism)
  await db2.prepare(`
    INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction)
    VALUES (?, 'Karen Test', 'karen', 'hobby', ?, 30)
  `).bind('u-ai', now).run();

  const ai = {
    run: vi.fn().mockImplementation((model: string) => {
      if (model.includes('embed')) return Promise.resolve({ data: [Array(768).fill(0.1)] });
      return Promise.resolve({ response: 'AI-GENERATED ANGRY MESSAGE' });
    }),
  } as unknown as WorkersAIBinding;
  const vectorize = {
    query: vi.fn().mockResolvedValue({ matches: [] }),
    upsert: vi.fn().mockResolvedValue({ count: 1 }),
  } as unknown as VectorizeBinding;

  // Force ticket-spawn by mocking Math.random to return < 0.004
  const origRandom = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return calls === 1 ? 0.001 : 0.5; };  // first call passes spawn-gate

  try {
    const player = await getPlayer(db2, 'u-ai');
    if (!player) throw new Error('player gone');
    const result = await tickPlayer(db2, player, now, { ai, vectorize });
    expect(result.tickets_spawned).toBe(1);
    expect(result.ai_tickets).toBe(1);
    const tickets = await db2.prepare('SELECT full_text FROM tickets WHERE player_id = ?').bind('u-ai').all();
    expect((tickets.results?.[0] as any).full_text).toBe('AI-GENERATED ANGRY MESSAGE');
  } finally {
    Math.random = origRandom;
  }
});
```

- [ ] **Step 4: Run, all pass**

```bash
npm test 2>&1 | tail -5
```

Expected: previous 53 + new tests = 54 (or 55 with the embed-call check) all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/tick.ts src/lib/game/__tests__/tick.test.ts
git commit -m "feat(game): tick.ts uses AI ticket-generator when env+budget available; falls back to placeholder"
git push origin main
```

---

### Task 9: Wire AI/Vectorize bindings into cron-tick + signup-bootstrap

**Files:**
- Modify: `/home/aika/navtycoon/src/pages/api/cron/tick.ts`
- Modify: `/home/aika/navtycoon/src/pages/api/auth/signup.ts`

- [ ] **Step 1: Update cron/tick.ts to pass env**

```typescript
// src/pages/api/cron/tick.ts
import type { APIContext } from 'astro';
import { getDB } from '../../../lib/auth';
import { tickAllActivePlayers } from '../../../lib/game/tick';
import type { WorkersAIBinding } from '../../../lib/ai/workers-ai';
import type { VectorizeBinding } from '../../../lib/ai/vectorize';

export const prerender = false;

export const POST = async (c: APIContext): Promise<Response> => {
  const secret = c.request.headers.get('x-cron-secret');
  const env = c.locals.runtime?.env as {
    CRON_SECRET?: string;
    AI?: WorkersAIBinding;
    VECTORIZE?: VectorizeBinding;
  };
  if (!env?.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const db = getDB(c);
  if (!db) return new Response('no DB', { status: 500 });
  const now = Math.floor(Date.now() / 1000);
  const results = await tickAllActivePlayers(db, now, {
    ai: env.AI,
    vectorize: env.VECTORIZE,
  });

  const totals = results.reduce((acc, r) => ({
    tickets: acc.tickets + r.tickets_spawned,
    ai_tickets: acc.ai_tickets + r.ai_tickets,
    placeholder_tickets: acc.placeholder_tickets + r.placeholder_tickets,
    money_cents: acc.money_cents + r.money_added_cents,
    churned: acc.churned + r.churned,
    events: acc.events + r.events_spawned,
  }), { tickets: 0, ai_tickets: 0, placeholder_tickets: 0, money_cents: 0, churned: 0, events: 0 });

  return new Response(JSON.stringify({
    ok: true, players_ticked: results.length, totals,
  }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Update signup-bootstrap to use AI for first 3 customers' tickets**

Read the existing `signup.ts` first to understand the bootstrap block. The change: replace the placeholder-only spawn for the 3 starter tickets with AI when bindings available. KEEP placeholder fallback.

In the bootstrap block (after `createPlayer`), the loop that creates 3 customers + tickets needs:

```typescript
// Existing imports + add:
import { generateAiTicket } from '../../../lib/ai/ticket-generator';
import { storeTicketMemory } from '../../../lib/ai/vectorize';
import { tryConsumeLlmCall } from '../../../lib/game/llm-cap';
import { spawnCustomer } from '../../../lib/game/customer-spawn';

// Inside POST handler, where bootstrap loop runs:
const env = c.locals.runtime?.env as {
  AI?: import('../../../lib/ai/workers-ai').WorkersAIBinding;
  VECTORIZE?: import('../../../lib/ai/vectorize').VectorizeBinding;
};

for (let i = 0; i < 3; i++) {
  const sc = spawnCustomer('hobby');
  const cRes = await db.prepare(`
    INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction, churn_risk)
    VALUES (?, ?, ?, 'hobby', ?, ?, 0)
    RETURNING id
  `).bind(userId, sc.name, sc.persona_archetype, now, sc.starting_satisfaction).first<{ id: number }>();
  if (!cRes) continue;

  let summary = sc.initial_ticket_text.slice(0, 80);
  let fullText = sc.initial_ticket_text;
  let usedAi = false;
  if (env.AI && env.VECTORIZE) {
    const allowed = await tryConsumeLlmCall(db, userId, false);
    if (allowed) {
      try {
        const t = await generateAiTicket(env.AI, env.VECTORIZE, {
          customer_id: cRes.id,
          customer_name: sc.name,
          archetype: sc.persona_archetype,
          satisfaction: sc.starting_satisfaction,
        });
        summary = t.summary;
        fullText = t.full_text;
        usedAi = true;
      } catch { /* fall back */ }
    }
  }

  const tRes = await db.prepare(`
    INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at)
    VALUES (?, ?, ?, ?, 'open', ?)
    RETURNING id
  `).bind(cRes.id, userId, summary, fullText, now).first<{ id: number }>();

  if (usedAi && tRes && env.AI && env.VECTORIZE) {
    const sentiment = sc.starting_satisfaction >= 60 ? 'positive' : sc.starting_satisfaction >= 30 ? 'neutral' : 'negative';
    try {
      await storeTicketMemory(env.AI, env.VECTORIZE, {
        ticket_id: tRes.id, customer_id: cRes.id,
        summary, sentiment, era_id: 1,
      });
    } catch { /* non-blocking */ }
  }
}
```

- [ ] **Step 3: Smoke build**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: build clean, all tests still pass (binding-less paths use fallback).

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/cron/tick.ts src/pages/api/auth/signup.ts
git commit -m "feat(game): wire Workers AI + Vectorize into cron-tick + signup-bootstrap"
git push origin main
```

---

### Task 10: Shift state-machine + action-handler

**Files:**
- Create: `/home/aika/navtycoon/src/lib/game/shift-state.ts`
- Create: `/home/aika/navtycoon/src/lib/game/action-handler.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/shift-state.test.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/action-handler.test.ts`

- [ ] **Step 1: Shift-state types + tests**

```typescript
// src/lib/game/shift-state.ts
import type { PersonaArchetype } from './types';

export interface ShiftCustomerState {
  ticket_id: number;
  customer_id: number;
  customer_name: string;
  archetype: PersonaArchetype;
  current_satisfaction: number;
  ticket_subject: string;
  conversation: { role: 'customer' | 'player'; text: string; ts: number }[];
  status: 'pending' | 'active' | 'resolved' | 'abandoned';
  satisfaction_delta_total: number;
  refund_given_cents: number;
}

export interface ShiftState {
  shift_id: string;
  player_id: string;
  started_at: number;
  expires_at: number;          // started + 30min default
  status: 'active' | 'completed' | 'expired' | 'abandoned';
  queue: ShiftCustomerState[];
  active_index: number;        // -1 if no active
  tickets_handled: number;
}

export const SHIFT_DURATION_SEC = 30 * 60;

export function isShiftExpired(s: ShiftState, now: number): boolean {
  return now >= s.expires_at && s.status === 'active';
}

export function getActiveCustomer(s: ShiftState): ShiftCustomerState | null {
  if (s.active_index < 0 || s.active_index >= s.queue.length) return null;
  return s.queue[s.active_index];
}

export function advanceToNext(s: ShiftState): boolean {
  for (let i = s.active_index + 1; i < s.queue.length; i++) {
    if (s.queue[i].status === 'pending') {
      s.active_index = i;
      s.queue[i].status = 'active';
      return true;
    }
  }
  s.active_index = -1;
  return false;
}
```

```typescript
// src/lib/game/__tests__/shift-state.test.ts
import { describe, it, expect } from 'vitest';
import { isShiftExpired, getActiveCustomer, advanceToNext, type ShiftState } from '../shift-state';

const baseState = (): ShiftState => ({
  shift_id: 's1', player_id: 'p1', started_at: 1000, expires_at: 2000,
  status: 'active', tickets_handled: 0, active_index: 0,
  queue: [
    { ticket_id: 1, customer_id: 1, customer_name: 'A', archetype: 'karen', current_satisfaction: 30, ticket_subject: 't', conversation: [], status: 'active', satisfaction_delta_total: 0, refund_given_cents: 0 },
    { ticket_id: 2, customer_id: 2, customer_name: 'B', archetype: 'newbie', current_satisfaction: 60, ticket_subject: 't', conversation: [], status: 'pending', satisfaction_delta_total: 0, refund_given_cents: 0 },
    { ticket_id: 3, customer_id: 3, customer_name: 'C', archetype: 'pro', current_satisfaction: 50, ticket_subject: 't', conversation: [], status: 'pending', satisfaction_delta_total: 0, refund_given_cents: 0 },
  ],
});

describe('shift-state', () => {
  it('isShiftExpired triggers after expires_at', () => {
    const s = baseState();
    expect(isShiftExpired(s, 1500)).toBe(false);
    expect(isShiftExpired(s, 2000)).toBe(true);
    s.status = 'completed';
    expect(isShiftExpired(s, 5000)).toBe(false);  // already done
  });

  it('getActiveCustomer returns active', () => {
    const s = baseState();
    expect(getActiveCustomer(s)?.customer_id).toBe(1);
    s.active_index = -1;
    expect(getActiveCustomer(s)).toBeNull();
  });

  it('advanceToNext moves to next pending and marks active', () => {
    const s = baseState();
    s.queue[0].status = 'resolved';
    const ok = advanceToNext(s);
    expect(ok).toBe(true);
    expect(s.active_index).toBe(1);
    expect(s.queue[1].status).toBe('active');
  });

  it('advanceToNext returns false when no more pending', () => {
    const s = baseState();
    s.queue.forEach(q => q.status = 'resolved');
    const ok = advanceToNext(s);
    expect(ok).toBe(false);
    expect(s.active_index).toBe(-1);
  });
});
```

- [ ] **Step 2: Action-handler**

```typescript
// src/lib/game/action-handler.ts
import type { ShiftCustomerState } from './shift-state';

export type ShiftAction = 'refund_30' | 'refund_50' | 'refund_100' | 'escalate' | 'investigate' | 'close';

export interface ActionResult {
  success: boolean;
  satisfaction_delta: number;
  cash_delta_cents: number;
  resolves_ticket: boolean;
  message: string;          // brief feedback for UI
}

const TIER_PRICE_CENTS = { hobby: 500, business: 1500, vps: 2500, dedicated: 12000 };

export function applyRefundAction(c: ShiftCustomerState, percent: 30 | 50 | 100, planPriceCents: number): ActionResult {
  const refund = Math.round(planPriceCents * (percent / 100));
  const delta = percent === 100 ? 35 : percent === 50 ? 20 : 10;
  return {
    success: true,
    satisfaction_delta: delta,
    cash_delta_cents: -refund,
    resolves_ticket: percent === 100,
    message: `Refunded $${(refund / 100).toFixed(2)} (${percent}%)`,
  };
}

export function applyEscalateAction(_c: ShiftCustomerState): ActionResult {
  // Escalate: $50 fee, +15 satisfaction
  return {
    success: true,
    satisfaction_delta: 15,
    cash_delta_cents: -5000,
    resolves_ticket: true,
    message: 'Escalated to senior engineer ($50)',
  };
}

export function applyInvestigateAction(_c: ShiftCustomerState): ActionResult {
  // Free, +5 sat (lets player buy time + show effort)
  return {
    success: true,
    satisfaction_delta: 5,
    cash_delta_cents: 0,
    resolves_ticket: false,
    message: 'Logs scanned. Findings shared.',
  };
}

export function applyCloseAction(c: ShiftCustomerState): ActionResult {
  // If sat ≥ 50: success. If <30: dangerous (-30). 30-50: neutral.
  const delta = c.current_satisfaction >= 50 ? 5 : c.current_satisfaction >= 30 ? 0 : -30;
  return {
    success: true,
    satisfaction_delta: delta,
    cash_delta_cents: 0,
    resolves_ticket: true,
    message: c.current_satisfaction < 30 ? 'Closed without resolution. They are FURIOUS.' : 'Ticket closed.',
  };
}

export function applyAction(c: ShiftCustomerState, action: ShiftAction, planTier: keyof typeof TIER_PRICE_CENTS): ActionResult {
  const price = TIER_PRICE_CENTS[planTier] ?? TIER_PRICE_CENTS.hobby;
  switch (action) {
    case 'refund_30': return applyRefundAction(c, 30, price);
    case 'refund_50': return applyRefundAction(c, 50, price);
    case 'refund_100': return applyRefundAction(c, 100, price);
    case 'escalate':  return applyEscalateAction(c);
    case 'investigate': return applyInvestigateAction(c);
    case 'close': return applyCloseAction(c);
  }
}
```

```typescript
// src/lib/game/__tests__/action-handler.test.ts
import { describe, it, expect } from 'vitest';
import { applyAction } from '../action-handler';
import type { ShiftCustomerState } from '../shift-state';

const c = (sat: number): ShiftCustomerState => ({
  ticket_id: 1, customer_id: 1, customer_name: 'X', archetype: 'karen',
  current_satisfaction: sat, ticket_subject: 't', conversation: [],
  status: 'active', satisfaction_delta_total: 0, refund_given_cents: 0,
});

describe('applyAction', () => {
  it('refund_30 hobby = -150 cents, +10 sat, not-resolved', () => {
    const r = applyAction(c(40), 'refund_30', 'hobby');
    expect(r.cash_delta_cents).toBe(-150);
    expect(r.satisfaction_delta).toBe(10);
    expect(r.resolves_ticket).toBe(false);
  });

  it('refund_100 resolves ticket', () => {
    const r = applyAction(c(50), 'refund_100', 'business');
    expect(r.resolves_ticket).toBe(true);
    expect(r.cash_delta_cents).toBe(-1500);
  });

  it('escalate: $50 fee, +15 sat, resolves', () => {
    const r = applyAction(c(20), 'escalate', 'hobby');
    expect(r.cash_delta_cents).toBe(-5000);
    expect(r.satisfaction_delta).toBe(15);
    expect(r.resolves_ticket).toBe(true);
  });

  it('close on low-sat customer = -30 sat penalty', () => {
    const r = applyAction(c(20), 'close', 'hobby');
    expect(r.satisfaction_delta).toBe(-30);
  });

  it('close on satisfied customer = +5', () => {
    const r = applyAction(c(70), 'close', 'hobby');
    expect(r.satisfaction_delta).toBe(5);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- src/lib/game/__tests__/shift-state.test.ts src/lib/game/__tests__/action-handler.test.ts
```

Expected: 4 + 5 = 9 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/shift-state.ts src/lib/game/action-handler.ts src/lib/game/__tests__/shift-state.test.ts src/lib/game/__tests__/action-handler.test.ts
git commit -m "feat(game): shift state-machine + action-handler (refund/escalate/investigate/close)"
git push origin main
```

---

### Task 11: ShiftRoomDO — Durable Object for shift-mode WS

**Files:**
- Create: `/home/aika/navtycoon/src/durable-objects/shift-room.ts`

This is the largest single Plan 2 file. The DO holds a `ShiftState`, accepts WebSocket connections, processes messages (player chat) + actions, calls Workers AI for replies + ratings.

- [ ] **Step 1: Implement ShiftRoomDO**

```typescript
// src/durable-objects/shift-room.ts
// Durable Object: hosts a shift-mode room. Single WS-connection per shift.
// Hibernates between messages.
import type { ShiftState, ShiftCustomerState } from '../lib/game/shift-state';
import { advanceToNext, isShiftExpired, SHIFT_DURATION_SEC } from '../lib/game/shift-state';
import { applyAction, type ShiftAction } from '../lib/game/action-handler';
import { generateAiReply, ratePlayerResponse } from '../lib/ai/reply-generator';
import { tryConsumeLlmCall } from '../lib/game/llm-cap';
import type { WorkersAIBinding } from '../lib/ai/workers-ai';

interface DurableEnv {
  AI?: WorkersAIBinding;
  DB: D1Database;
}

interface InitMessage {
  type: 'init';
  player_id: string;
  is_pro: boolean;
  shift_id: string;
  customers: {
    ticket_id: number; customer_id: number; customer_name: string;
    archetype: ShiftCustomerState['archetype']; current_satisfaction: number;
    ticket_subject: string; ticket_first_message: string;
  }[];
}

type WsInbound =
  | { type: 'msg'; text: string }
  | { type: 'action'; action: ShiftAction };

type WsOutbound =
  | { type: 'state'; state: ShiftState }
  | { type: 'reply'; ticket_id: number; text: string; satisfaction_delta: number; new_satisfaction: number }
  | { type: 'action_result'; ticket_id: number; result: { satisfaction_delta: number; cash_delta_cents: number; resolves_ticket: boolean; message: string } }
  | { type: 'shift_end'; summary: { tickets_handled: number; satisfaction_total: number; refunds_cents: number } }
  | { type: 'error'; error: string };

export class ShiftRoomDO {
  state: DurableObjectState;
  env: DurableEnv;
  shift: ShiftState | null = null;
  ws: WebSocket | null = null;

  constructor(state: DurableObjectState, env: DurableEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/init' && req.method === 'POST') {
      const init = await req.json() as InitMessage;
      const now = Math.floor(Date.now() / 1000);
      this.shift = {
        shift_id: init.shift_id,
        player_id: init.player_id,
        started_at: now,
        expires_at: now + SHIFT_DURATION_SEC,
        status: 'active',
        tickets_handled: 0,
        active_index: init.customers.length > 0 ? 0 : -1,
        queue: init.customers.map((c, i) => ({
          ticket_id: c.ticket_id,
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          archetype: c.archetype,
          current_satisfaction: c.current_satisfaction,
          ticket_subject: c.ticket_subject,
          conversation: [{ role: 'customer', text: c.ticket_first_message, ts: now }],
          status: i === 0 ? 'active' : 'pending',
          satisfaction_delta_total: 0,
          refund_given_cents: 0,
        })),
      };
      // Persist
      await this.state.storage.put('shift', this.shift);
      return new Response(JSON.stringify({ ok: true, shift_id: init.shift_id }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/ws') {
      const upgrade = req.headers.get('Upgrade');
      if (upgrade !== 'websocket') return new Response('expected WS', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ws = server;
      // Restore from storage
      if (!this.shift) this.shift = await this.state.storage.get<ShiftState>('shift') ?? null;
      server.accept();
      server.addEventListener('message', (e) => {
        void this.handleMessage(typeof e.data === 'string' ? e.data : '');
      });
      server.addEventListener('close', () => { this.ws = null; });
      // Send initial state
      if (this.shift) this.send({ type: 'state', state: this.shift });
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  send(msg: WsOutbound) {
    if (this.ws) this.ws.send(JSON.stringify(msg));
  }

  async handleMessage(raw: string) {
    if (!this.shift) {
      this.send({ type: 'error', error: 'no shift' });
      return;
    }
    if (isShiftExpired(this.shift, Math.floor(Date.now() / 1000))) {
      this.shift.status = 'expired';
      await this.state.storage.put('shift', this.shift);
      this.send({ type: 'shift_end', summary: this.summary() });
      return;
    }
    let m: WsInbound;
    try { m = JSON.parse(raw) as WsInbound; }
    catch { this.send({ type: 'error', error: 'bad json' }); return; }

    const active = this.shift.queue[this.shift.active_index];
    if (!active) {
      this.send({ type: 'error', error: 'no active customer' });
      return;
    }

    if (m.type === 'msg') {
      await this.handlePlayerMessage(active, m.text);
    } else if (m.type === 'action') {
      await this.handleAction(active, m.action);
    }
    await this.state.storage.put('shift', this.shift);
    this.send({ type: 'state', state: this.shift });
  }

  async handlePlayerMessage(c: ShiftCustomerState, text: string) {
    if (!this.shift) return;
    if (text.trim().length === 0) return;
    const now = Math.floor(Date.now() / 1000);
    c.conversation.push({ role: 'player', text: text.slice(0, 1000), ts: now });

    if (!this.env.AI) {
      this.send({ type: 'error', error: 'AI unavailable' });
      return;
    }

    // Budget check
    const isPro = await this.isPlayerPro();
    const budget = await tryConsumeLlmCall(this.env.DB, this.shift.player_id, isPro);
    if (!budget) {
      this.send({ type: 'error', error: 'daily LLM cap reached' });
      return;
    }

    // Rate the player message → satisfaction delta
    let delta = 0;
    try {
      const rating = await ratePlayerResponse(this.env.AI, {
        archetype: c.archetype,
        customer_name: c.customer_name,
        satisfaction: c.current_satisfaction,
        ticket_subject: c.ticket_subject,
        player_response: text,
      });
      delta = rating.delta;
    } catch { /* delta stays 0 */ }

    c.current_satisfaction = Math.max(-100, Math.min(100, c.current_satisfaction + delta));
    c.satisfaction_delta_total += delta;

    // Generate AI reply
    const reply = await generateAiReply(this.env.AI, {
      archetype: c.archetype,
      customer_name: c.customer_name,
      satisfaction: c.current_satisfaction,
      ticket_subject: c.ticket_subject,
      conversation: c.conversation.map(m => ({ role: m.role, text: m.text })),
    }).catch(() => 'I... I do not know what to say.');

    c.conversation.push({ role: 'customer', text: reply, ts: now });

    this.send({
      type: 'reply',
      ticket_id: c.ticket_id,
      text: reply,
      satisfaction_delta: delta,
      new_satisfaction: c.current_satisfaction,
    });
  }

  async handleAction(c: ShiftCustomerState, action: ShiftAction) {
    if (!this.shift) return;
    const planTier = 'hobby';   // simplification: we don't track per-customer tier in DO state — could be added
    const result = applyAction(c, action, planTier);
    c.current_satisfaction = Math.max(-100, Math.min(100, c.current_satisfaction + result.satisfaction_delta));
    c.satisfaction_delta_total += result.satisfaction_delta;
    if (result.cash_delta_cents < 0) {
      c.refund_given_cents += -result.cash_delta_cents;
    }
    this.send({
      type: 'action_result',
      ticket_id: c.ticket_id,
      result: {
        satisfaction_delta: result.satisfaction_delta,
        cash_delta_cents: result.cash_delta_cents,
        resolves_ticket: result.resolves_ticket,
        message: result.message,
      },
    });

    // DB-side: deduct cash, update ticket, persist customer satisfaction
    await this.persistActionToDb(c, result.cash_delta_cents, result.resolves_ticket);

    if (result.resolves_ticket) {
      c.status = 'resolved';
      this.shift.tickets_handled++;
      const hasNext = advanceToNext(this.shift);
      if (!hasNext) {
        this.shift.status = 'completed';
        await this.persistShiftHistory();
        this.send({ type: 'shift_end', summary: this.summary() });
      }
    }
  }

  async persistActionToDb(c: ShiftCustomerState, cashDelta: number, resolvesTicket: boolean) {
    if (!this.shift) return;
    if (cashDelta !== 0) {
      await this.env.DB.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?')
        .bind(cashDelta, this.shift.player_id).run();
    }
    await this.env.DB.prepare('UPDATE customers SET satisfaction = ? WHERE id = ?')
      .bind(c.current_satisfaction, c.customer_id).run();
    if (resolvesTicket) {
      await this.env.DB.prepare(`
        UPDATE tickets SET status = 'resolved', resolved_at = ?, satisfaction_delta = ?
        WHERE id = ?
      `).bind(Math.floor(Date.now() / 1000), c.satisfaction_delta_total, c.ticket_id).run();
    }
  }

  async persistShiftHistory() {
    if (!this.shift) return;
    const s = this.summary();
    await this.env.DB.prepare(`
      INSERT INTO shift_history (player_id, started_at, ended_at, tickets_handled, satisfaction_total, refunds_given_cents, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      this.shift.player_id, this.shift.started_at, Math.floor(Date.now() / 1000),
      this.shift.tickets_handled, s.satisfaction_total, s.refunds_cents,
      this.shift.status === 'completed' ? 'completed' : this.shift.status,
    ).run();
  }

  summary() {
    if (!this.shift) return { tickets_handled: 0, satisfaction_total: 0, refunds_cents: 0 };
    return {
      tickets_handled: this.shift.tickets_handled,
      satisfaction_total: this.shift.queue.reduce((s, c) => s + c.satisfaction_delta_total, 0),
      refunds_cents: this.shift.queue.reduce((s, c) => s + c.refund_given_cents, 0),
    };
  }

  async isPlayerPro(): Promise<boolean> {
    if (!this.shift) return false;
    const r = await this.env.DB.prepare('SELECT is_pro FROM players WHERE user_id = ?')
      .bind(this.shift.player_id).first<{ is_pro: number }>();
    return r?.is_pro === 1;
  }
}
```

- [ ] **Step 2: Register DO export — Astro adapter expects exports from worker module**

The Astro Cloudflare adapter generates a single worker bundle. To export the DO class, add to wrangler.toml `main` config OR use `cloudflare({ runtime: 'workers' })` adapter. Easier: add a `_worker.js` shim that re-exports.

Actually CF Pages auto-discovers DO classes from `wrangler.toml` `class_name` reference + the build output. We need the class to be EXPORTED from the deployed bundle. Astro CF adapter exports DO classes if they're imported in any route.

**Strategy:** import the DO class somewhere reachable. Add a tiny re-export in `src/env.d.ts` won't work; instead create:

```typescript
// src/pages/api/_internal/_durable-objects.ts
// This file exists ONLY to ensure ShiftRoomDO is in the bundle for CF Pages.
// It is not a public route.
export { ShiftRoomDO } from '../../../durable-objects/shift-room';
export const prerender = false;
```

> **Important verify-step:** check Astro 5 + CF adapter docs for the correct DO export pattern. If the above doesn't work, the alternate pattern is to set `output: 'server'` + `astro build` then use `wrangler deploy` with a manual `main` (skipping Pages) — but that conflicts with the Pages-Git-deploy. **Recommend**: as fallback, deploy a SEPARATE Workers script `navtycoon-shift-do` that exports the DO, and bind it via `[[durable_objects.bindings]] script_name = "navtycoon-shift-do"` in the Pages wrangler.toml. This is the cleanest.

**For Plan 2 first attempt: try the import-shim approach.** If first deploy fails with "DO class not found", fall back to separate-Worker.

- [ ] **Step 3: Smoke build**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -10
```

Expected: clean build (the DO class compiles into the worker bundle).

- [ ] **Step 4: Commit**

```bash
git add src/durable-objects/shift-room.ts src/pages/api/_internal/_durable-objects.ts
git commit -m "feat(do): ShiftRoomDO with WS chat + action-handler + DB-persist"
git push origin main
```

---

### Task 12: Shift API endpoints (start + ws-upgrade)

**Files:**
- Create: `/home/aika/navtycoon/src/pages/api/shift/start.ts`
- Create: `/home/aika/navtycoon/src/pages/api/shift/[shiftId].ts`

- [ ] **Step 1: POST /api/shift/start**

```typescript
// src/pages/api/shift/start.ts
// Creates a new shift: gathers up to 10 open tickets, populates a ShiftRoomDO,
// returns the WS URL.
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';

export const prerender = false;
function jerr(s: number, e: string) { return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { 'content-type': 'application/json' } }); }

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c); if (!user) return jerr(401, 'auth');
  const db = getDB(c); if (!db) return jerr(500, 'no DB');
  const player = await getPlayer(db, user.id);
  if (!player) return jerr(404, 'no player');

  // Daily-shift cap: free=1, pro=5
  const isPro = player.is_pro === 1;
  const cap = isPro ? 5 : 1;
  const todayUsed = player.free_shifts_today + player.paid_shifts_today;
  if (todayUsed >= cap) return jerr(429, `daily shift cap reached (${cap})`);

  // Get up to 10 open tickets with their customers
  const tickets = await db.prepare(`
    SELECT t.id AS ticket_id, t.summary, t.full_text,
           c.id AS customer_id, c.name, c.persona_archetype, c.satisfaction
    FROM tickets t JOIN customers c ON t.customer_id = c.id
    WHERE t.player_id = ? AND t.status = 'open'
    ORDER BY t.created_at ASC LIMIT 10
  `).bind(user.id).all<{
    ticket_id: number; summary: string; full_text: string;
    customer_id: number; name: string; persona_archetype: string; satisfaction: number;
  }>();

  if (!tickets.results || tickets.results.length === 0) return jerr(400, 'no open tickets');

  const shiftId = crypto.randomUUID();
  // Mark tickets in_progress
  for (const t of tickets.results) {
    await db.prepare(`UPDATE tickets SET status = 'in_progress' WHERE id = ?`).bind(t.ticket_id).run();
  }
  // Increment shift counter
  if (isPro) {
    await db.prepare('UPDATE players SET paid_shifts_today = paid_shifts_today + 1 WHERE user_id = ?').bind(user.id).run();
  } else {
    await db.prepare('UPDATE players SET free_shifts_today = free_shifts_today + 1 WHERE user_id = ?').bind(user.id).run();
  }

  // Init the DO
  const env = c.locals.runtime?.env as { SHIFT_ROOM?: DurableObjectNamespace };
  if (!env?.SHIFT_ROOM) return jerr(500, 'SHIFT_ROOM not bound');
  const id = env.SHIFT_ROOM.idFromName(shiftId);
  const stub = env.SHIFT_ROOM.get(id);
  await stub.fetch('https://room/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'init',
      player_id: user.id,
      is_pro: isPro,
      shift_id: shiftId,
      customers: tickets.results.map(t => ({
        ticket_id: t.ticket_id,
        customer_id: t.customer_id,
        customer_name: t.name,
        archetype: t.persona_archetype,
        current_satisfaction: t.satisfaction,
        ticket_subject: t.summary,
        ticket_first_message: t.full_text,
      })),
    }),
  });

  return new Response(JSON.stringify({ ok: true, shift_id: shiftId, ws_path: `/api/shift/${shiftId}` }), {
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 2: WS-relay endpoint**

```typescript
// src/pages/api/shift/[shiftId].ts
// WebSocket-upgrade relay: accepts WS-upgrade and proxies to ShiftRoomDO.
import type { APIContext } from 'astro';
import { getCurrentUser } from '../../../lib/auth';

export const prerender = false;

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return new Response('auth', { status: 401 });

  const upgrade = c.request.headers.get('Upgrade');
  if (upgrade !== 'websocket') return new Response('expected WS', { status: 426 });

  const env = c.locals.runtime?.env as { SHIFT_ROOM?: DurableObjectNamespace };
  if (!env?.SHIFT_ROOM) return new Response('no DO', { status: 500 });

  const shiftId = String(c.params.shiftId ?? '');
  if (!shiftId) return new Response('no shift', { status: 400 });

  const id = env.SHIFT_ROOM.idFromName(shiftId);
  const stub = env.SHIFT_ROOM.get(id);
  // Forward WS-upgrade
  return stub.fetch('https://room/ws', c.request);
};
```

- [ ] **Step 3: Smoke build**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/shift/
git commit -m "feat(api): /api/shift/start + WS-relay to ShiftRoomDO"
git push origin main
```

---

### Task 13: Shift-mode UI (page + client)

**Files:**
- Create: `/home/aika/navtycoon/src/pages/play/shift.astro`
- Create: `/home/aika/navtycoon/src/scripts/shift/shift-app.ts`

- [ ] **Step 1: Astro page (server-rendered shell)**

```astro
---
// src/pages/play/shift.astro
import Base from '../../layouts/Base.astro';
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer, listTickets } from '../../lib/game/db';
import { getLlmUsageToday, getDailyCap } from '../../lib/game/llm-cap';

const user = await getCurrentUser(Astro);
if (!user) return Astro.redirect('/login?next=/play/shift');
const db = getDB(Astro);
if (!db) return new Response('No DB', { status: 500 });
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');

const open = await listTickets(db, user.id, 'open');
const used = await getLlmUsageToday(db, user.id);
const cap = getDailyCap(player.is_pro === 1);
const cap_remaining = cap - used;
---
<Base title="Shift Mode">
  <h1 class="text-2xl font-bold mb-2">Shift Mode</h1>
  <p class="text-nt-text-dim mb-4 text-sm">
    {open.length} open tickets · {cap_remaining}/{cap} LLM-budget remaining today · {player.free_shifts_today + player.paid_shifts_today} shifts used today
  </p>

  <div id="pre-shift" class={open.length === 0 || cap_remaining < 5 ? 'hidden' : ''}>
    {open.length > 0 && cap_remaining >= 5 && (
      <button id="start-shift" class="px-6 py-3 bg-nt-accent rounded font-semibold">▶ Start Shift</button>
    )}
  </div>

  {open.length === 0 && (
    <div class="bg-nt-bg-2 p-6 rounded">
      <p class="text-nt-accent mb-2">🎉 Inbox zero.</p>
      <p class="text-nt-text-dim text-sm">Wait for cron-tick to spawn more tickets, or buy more servers to attract customers.</p>
    </div>
  )}

  {cap_remaining < 5 && open.length > 0 && (
    <div class="bg-nt-bg-2 p-6 rounded">
      <p class="text-yellow-400 mb-2">⚠ Daily LLM-budget too low ({cap_remaining}/{cap}).</p>
      <p class="text-nt-text-dim text-sm">Shifts need at least 5 budget. Try again tomorrow, or upgrade to Pro.</p>
    </div>
  )}

  <div id="shift-area" class="hidden">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      <aside id="queue" class="bg-nt-bg-2 p-4 rounded col-span-1 max-h-[70vh] overflow-y-auto">
        <h2 class="font-bold mb-2 text-sm uppercase text-nt-text-dim">Queue</h2>
        <ul id="queue-list" class="space-y-2 text-sm"></ul>
      </aside>
      <section class="md:col-span-2 bg-nt-bg-2 p-4 rounded flex flex-col h-[70vh]">
        <header class="border-b border-nt-border pb-2 mb-2">
          <h3 id="active-customer" class="font-bold">—</h3>
          <p id="active-meta" class="text-xs text-nt-text-dim"></p>
        </header>
        <div id="messages" class="flex-1 overflow-y-auto space-y-2 mb-2"></div>
        <div class="flex gap-2 flex-wrap mb-2 text-xs">
          <button data-action="refund_30" class="px-2 py-1 bg-nt-bg-3 rounded">Refund 30%</button>
          <button data-action="refund_50" class="px-2 py-1 bg-nt-bg-3 rounded">Refund 50%</button>
          <button data-action="refund_100" class="px-2 py-1 bg-nt-bg-3 rounded">Refund 100%</button>
          <button data-action="escalate" class="px-2 py-1 bg-nt-bg-3 rounded">Escalate ($50)</button>
          <button data-action="investigate" class="px-2 py-1 bg-nt-bg-3 rounded">Investigate (free)</button>
          <button data-action="close" class="px-2 py-1 bg-red-500/20 text-red-300 rounded">Close ticket</button>
        </div>
        <div class="flex gap-2">
          <input id="msg-input" type="text" placeholder="Type a reply..." class="flex-1 px-3 py-2 bg-nt-bg-3 border border-nt-border rounded" />
          <button id="msg-send" class="px-3 py-2 bg-nt-accent rounded text-sm font-semibold">Send</button>
        </div>
      </section>
    </div>
    <div id="shift-end" class="hidden bg-nt-bg-2 p-6 rounded mt-6">
      <h2 class="font-bold text-lg mb-2">Shift Complete</h2>
      <p id="end-summary" class="text-nt-text-dim"></p>
      <a href="/play" class="inline-block mt-4 px-4 py-2 bg-nt-accent rounded">Back to Dashboard</a>
    </div>
  </div>

  <script type="module" src="/src/scripts/shift/shift-app.ts"></script>
</Base>
```

- [ ] **Step 2: Client script (XSS-safe DOM)**

```typescript
// src/scripts/shift/shift-app.ts
// Client-side shift-mode controller. WebSocket + DOM (XSS-safe via textContent).

interface CustomerInQueue {
  ticket_id: number; customer_id: number; customer_name: string;
  archetype: string; current_satisfaction: number; ticket_subject: string;
  conversation: { role: 'customer' | 'player'; text: string; ts: number }[];
  status: 'pending' | 'active' | 'resolved' | 'abandoned';
  satisfaction_delta_total: number; refund_given_cents: number;
}

interface ShiftStateMsg {
  shift_id: string; player_id: string; started_at: number; expires_at: number;
  status: 'active' | 'completed' | 'expired' | 'abandoned';
  queue: CustomerInQueue[]; active_index: number; tickets_handled: number;
}

let ws: WebSocket | null = null;
let lastState: ShiftStateMsg | null = null;

const $ = (id: string) => document.getElementById(id)!;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderQueue(state: ShiftStateMsg) {
  const list = $('queue-list');
  while (list.firstChild) list.removeChild(list.firstChild);
  state.queue.forEach((c, i) => {
    const li = el('li', `p-2 rounded ${i === state.active_index ? 'bg-nt-accent-l border border-nt-accent' : 'bg-nt-bg-3'}`);
    const name = el('div', 'font-semibold text-sm', c.customer_name);
    const meta = el('div', 'text-xs text-nt-text-dim', `${c.archetype} · sat ${c.current_satisfaction} · ${c.status}`);
    li.appendChild(name);
    li.appendChild(meta);
    list.appendChild(li);
  });
}

function renderActive(state: ShiftStateMsg) {
  const idx = state.active_index;
  if (idx < 0 || idx >= state.queue.length) {
    $('active-customer').textContent = '—';
    $('active-meta').textContent = '';
    return;
  }
  const c = state.queue[idx];
  $('active-customer').textContent = `${c.customer_name} (${c.archetype})`;
  $('active-meta').textContent = `Subject: ${c.ticket_subject} · Sat: ${c.current_satisfaction}/100`;

  const msgs = $('messages');
  while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
  for (const m of c.conversation) {
    const wrap = el('div', m.role === 'customer' ? 'flex' : 'flex justify-end');
    const bubble = el('div', `max-w-[75%] px-3 py-2 rounded ${m.role === 'customer' ? 'bg-nt-bg-3 text-nt-text' : 'bg-nt-accent text-white'}`);
    bubble.textContent = m.text;
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
  }
  msgs.scrollTop = msgs.scrollHeight;
}

function applyState(state: ShiftStateMsg) {
  lastState = state;
  renderQueue(state);
  renderActive(state);
}

function showShiftEnd(summary: { tickets_handled: number; satisfaction_total: number; refunds_cents: number }) {
  $('shift-end').classList.remove('hidden');
  $('end-summary').textContent = `Tickets handled: ${summary.tickets_handled} · Total satisfaction: ${summary.satisfaction_total >= 0 ? '+' : ''}${summary.satisfaction_total} · Refunds: $${(summary.refunds_cents / 100).toFixed(2)}`;
  ws?.close();
}

async function startShift() {
  $('pre-shift').classList.add('hidden');
  $('shift-area').classList.remove('hidden');
  const r = await fetch('/api/shift/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!r.ok) {
    alert('Could not start shift: ' + await r.text());
    location.reload();
    return;
  }
  const j = await r.json() as { shift_id: string; ws_path: string };
  const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${j.ws_path}`;
  ws = new WebSocket(wsUrl);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') applyState(msg.state);
    else if (msg.type === 'reply') applyState({ ...lastState!, queue: lastState!.queue.map(c =>
      c.ticket_id === msg.ticket_id
        ? { ...c, current_satisfaction: msg.new_satisfaction,
            conversation: [...c.conversation, { role: 'customer', text: msg.text, ts: Math.floor(Date.now()/1000) }] }
        : c) });
    else if (msg.type === 'action_result') { /* state-msg follows */ }
    else if (msg.type === 'shift_end') showShiftEnd(msg.summary);
    else if (msg.type === 'error') { console.error('shift error', msg.error); alert('Error: ' + msg.error); }
  };
  ws.onclose = () => { console.log('WS closed'); };
}

$('start-shift')?.addEventListener('click', startShift);

$('msg-send').addEventListener('click', () => {
  const inp = $('msg-input') as HTMLInputElement;
  const text = inp.value.trim();
  if (!text || !ws) return;
  ws.send(JSON.stringify({ type: 'msg', text }));
  // Local echo
  if (lastState && lastState.active_index >= 0) {
    const c = lastState.queue[lastState.active_index];
    c.conversation.push({ role: 'player', text, ts: Math.floor(Date.now()/1000) });
    applyState(lastState);
  }
  inp.value = '';
});

$('msg-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('msg-send').click();
});

document.querySelectorAll<HTMLElement>('[data-action]').forEach(b =>
  b.addEventListener('click', () => {
    if (!ws) return;
    const action = b.dataset.action;
    ws.send(JSON.stringify({ type: 'action', action }));
  }),
);
```

- [ ] **Step 3: Smoke + commit**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -5
git add src/pages/play/shift.astro src/scripts/shift/
git commit -m "feat(ui): shift-mode page + client (WS chat + action-buttons + XSS-safe DOM)"
git push origin main
```

---

### Task 14: Production deploy + smoke-test + tag

- [ ] **Step 1: Verify CF Pages secrets are still set, no new secrets needed**

Plan 2 doesn't add new secrets. AI binding + Vectorize binding + DO binding are config-time (wrangler.toml) not secrets.

- [ ] **Step 2: Deploy by pushing to main**

If all previous tasks pushed to main, the next commit triggers auto-build. If the DO-class needs a separate Workers script (fallback path from Task 11 step 2), that's a setup-step:

```bash
# Optional fallback for DO export — only if Task 11 main deploy fails:
# Create a tiny secondary repo csiber/navtycoon-shift-do that exports the DO class,
# deploy it as a Workers script, and update wrangler.toml's [[durable_objects.bindings]]
# to reference script_name = "navtycoon-shift-do".
```

Verify deploy success via REST:
```
GET /accounts/{account_id}/pages/projects/navtycoon/deployments?per_page=3
```

Latest deployment status should be `success`.

- [ ] **Step 3: Smoke-test**

Manual test sequence:
1. Visit https://hyperscaler.promnet.hu/signup
2. Create test-account; verify redirect to /play
3. Go to /play/shift; click "Start Shift"
4. WS connects, queue + active customer render
5. Type a reply, hit Send → AI customer responds within ~3s
6. Click "Refund 50%" → satisfaction +20, cash deducted, action_result + state msg arrive
7. Click "Close ticket" → resolves, advances to next customer
8. Repeat until queue empty → "Shift Complete" panel shown

If any of the above fails, fix and re-deploy.

- [ ] **Step 4: Verify cron-tick is now AI-driven (production)**

```bash
curl -X POST -H "x-cron-secret: <secret>" -H "Origin: https://hyperscaler.promnet.hu" https://hyperscaler.promnet.hu/api/cron/tick
```

Response should include `"ai_tickets": N` > 0 if any active player has free customers + budget.

- [ ] **Step 5: Tag release**

```bash
cd /home/aika/navtycoon
git tag -a v0.2.0-plan2-ai-shift -m "Hyperscaler Plan 2 — AI engine + Shift-mode deployed"
git push origin v0.2.0-plan2-ai-shift
```

## Self-Review

**Spec coverage check (against `2026-05-10-hyperscaler-mvp-design.md` Plan 2 scope):**

- §3.2 Shift / Real-time → ✅ Tasks 10-13 (state + actions + DO + UI)
- §4 AI-customer engine → ✅ Tasks 2-9 (prompts + Workers AI + Vectorize + ticket-gen + reply-gen + cap)
- §10 Brand humor → ✅ Task 2 persona-prompts encode humor-rules per archetype

**Placeholder scan:** Task 11 step 2 has a fallback note — separate-Worker for DO if Pages-bundle export doesn't work. Documented, not a blocker; first attempt is import-shim.

**Type consistency:** ShiftCustomerState, ShiftState, ShiftAction defined in Task 10, used by DO (Task 11), shift-API (Task 12), and shift-UI (Task 13). PersonaArchetype consistent across `persona-prompts.ts`, `ticket-generator.ts`, `reply-generator.ts`. WorkersAIBinding interface in Task 3 reused everywhere.

**Plan 3 dependencies (placeholders Plan 3 must replace):**
- LLM-cap UI on dashboard (today's usage) — Plan 3 enhances
- Shift-end summary doesn't yet show on dashboard — Plan 3 adds achievements + history view
- No translation layer (i18n) — Plan 3 wraps all UI strings
- Stripe placeholders untouched — Plan 3 wires real payment
- Cron auto-trigger still needs operational config (CF Pages dashboard) — Plan 3 task

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-hyperscaler-plan-2-ai-shift.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between, best for 14-task multi-component plan.

**2. Inline Execution** — tasks in this session with batch checkpoints.

**Auto-mode active:** default = Subagent-Driven, start immediately.
