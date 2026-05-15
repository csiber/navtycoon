# Marketplace Leads Buy-flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/play/marketplace` leads category into a real game mechanic — player spends cash on an NPC lead listing and receives a new customer in their flotta.

**Architecture:** Schema migration adds 4 columns to `marketplace_listings` (`effect_type`, `effect_payload` JSON, `sold_at`, `sold_to_player_id`). A new pure helper `buy.ts` encodes the buy logic; a thin Astro POST handler at `/api/marketplace/purchase/[id]` runs an atomic D1 batch (mark sold, deduct cash, insert customer). 5 new NPC seed listings have `effect_type='spawn_customer'`. Marketplace UI gates a "Vétel $X" button on `sold_at IS NULL` and shows a confirm modal.

**Tech Stack:** Astro 5, Cloudflare D1, TypeScript, vitest. D1 migrations via REST API (`Global API Key`, account credentials in `~/mackosajt.md`, env `NAVTYCOON_DB`).

**Reference spec:** `docs/superpowers/specs/2026-05-15-marketplace-leads-buy-design.md`

---

## File Structure

| Path | Role |
|---|---|
| `migrations/0010_marketplace_listings_effect.sql` | new — schema migration |
| `src/lib/marketplace/db.ts` | extend `MarketplaceListing` type, add `getListing()` and `markSold()` |
| `src/lib/marketplace/buy.ts` | new — pure logic: validate listing, build customer row, return D1 batch statements |
| `src/lib/marketplace/__tests__/buy.test.ts` | new — vitest unit tests for buy.ts |
| `src/lib/marketplace/npc-seeds.ts` | append 5 new seeds with `effect_type` + `effect_payload` |
| `src/lib/marketplace/translations.ts` | HU + DE translations for 5 new seed titles/bodies |
| `src/pages/api/marketplace/purchase/[id].ts` | new — thin Astro POST handler, calls `buy.ts` |
| `src/pages/play/marketplace.astro` | buy button + confirm modal + toast wiring |
| `src/lib/i18n.ts` | 9 new keys × 3 locales |

---

## Task 1: Schema migration

**Files:**
- Create: `migrations/0010_marketplace_listings_effect.sql`

- [ ] **Step 1: Write the migration SQL**

Create `migrations/0010_marketplace_listings_effect.sql`:

```sql
-- 0010_marketplace_listings_effect.sql
-- Marketplace v0.9: turn the leads board into a real transaction surface.
-- Spec: docs/superpowers/specs/2026-05-15-marketplace-leads-buy-design.md
--
-- effect_type  — open enum, initial value 'spawn_customer'. NULL means
--                the listing is informational only (the 3 existing WTB
--                seeds keep their NULL and stay non-buyable).
-- effect_payload — JSON describing the effect-specific payload.
--                For spawn_customer: { archetype, name, plan_tier, starting_satisfaction }.
-- sold_at / sold_to_player_id — race-safe sold-once gate.

ALTER TABLE marketplace_listings ADD COLUMN effect_type TEXT;
ALTER TABLE marketplace_listings ADD COLUMN effect_payload TEXT;
ALTER TABLE marketplace_listings ADD COLUMN sold_at INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN sold_to_player_id TEXT;

CREATE INDEX IF NOT EXISTS idx_marketplace_sold
  ON marketplace_listings(sold_at);
```

- [ ] **Step 2: Apply the migration to D1**

Use the Cloudflare REST API (credentials in `~/mackosajt.md`, `csiberius@gmail.com`, X-Auth-Email + X-Auth-Key headers — NOT Bearer):

```bash
export CF_EMAIL=csiberius@gmail.com
export CF_KEY=<from-mackosajt>
export CF_ACCOUNT=<from-mackosajt>
export DB_ID=<navtycoon-d1-id-from-wrangler-toml>

SQL=$(cat migrations/0010_marketplace_listings_effect.sql | jq -Rs .)
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database/$DB_ID/query" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"sql\": $SQL}"
```

Expected: `{"success":true, ...}` with 4 ALTER results.

- [ ] **Step 3: Verify schema on D1**

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database/$DB_ID/query" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_KEY" -H "Content-Type: application/json" \
  -d '{"sql": "PRAGMA table_info(marketplace_listings);"}'
```

Expected: lists `effect_type`, `effect_payload`, `sold_at`, `sold_to_player_id` among the columns.

- [ ] **Step 4: Commit**

```bash
git add migrations/0010_marketplace_listings_effect.sql
git commit -m "feat(marketplace): schema migration for buy-flow (effect_type, sold_at)"
```

---

## Task 2: Extend `marketplace/db.ts` types and helpers

**Files:**
- Modify: `src/lib/marketplace/db.ts`

- [ ] **Step 1: Add new fields to `MarketplaceListing` interface**

In `src/lib/marketplace/db.ts`, find the `MarketplaceListing` interface (around line 11) and add the 4 new fields:

```typescript
export interface MarketplaceListing {
  id: number;
  author_id: string;
  author_name: string;
  author_city: string | null;
  is_npc: number;
  npc_archetype: string | null;
  category: ListingCategory;
  title: string;
  body: string;
  price_cents: number;
  price_unit: PriceUnit;
  posted_at: number;
  is_active: number;
  // New for buy-flow (migration 0010):
  effect_type: string | null;          // 'spawn_customer' | null
  effect_payload: string | null;       // JSON string
  sold_at: number | null;              // unix sec
  sold_to_player_id: string | null;
}
```

- [ ] **Step 2: Add the new columns to the `listListings()` SELECT**

In the same file, find `listListings()` and ensure the SELECT explicitly includes the new columns (the existing `m.*` already covers them, but add a comment):

```typescript
  let sql =
    // m.* now includes effect_type, effect_payload, sold_at, sold_to_player_id
    // since migration 0010. Add columns to the alias-projection if we
    // ever swap m.* for an explicit list.
    'SELECT m.*, p.company_name AS author_name, p.city AS author_city, p.npc_archetype ' +
    'FROM marketplace_listings m ' +
    'LEFT JOIN players p ON p.user_id = m.author_id ' +
    'WHERE m.is_active = 1';
```

(Just a doc comment — `m.*` is already correct.)

- [ ] **Step 3: Add `getListing()` helper**

Append to the end of `src/lib/marketplace/db.ts`:

```typescript
/** Fetch a single listing by id, joining the author player row.
 *  Used by the buy-flow endpoint to validate before purchase. */
export async function getListing(
  db: D1Database, id: number,
): Promise<MarketplaceListing | null> {
  const row = await db.prepare(
    'SELECT m.*, p.company_name AS author_name, p.city AS author_city, p.npc_archetype ' +
    'FROM marketplace_listings m ' +
    'LEFT JOIN players p ON p.user_id = m.author_id ' +
    'WHERE m.id = ? LIMIT 1',
  ).bind(id).first<MarketplaceListing>();
  return row ?? null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/marketplace/db.ts
git commit -m "feat(marketplace): extend listing type + getListing helper for buy-flow"
```

---

## Task 3: Pure buy-logic in `buy.ts` with TDD

**Files:**
- Create: `src/lib/marketplace/buy.ts`
- Create: `src/lib/marketplace/__tests__/buy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/marketplace/__tests__/buy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateBuy, parseEffect, type BuyableListing } from '../buy';

const baseListing: BuyableListing = {
  id: 42,
  category: 'leads',
  effect_type: 'spawn_customer',
  effect_payload: JSON.stringify({
    archetype: 'loyalist',
    name: 'Sarah Chen',
    plan_tier: 'hobby',
    starting_satisfaction: 75,
  }),
  price_cents: 20000, // $200
  sold_at: null,
};

describe('validateBuy', () => {
  it('passes for a fresh leads listing with spawn_customer effect and enough cash', () => {
    const r = validateBuy(baseListing, 25000);
    expect(r.ok).toBe(true);
  });

  it('rejects when listing is already sold', () => {
    const r = validateBuy({ ...baseListing, sold_at: 1700000000 }, 25000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('sold');
  });

  it('rejects when cash is below price', () => {
    const r = validateBuy(baseListing, 15000); // $150 < $200
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('insufficient_cash');
  });

  it('rejects when category is not leads', () => {
    const r = validateBuy({ ...baseListing, category: 'hardware' }, 25000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('not_buyable');
  });

  it('rejects when effect_type is not spawn_customer', () => {
    const r = validateBuy({ ...baseListing, effect_type: null }, 25000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('not_buyable');
  });
});

describe('parseEffect', () => {
  it('parses a valid spawn_customer payload', () => {
    const e = parseEffect(baseListing.effect_payload);
    expect(e).toEqual({
      archetype: 'loyalist',
      name: 'Sarah Chen',
      plan_tier: 'hobby',
      starting_satisfaction: 75,
    });
  });

  it('returns null on malformed JSON', () => {
    expect(parseEffect('not json')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseEffect('{"name":"x"}')).toBeNull();
  });

  it('returns null when archetype is not a known persona', () => {
    expect(parseEffect('{"archetype":"alien","name":"x","plan_tier":"hobby","starting_satisfaction":50}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/marketplace/__tests__/buy.test.ts
```

Expected: FAIL — module `../buy` not found.

- [ ] **Step 3: Implement `buy.ts`**

Create `src/lib/marketplace/buy.ts`:

```typescript
// src/lib/marketplace/buy.ts
// Pure buy-flow logic for marketplace leads. Keeping it framework-free
// makes it trivial to unit-test without spinning up D1 / Astro context.
// The Astro endpoint at /api/marketplace/purchase/[id] is a thin shell
// around these helpers.

import type { PersonaArchetype, PlanTier } from '../game/types';

export interface BuyableListing {
  id: number;
  category: string;
  effect_type: string | null;
  effect_payload: string | null;
  price_cents: number;
  sold_at: number | null;
}

export interface SpawnCustomerEffect {
  archetype: PersonaArchetype;
  name: string;
  plan_tier: PlanTier;
  starting_satisfaction: number;
}

export type BuyError = 'not_buyable' | 'sold' | 'insufficient_cash' | 'bad_payload';

export type BuyResult =
  | { ok: true }
  | { ok: false; error: BuyError };

const KNOWN_ARCHETYPES: readonly PersonaArchetype[] = [
  'newbie', 'pro', 'cheapskate', 'karen', 'loyalist', 'ghost', 'drama', 'crypto',
];
const KNOWN_TIERS: readonly PlanTier[] = ['hobby', 'business', 'vps', 'dedicated'];

export function validateBuy(listing: BuyableListing, cashCents: number): BuyResult {
  if (listing.category !== 'leads') return { ok: false, error: 'not_buyable' };
  if (listing.effect_type !== 'spawn_customer') return { ok: false, error: 'not_buyable' };
  if (listing.sold_at !== null) return { ok: false, error: 'sold' };
  if (cashCents < listing.price_cents) return { ok: false, error: 'insufficient_cash' };
  const effect = parseEffect(listing.effect_payload);
  if (!effect) return { ok: false, error: 'bad_payload' };
  return { ok: true };
}

export function parseEffect(payload: string | null): SpawnCustomerEffect | null {
  if (!payload) return null;
  let obj: unknown;
  try { obj = JSON.parse(payload); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const archetype = o.archetype;
  const name = o.name;
  const plan_tier = o.plan_tier;
  const sat = o.starting_satisfaction;
  if (typeof archetype !== 'string' || !(KNOWN_ARCHETYPES as readonly string[]).includes(archetype)) return null;
  if (typeof name !== 'string' || name.length === 0) return null;
  if (typeof plan_tier !== 'string' || !(KNOWN_TIERS as readonly string[]).includes(plan_tier)) return null;
  if (typeof sat !== 'number' || sat < 0 || sat > 100) return null;
  return {
    archetype: archetype as PersonaArchetype,
    name,
    plan_tier: plan_tier as PlanTier,
    starting_satisfaction: sat,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/marketplace/__tests__/buy.test.ts
```

Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketplace/buy.ts src/lib/marketplace/__tests__/buy.test.ts
git commit -m "feat(marketplace): pure buy-flow validator + effect parser"
```

---

## Task 4: Astro POST endpoint `/api/marketplace/purchase/[id]`

**Files:**
- Create: `src/pages/api/marketplace/purchase/[id].ts`

- [ ] **Step 1: Write the endpoint**

Create `src/pages/api/marketplace/purchase/[id].ts`:

```typescript
// POST /api/marketplace/purchase/:id
// Atomically: mark listing sold, deduct player cash, insert customer.
// Spec: docs/superpowers/specs/2026-05-15-marketplace-leads-buy-design.md
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../../lib/auth';
import { getListing } from '../../../../lib/marketplace/db';
import { validateBuy, parseEffect } from '../../../../lib/marketplace/buy';

export const prerender = false;

function jerr(s: number, e: string): Response {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s, headers: { 'content-type': 'application/json' },
  });
}

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth required');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  const idParam = c.params.id ?? '';
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id) || id <= 0) return jerr(400, 'bad id');

  const listing = await getListing(db, id);
  if (!listing) return jerr(404, 'not found');

  const player = await db
    .prepare('SELECT cash_usd_cents FROM players WHERE user_id = ? LIMIT 1')
    .bind(user.id)
    .first<{ cash_usd_cents: number }>();
  if (!player) return jerr(403, 'no player record');

  const v = validateBuy(
    {
      id: listing.id,
      category: listing.category,
      effect_type: listing.effect_type,
      effect_payload: listing.effect_payload,
      price_cents: listing.price_cents,
      sold_at: listing.sold_at,
    },
    player.cash_usd_cents,
  );
  if (!v.ok) {
    const code = v.error === 'insufficient_cash' ? 402
      : v.error === 'sold' ? 409
      : v.error === 'not_buyable' ? 400
      : 500;
    return jerr(code, v.error);
  }

  const effect = parseEffect(listing.effect_payload);
  if (!effect) return jerr(500, 'bad_payload'); // already validated, defensive

  const now = Math.floor(Date.now() / 1000);

  // D1 batch — atomic per Cloudflare docs.
  // The `WHERE sold_at IS NULL` on the UPDATE is the race-safe gate:
  // a concurrent buyer's batch will affect 0 rows on that statement,
  // but the batch still commits. We re-read sold_at afterward to
  // detect the loss and refund/rollback by deletion.
  const result = await db.batch([
    db.prepare(
      'UPDATE marketplace_listings SET sold_at = ?, sold_to_player_id = ? ' +
      'WHERE id = ? AND sold_at IS NULL',
    ).bind(now, user.id, listing.id),
    db.prepare(
      'UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?',
    ).bind(listing.price_cents, user.id),
    db.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction, is_active) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 1)',
    ).bind(user.id, effect.name, effect.archetype, effect.plan_tier, now, effect.starting_satisfaction),
  ]);

  // Race detection: first statement is the UPDATE on listing.
  // D1 returns meta.changes per statement. If 0, someone else bought it.
  const meta0 = result[0]?.meta as { changes?: number } | undefined;
  if (!meta0 || meta0.changes !== 1) {
    // Loser of race — undo the cash deduction and the customer insert.
    // We know the customer's archetype + joined_at uniquely identifies
    // it within this transaction window for this player.
    await db.batch([
      db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?').bind(listing.price_cents, user.id),
      db.prepare('DELETE FROM customers WHERE player_id = ? AND name = ? AND joined_at = ?').bind(user.id, effect.name, now),
    ]);
    return jerr(409, 'sold');
  }

  // Fetch the new customer id for the client redirect/toast.
  const created = await db.prepare(
    'SELECT id FROM customers WHERE player_id = ? AND name = ? AND joined_at = ? ORDER BY id DESC LIMIT 1',
  ).bind(user.id, effect.name, now).first<{ id: number }>();

  return new Response(JSON.stringify({
    ok: true,
    customer_id: created?.id ?? null,
    customer_name: effect.name,
    cash_remaining_cents: player.cash_usd_cents - listing.price_cents,
  }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Type-check the file**

```bash
npx tsc --noEmit src/pages/api/marketplace/purchase/[id].ts 2>&1 | grep -E "purchase|buy\.ts|marketplace/db" || echo "OK"
```

Expected: `OK` (no new TS errors introduced; pre-existing repo TS errors are unrelated).

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/marketplace/purchase/[id].ts
git commit -m "feat(marketplace): POST /api/marketplace/purchase/:id endpoint"
```

---

## Task 5: 5 new NPC lead seeds + translations

**Files:**
- Modify: `src/lib/marketplace/npc-seeds.ts`
- Modify: `src/lib/marketplace/translations.ts`

- [ ] **Step 1: Extend the seed type with effect fields**

In `src/lib/marketplace/npc-seeds.ts`, find the `MarketplaceSeed` type definition near the top and add optional fields:

```typescript
export interface MarketplaceSeed {
  author_id: string;
  category: 'peering' | 'hardware' | 'service' | 'leads';
  title: string;
  body: string;
  price_cents: number;
  price_unit: 'one_time' | 'monthly' | 'per_gb';
  hours_ago: number;
  effect_type?: 'spawn_customer';
  effect_payload?: string;  // JSON string
}
```

(If the type isn't currently exported with these fields, add them. Existing seeds get implicit `undefined`.)

- [ ] **Step 2: Append the 5 new lead seeds**

At the end of the `MARKETPLACE_SEEDS` array in `npc-seeds.ts` (just before the closing `] as const;`), insert:

```typescript
  // ─── Phase 2 leads — buyable spawn_customer listings ───────────────
  {
    author_id: 'npc-pixelforge', category: 'leads',
    title: 'Sarah Chen wants stable hobby hosting — referral $200',
    body: 'Sarah runs a small DTC skincare shop on Squarespace. Wants a real $5-15/mo VPS for her staging environment. Loyal type — pays on time, asks once a quarter if everything\'s fine. We are full, sending her your way for a flat $200 referral. She picks the host.',
    price_cents: 20000, price_unit: 'one_time', hours_ago: 6,
    effect_type: 'spawn_customer',
    effect_payload: JSON.stringify({ archetype: 'loyalist', name: 'Sarah Chen', plan_tier: 'hobby', starting_satisfaction: 75 }),
  },
  {
    author_id: 'npc-riverside', category: 'leads',
    title: 'Tomás López — first-time founder needs hand-holding',
    body: 'Tomás just left his sysadmin job to launch a local-business directory. Doesn\'t know what a CNAME is yet but is patient and pays in advance. Cheap hobby tier, lots of support tickets but kind. $150 finder.',
    price_cents: 15000, price_unit: 'one_time', hours_ago: 12,
    effect_type: 'spawn_customer',
    effect_payload: JSON.stringify({ archetype: 'newbie', name: 'Tomás López', plan_tier: 'hobby', starting_satisfaction: 60 }),
  },
  {
    author_id: 'npc-aurora-data', category: 'leads',
    title: 'Avery Tran — business-tier, RFC-quoting senior engineer',
    body: 'Avery is a principal engineer at a fintech. Wants a business-tier setup for his side project. Will read your status page, will email you about IPv6, will pay on time, will not blink at $30/mo. Worth $400 to introduce. He picks the host.',
    price_cents: 40000, price_unit: 'one_time', hours_ago: 2,
    effect_type: 'spawn_customer',
    effect_payload: JSON.stringify({ archetype: 'pro', name: 'Avery Tran', plan_tier: 'business', starting_satisfaction: 60 }),
  },
  {
    author_id: 'npc-belvedere', category: 'leads',
    title: 'Jordan Smith — bargain-hunter, hobby-tier',
    body: 'Jordan emails three hosts every renewal cycle asking for a discount. They will pay, eventually, on the cheap plan. They will also open a refund ticket once a quarter. We charged a flat $80 to get rid of them — your funeral.',
    price_cents: 8000, price_unit: 'one_time', hours_ago: 30,
    effect_type: 'spawn_customer',
    effect_payload: JSON.stringify({ archetype: 'cheapskate', name: 'Jordan Smith', plan_tier: 'hobby', starting_satisfaction: 45 }),
  },
  {
    author_id: 'npc-maelstrom', category: 'leads',
    title: 'Beth Park — $50 fire-sale, do not say we didn\'t warn you',
    body: 'Beth is a "Karen". She has filed three P1 tickets at us in two weeks. Hates her current host. Will hate her next host. We are charging $50 to make her someone else\'s problem. Hobby tier, sat starts at 25, you have been warned.',
    price_cents: 5000, price_unit: 'one_time', hours_ago: 1,
    effect_type: 'spawn_customer',
    effect_payload: JSON.stringify({ archetype: 'karen', name: 'Beth Park', plan_tier: 'hobby', starting_satisfaction: 25 }),
  },
```

- [ ] **Step 3: Add HU + DE translations for the 5 new titles/bodies**

In `src/lib/marketplace/translations.ts`, find the `HU` map and append:

```typescript
  'Sarah Chen wants stable hobby hosting — referral $200': {
    title: 'Sarah Chen stabil hobby-tier hosting-ot keres — közvetítés $200',
    body: 'Sarah egy kis DTC kozmetikai webshopot visz Squarespace-en. Igazi $5-15/hó VPS-t akar staging-re. Hűséges típus — időben fizet, negyedévente kérdezi meg hogy minden OK. Mi tele vagyunk, $200-ért átküldjük hozzád. Ő választ szolgáltatót.',
  },
  'Tomás López — first-time founder needs hand-holding': {
    title: 'Tomás López — első vállalkozó, kézfogásra szorul',
    body: 'Tomás most lépett ki a sysadmin állásából helyi-vállalkozói katalógust indít. Nem tudja még mi az a CNAME, de türelmes és előre fizet. Olcsó hobby-tier, sok support-ticket de kedves. $150 a közvetítés.',
  },
  'Avery Tran — business-tier, RFC-quoting senior engineer': {
    title: 'Avery Tran — business-tier, RFC-idéző senior fejlesztő',
    body: 'Avery egy fintech principal engineer. Business-tier setup-ot akar a side projectjéhez. Olvasni fogja a status-oldalad, írni fog IPv6-ról, időben fizet, $30/hó-ért nem fog megrezzenni. $400-ért éri megismerni. Ő választ szolgáltatót.',
  },
  'Jordan Smith — bargain-hunter, hobby-tier': {
    title: 'Jordan Smith — alku-vadász, hobby-tier',
    body: 'Jordan minden megújításkor három szolgáltatónak küld kedvezmény-kérő levelet. Végül fizetni fog az olcsó csomagon. Negyedévente nyit egy refund-ticketet is. $80-ért adtuk át — a te dolgod most.',
  },
  'Beth Park — $50 fire-sale, do not say we didn\'t warn you': {
    title: 'Beth Park — $50 tűzosztó, ne mondd hogy nem szóltunk',
    body: 'Beth egy "Karen". Két hét alatt három P1-et nyitott nálunk. Utálja a jelenlegi szolgáltatóját. Utálni fogja a következőt is. $50-ért átpasszoljuk valaki másnak. Hobby tier, sat 25-ön indul, figyelmeztettünk.',
  },
```

Then find the `DE` map and append:

```typescript
  'Sarah Chen wants stable hobby hosting — referral $200': {
    title: 'Sarah Chen sucht stabiles Hobby-Tier-Hosting — Vermittlung $200',
    body: 'Sarah betreibt einen kleinen DTC-Kosmetik-Webshop auf Squarespace. Will einen echten $5-15/Mon VPS für Staging. Loyaler Typ — zahlt pünktlich, fragt einmal pro Quartal, ob alles OK ist. Wir sind voll, schicken sie für $200 zu dir. Sie wählt den Anbieter.',
  },
  'Tomás López — first-time founder needs hand-holding': {
    title: 'Tomás López — Erstgründer, braucht Handhalten',
    body: 'Tomás hat gerade seinen Sysadmin-Job verlassen, um ein lokales Geschäftsverzeichnis zu starten. Weiß noch nicht, was ein CNAME ist, ist aber geduldig und zahlt im Voraus. Günstiger Hobby-Tier, viele Support-Tickets, aber nett. $150 Vermittlung.',
  },
  'Avery Tran — business-tier, RFC-quoting senior engineer': {
    title: 'Avery Tran — Business-Tier, RFC-zitierender Senior-Engineer',
    body: 'Avery ist Principal Engineer bei einem Fintech. Will ein Business-Tier-Setup für sein Side-Projekt. Wird deine Status-Seite lesen, wird über IPv6 schreiben, zahlt pünktlich, $30/Mon ist für ihn nichts. $400, um ihn vorzustellen. Er wählt den Anbieter.',
  },
  'Jordan Smith — bargain-hunter, hobby-tier': {
    title: 'Jordan Smith — Schnäppchenjäger, Hobby-Tier',
    body: 'Jordan schreibt zur Verlängerung drei Hostern eine Rabattanfrage. Wird letztlich auf dem günstigen Plan zahlen. Wird auch pro Quartal ein Refund-Ticket öffnen. Wir berechnen pauschal $80, um sie loszuwerden — dein Problem.',
  },
  'Beth Park — $50 fire-sale, do not say we didn\'t warn you': {
    title: 'Beth Park — $50 Ausverkauf, sag nicht, wir hätten dich nicht gewarnt',
    body: 'Beth ist eine "Karen". Hat bei uns in zwei Wochen drei P1-Tickets eingereicht. Hasst ihren aktuellen Hoster. Wird ihren nächsten auch hassen. Wir verlangen $50, um sie jemand anderem aufzudrücken. Hobby-Tier, Zufriedenheit startet bei 25, du wurdest gewarnt.',
  },
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/marketplace/npc-seeds.ts src/lib/marketplace/translations.ts
git commit -m "feat(marketplace): 5 new buyable lead seeds + HU/DE translations"
```

---

## Task 6: Re-seed D1 with new listings

**Files:** none (data-only step)

- [ ] **Step 1: Build the seed-insert SQL**

Generate SQL inserts for the 5 new seeds via a one-off Node script or by hand. Each row maps to the seed fields:

```sql
INSERT INTO marketplace_listings
  (author_id, category, title, body, price_cents, price_unit, posted_at, is_npc, is_active, effect_type, effect_payload)
VALUES
  ('npc-pixelforge', 'leads', 'Sarah Chen wants stable hobby hosting — referral $200',
   'Sarah runs a small DTC skincare shop on Squarespace. Wants a real $5-15/mo VPS for her staging environment. Loyal type — pays on time, asks once a quarter if everything''s fine. We are full, sending her your way for a flat $200 referral. She picks the host.',
   20000, 'one_time', strftime('%s','now') - (6*3600), 1, 1,
   'spawn_customer',
   '{"archetype":"loyalist","name":"Sarah Chen","plan_tier":"hobby","starting_satisfaction":75}'),
  ('npc-riverside', 'leads', 'Tomás López — first-time founder needs hand-holding',
   'Tomás just left his sysadmin job to launch a local-business directory. Doesn''t know what a CNAME is yet but is patient and pays in advance. Cheap hobby tier, lots of support tickets but kind. $150 finder.',
   15000, 'one_time', strftime('%s','now') - (12*3600), 1, 1,
   'spawn_customer',
   '{"archetype":"newbie","name":"Tomás López","plan_tier":"hobby","starting_satisfaction":60}'),
  ('npc-aurora-data', 'leads', 'Avery Tran — business-tier, RFC-quoting senior engineer',
   'Avery is a principal engineer at a fintech. Wants a business-tier setup for his side project. Will read your status page, will email you about IPv6, will pay on time, will not blink at $30/mo. Worth $400 to introduce. He picks the host.',
   40000, 'one_time', strftime('%s','now') - (2*3600), 1, 1,
   'spawn_customer',
   '{"archetype":"pro","name":"Avery Tran","plan_tier":"business","starting_satisfaction":60}'),
  ('npc-belvedere', 'leads', 'Jordan Smith — bargain-hunter, hobby-tier',
   'Jordan emails three hosts every renewal cycle asking for a discount. They will pay, eventually, on the cheap plan. They will also open a refund ticket once a quarter. We charged a flat $80 to get rid of them — your funeral.',
   8000, 'one_time', strftime('%s','now') - (30*3600), 1, 1,
   'spawn_customer',
   '{"archetype":"cheapskate","name":"Jordan Smith","plan_tier":"hobby","starting_satisfaction":45}'),
  ('npc-maelstrom', 'leads', 'Beth Park — $50 fire-sale, do not say we didn''t warn you',
   'Beth is a "Karen". She has filed three P1 tickets at us in two weeks. Hates her current host. Will hate her next host. We are charging $50 to make her someone else''s problem. Hobby tier, sat starts at 25, you have been warned.',
   5000, 'one_time', strftime('%s','now') - (1*3600), 1, 1,
   'spawn_customer',
   '{"archetype":"karen","name":"Beth Park","plan_tier":"hobby","starting_satisfaction":25}');
```

Save it as `migrations/0010b_marketplace_seed_buyable_leads.sql` for future-replay traceability.

- [ ] **Step 2: Apply the seeds to D1 via REST API**

```bash
SQL=$(cat migrations/0010b_marketplace_seed_buyable_leads.sql | jq -Rs .)
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database/$DB_ID/query" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_KEY" -H "Content-Type: application/json" \
  -d "{\"sql\": $SQL}"
```

Expected: `{"success":true, ...}` with `meta.changes: 5`.

- [ ] **Step 3: Verify**

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database/$DB_ID/query" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_KEY" -H "Content-Type: application/json" \
  -d '{"sql": "SELECT title, price_cents, effect_type FROM marketplace_listings WHERE effect_type = '\''spawn_customer'\'' ORDER BY id"}'
```

Expected: 5 rows, titles match the 5 new leads.

- [ ] **Step 4: Commit the seed SQL**

```bash
git add migrations/0010b_marketplace_seed_buyable_leads.sql
git commit -m "feat(marketplace): seed 5 buyable lead listings into D1"
```

---

## Task 7: i18n keys for buy-flow chrome

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add 9 keys to the EN section**

In `src/lib/i18n.ts`, find the `en:` block and add (placed near the existing `marketplace.*` keys):

```typescript
    'marketplace.buy_cta': 'Buy ${price}',
    'marketplace.buy_confirm_title': 'Confirm purchase',
    'marketplace.buy_confirm_body': '{name} ({archetype}, {tier} tier) for ${price}. Paying from day 1 at your current {tier} price.',
    'marketplace.buy_confirm_ok': 'Buy',
    'marketplace.buy_confirm_cancel': 'Cancel',
    'marketplace.buy_success': '+1 customer: {name}',
    'marketplace.sold_badge': 'SOLD',
    'marketplace.err.insufficient_cash': 'Not enough cash',
    'marketplace.err.sold': 'Already sold',
```

- [ ] **Step 2: Add the HU translations**

In the `hu:` block:

```typescript
    'marketplace.buy_cta': 'Vétel ${price}',
    'marketplace.buy_confirm_title': 'Vásárlás megerősítése',
    'marketplace.buy_confirm_body': '{name} ({archetype}, {tier} szint) ${price}-ért. Első naptól fizet a jelenlegi {tier} áradon.',
    'marketplace.buy_confirm_ok': 'Megveszem',
    'marketplace.buy_confirm_cancel': 'Mégse',
    'marketplace.buy_success': '+1 ügyfél: {name}',
    'marketplace.sold_badge': 'ELADVA',
    'marketplace.err.insufficient_cash': 'Nincs elég készpénz',
    'marketplace.err.sold': 'Már elkelt',
```

- [ ] **Step 3: Add the DE translations**

In the `de:` block:

```typescript
    'marketplace.buy_cta': 'Kaufen ${price}',
    'marketplace.buy_confirm_title': 'Kauf bestätigen',
    'marketplace.buy_confirm_body': '{name} ({archetype}, {tier}-Stufe) für ${price}. Zahlt ab Tag 1 zu deinem aktuellen {tier}-Preis.',
    'marketplace.buy_confirm_ok': 'Kaufen',
    'marketplace.buy_confirm_cancel': 'Abbrechen',
    'marketplace.buy_success': '+1 Kunde: {name}',
    'marketplace.sold_badge': 'VERKAUFT',
    'marketplace.err.insufficient_cash': 'Nicht genug Geld',
    'marketplace.err.sold': 'Bereits verkauft',
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat(i18n): marketplace buy-flow keys (EN/HU/DE)"
```

---

## Task 8: Marketplace UI — buy button + confirm modal + toast

**Files:**
- Modify: `src/pages/play/marketplace.astro`

- [ ] **Step 1: In the frontmatter, prepare buy-related labels and a per-listing CTA helper**

After the existing `formatPrice()` declaration in the frontmatter (around line 65), add:

```typescript
const BUY_CTA_TEMPLATE = t(viewerLang, 'marketplace.buy_cta');
const SOLD_BADGE = t(viewerLang, 'marketplace.sold_badge');
const CONFIRM_TITLE = t(viewerLang, 'marketplace.buy_confirm_title');
const CONFIRM_BODY_TEMPLATE = t(viewerLang, 'marketplace.buy_confirm_body');
const CONFIRM_OK = t(viewerLang, 'marketplace.buy_confirm_ok');
const CONFIRM_CANCEL = t(viewerLang, 'marketplace.buy_confirm_cancel');
const BUY_SUCCESS_TEMPLATE = t(viewerLang, 'marketplace.buy_success');
const ERR_INSUFFICIENT = t(viewerLang, 'marketplace.err.insufficient_cash');
const ERR_SOLD_LABEL = t(viewerLang, 'marketplace.err.sold');
```

- [ ] **Step 2: Render the buy button or SOLD badge in the listing card**

Find the listing-card rendering block in `marketplace.astro` (the `{listings.map((l) => (` JSX). Inside each `<article>`, after the existing `<p class="text-sm text-nt-text-dim line-clamp-3 ...">{l.body}</p>` and the category-badge row, add:

```jsx
{l.category === 'leads' && l.effect_type === 'spawn_customer' && (
  l.sold_at !== null ? (
    <span class="inline-block mt-2 px-2 py-1 text-[10px] uppercase tracking-wide bg-nt-bg rounded text-nt-text-dim">{SOLD_BADGE}</span>
  ) : (
    <button
      type="button"
      class="mt-2 px-3 py-1.5 bg-nt-accent rounded text-sm font-semibold hover:opacity-90 transition buy-btn"
      data-listing-id={l.id}
      data-payload={l.effect_payload ?? ''}
      data-price-cents={l.price_cents}
    >
      {BUY_CTA_TEMPLATE.replace('${price}', formatPrice(l.price_cents, 'one_time'))}
    </button>
  )
)}
```

- [ ] **Step 3: Add confirm modal markup at the bottom of the page (before `</Base>`)**

```jsx
<div id="buy-confirm-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
  <div class="bg-nt-bg-2 border border-nt-border rounded-lg p-6 max-w-md w-full mx-4 space-y-3">
    <h3 class="text-lg font-bold">{CONFIRM_TITLE}</h3>
    <p id="buy-confirm-body" class="text-sm text-nt-text-dim whitespace-pre-line"></p>
    <div class="flex items-center gap-2 mt-4">
      <button id="buy-confirm-ok" type="button" class="px-4 py-2 bg-nt-accent rounded font-semibold text-sm hover:opacity-90 transition">{CONFIRM_OK}</button>
      <button id="buy-confirm-cancel" type="button" class="px-4 py-2 text-nt-text-dim hover:text-nt-text text-sm transition">{CONFIRM_CANCEL}</button>
      <p id="buy-confirm-status" class="text-sm ml-auto" aria-live="polite"></p>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Wire the buy-click flow in the page `<script>` block**

Inside the existing `<script define:vars={{ postingLabel, errorPrefix, errorUnknown }}>` block, after the existing form-submit handler, append:

```javascript
// ─── Buy-flow (leads category) ────────────────────────────────────
const archetypeLabels = ARCHETYPE_LABELS;  // injected below via define:vars extension
const tierLabels = { hobby: 'hobby', business: 'business', vps: 'vps', dedicated: 'dedicated' };

const buyModal = document.getElementById('buy-confirm-modal');
const buyBody = document.getElementById('buy-confirm-body');
const buyOk = document.getElementById('buy-confirm-ok');
const buyCancel = document.getElementById('buy-confirm-cancel');
const buyStatus = document.getElementById('buy-confirm-status');

let pendingBuy = null; // { id, payload, priceCents }

function openBuyModal(listingId, payloadStr, priceCents) {
  let p;
  try { p = JSON.parse(payloadStr); } catch { return; }
  pendingBuy = { id: listingId, payload: p, priceCents };
  const archLabel = archetypeLabels[p.archetype] ?? p.archetype;
  const tierLabel = tierLabels[p.plan_tier] ?? p.plan_tier;
  const priceStr = '$' + (priceCents / 100).toFixed(0);
  const body = CONFIRM_BODY.replace('{name}', p.name)
    .replace('{archetype}', archLabel)
    .replaceAll('{tier}', tierLabel)
    .replace('${price}', priceStr);
  if (buyBody) buyBody.textContent = body;
  if (buyStatus) { buyStatus.textContent = ''; buyStatus.className = 'text-sm ml-auto'; }
  buyModal?.classList.remove('hidden');
}
function closeBuyModal() {
  buyModal?.classList.add('hidden');
  pendingBuy = null;
}
buyCancel?.addEventListener('click', closeBuyModal);
buyModal?.addEventListener('click', (e) => { if (e.target === buyModal) closeBuyModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && buyModal && !buyModal.classList.contains('hidden')) closeBuyModal(); });

document.querySelectorAll('.buy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = parseInt(btn.getAttribute('data-listing-id') ?? '0', 10);
    const payload = btn.getAttribute('data-payload') ?? '';
    const price = parseInt(btn.getAttribute('data-price-cents') ?? '0', 10);
    if (id && payload) openBuyModal(id, payload, price);
  });
});

buyOk?.addEventListener('click', async () => {
  if (!pendingBuy) return;
  if (buyStatus) { buyStatus.textContent = '...'; buyStatus.className = 'text-sm text-nt-text-dim ml-auto'; }
  const r = await fetch(`/api/marketplace/purchase/${pendingBuy.id}`, { method: 'POST', headers: { 'content-type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    const code = j.error ?? 'unknown';
    const msg = code === 'insufficient_cash' ? ERR_INSUFFICIENT_CASH
      : code === 'sold' ? ERR_SOLD
      : (ERR_PREFIX + code);
    if (buyStatus) { buyStatus.textContent = msg; buyStatus.className = 'text-sm text-red-400 ml-auto'; }
    return;
  }
  // Success — toast + reload (sold badge appears, customers updated).
  const successMsg = BUY_SUCCESS.replace('{name}', j.customer_name ?? '');
  closeBuyModal();
  // Reuse the existing toast convention via a transient div.
  const t = document.createElement('div');
  t.textContent = successMsg;
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--panel,#121626);border:1px solid var(--mint,#34d399);color:var(--mint,#34d399);padding:12px 18px;border-radius:8px;font-size:14px;font-weight:600;z-index:60;box-shadow:0 12px 32px -8px rgba(52,211,153,.4);';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
  setTimeout(() => location.reload(), 600);
});
```

- [ ] **Step 5: Extend the script's `define:vars` to inject the new labels**

Update the `<script define:vars={{ postingLabel, errorPrefix, errorUnknown }}>` opening tag in `marketplace.astro` to:

```jsx
<script define:vars={{
  postingLabel, errorPrefix, errorUnknown,
  CONFIRM_BODY: CONFIRM_BODY_TEMPLATE,
  BUY_SUCCESS: BUY_SUCCESS_TEMPLATE,
  ERR_INSUFFICIENT_CASH: ERR_INSUFFICIENT,
  ERR_SOLD: ERR_SOLD_LABEL,
  ERR_PREFIX: errorPrefix,
  ARCHETYPE_LABELS: {
    newbie: t(viewerLang, 'shift.archetype.newbie'),
    pro: t(viewerLang, 'shift.archetype.pro'),
    cheapskate: t(viewerLang, 'shift.archetype.cheapskate'),
    karen: t(viewerLang, 'shift.archetype.karen'),
    loyalist: t(viewerLang, 'shift.archetype.loyalist'),
    ghost: t(viewerLang, 'shift.archetype.ghost'),
    drama: t(viewerLang, 'shift.archetype.drama'),
    crypto: t(viewerLang, 'shift.archetype.crypto'),
  },
}}>
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/play/marketplace.astro
git commit -m "feat(marketplace): buy button + confirm modal + success toast on leads"
```

---

## Task 9: Smoke test E2E (post-deploy)

**Files:** none

- [ ] **Step 1: Verify the deploy succeeded**

Push the branch and merge to `main`. Cloudflare Pages auto-deploys (~2 min). Check `https://hyperscales.app/play/marketplace?category=leads` loads.

- [ ] **Step 2: Run the smoke flow as `audithu@hyperscales.local`** (HU locale)

1. Log in.
2. Open `/play/marketplace?category=leads` — see 8 listings (3 informational + 5 buyable). 5 of them have "Vétel $X" button.
3. Note the player's current cash on `/play` topbar.
4. Click "Vétel $200" on Sarah Chen.
5. Confirm modal opens with HU body: *"Sarah Chen (hűséges, hobby szint) $200-ért. Első naptól fizet a jelenlegi hobby áradon."*
6. Click "Megveszem".
7. Success toast appears: *"+1 ügyfél: Sarah Chen"*.
8. Page reloads. Sarah Chen listing now shows "ELADVA" badge, no button.
9. Navigate to `/play/customers` — Sarah Chen visible, archetype=hűséges, plan_tier=hobby.
10. Navigate to `/play/finance` — cash reduced by $200.

- [ ] **Step 3: Run the negative-path checks**

1. As `audithu` with low cash (< $400), try to buy Avery Tran → confirm modal opens, click Megveszem → red status: *"Nincs elég készpénz"*.
2. Open marketplace in two tabs as the same user, click Megveszem on Tomás López in both → only one succeeds, the other shows *"Már elkelt"*.

- [ ] **Step 4: Run on EN + DE audit users to verify locale parity**

- `auditen@hyperscales.local` — confirm modal body reads English, success toast English.
- `auditde@hyperscales.local` — confirm modal body reads German, success toast German.

- [ ] **Step 5: Mark the spec implemented**

Append a one-line status update to the design doc:

```markdown
**Implemented:** 2026-05-15 — PR #<N>. Smoke-tested on EN/HU/DE audit users.
```

Commit:

```bash
git add docs/superpowers/specs/2026-05-15-marketplace-leads-buy-design.md
git commit -m "docs(spec): mark marketplace leads buy-flow implemented"
```

---

## Done definition

- All 9 tasks above committed.
- `npx vitest run src/lib/marketplace/__tests__/buy.test.ts` passes (9/9).
- Smoke flow on hyperscales.app HU/EN/DE returns success toast + cash deduction + customer row + SOLD badge.
- No new TypeScript errors introduced (pre-existing repo errors unaffected).
- Spec doc has "Implemented" timestamp footer.
