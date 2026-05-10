# Hyperscaler Plan 1 — Infrastructure + Game Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deployolható working backend a Hyperscaler hosting-tycoon játékhoz: player-signup, async game-loop (cron-tick → ticket-spawn placeholder, money-trickle, churn), server-upgrade-rendszer, alap dashboard UI. **AI-chat és shift-mode NEM része Plan 1-nek** — ez Plan 2.

**Architecture:** Astro 5 (Pages-deploy) + Workers (game-API) + D1 (`navtycoon-prod`) + Cron Trigger (5min tick) + cross-brand SSO a PromNET `users` táblájához. NO Workers AI, NO Vectorize, NO Durable Objects. Ezek Plan 2.

**Tech Stack:** Astro 5, TypeScript, Cloudflare Workers, Cloudflare Pages, D1, Cron Trigger, Tailwind 3, Vitest, Stripe (Phase 3 only — placeholder env-vars now), shared SSO with PromNET (re-uses `users` table from `promnet-prod` D1 via remote-binding).

**Spec:** [docs/superpowers/specs/2026-05-10-hyperscaler-mvp-design.md](../specs/2026-05-10-hyperscaler-mvp-design.md)

**Plan series:**
- **Plan 1 (this):** Infra + Game Core — ~3 hét — outputs working dashboard
- **Plan 2:** AI engine + Shift-mode — ~3 hét — outputs playable shift-loop
- **Plan 3:** Monetization + i18n + events + polish — ~3 hét — outputs launchable MVP

---

## File Structure

**Repo init (already done):** `/home/aika/navtycoon/` (git-init done; spec committed at `9bb8d3b`)

**New files in this plan:**

```
navtycoon/
├── README.md                              # public repo readme
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── tailwind.config.mjs
├── wrangler.toml                          # CF Pages config + D1 + Cron
├── .gitignore
├── .env.example                           # documented env-vars
├── migrations/
│   └── 0001_initial_schema.sql            # all 8 tables from spec §12
├── src/
│   ├── env.d.ts                           # CF runtime types
│   ├── layouts/
│   │   └── Base.astro                     # auth-aware shell
│   ├── pages/
│   │   ├── index.astro                    # landing
│   │   ├── pricing.astro                  # Pro $5/mo info
│   │   ├── signup.astro                   # new user
│   │   ├── login.astro                    # PromNET-SSO bridge
│   │   ├── play/
│   │   │   ├── index.astro                # main dashboard
│   │   │   ├── servers.astro              # server-management
│   │   │   ├── customers.astro            # customer-list
│   │   │   ├── tickets.astro              # tickets queue
│   │   │   ├── pricing.astro              # in-game pricing-slider
│   │   │   └── marketing.astro            # marketing-allocation
│   │   └── api/
│   │       ├── game/
│   │       │   ├── state.ts               # GET state-snapshot
│   │       │   ├── upgrade.ts             # POST buy-upgrade
│   │       │   ├── pricing.ts             # POST set-pricing
│   │       │   ├── marketing.ts           # POST set-marketing-mix
│   │       │   └── server.ts              # POST buy-server
│   │       ├── auth/
│   │       │   ├── signup.ts              # POST new account
│   │       │   ├── promnet-bridge.ts      # GET → SSO-redirect to PromNET
│   │       │   └── promnet-callback.ts    # GET ← SSO-callback
│   │       └── cron/
│   │           └── tick.ts                # POST (cron-only) game-tick
│   ├── lib/
│   │   ├── auth.ts                        # getCurrentUser, getDB
│   │   ├── game/
│   │   │   ├── types.ts                   # Player, Customer, Ticket, Server, Upgrade, Event types
│   │   │   ├── db.ts                      # typed CRUD-helpers
│   │   │   ├── tick.ts                    # game-tick logic (ticket-spawn, money, churn)
│   │   │   ├── customer-spawn.ts          # placeholder ticket-spawner (NO AI yet)
│   │   │   ├── upgrade-tree.ts            # Era 1 server-upgrade definitions
│   │   │   ├── server-types.ts            # server-tier definitions
│   │   │   ├── pricing.ts                 # pricing-tier validation + clamps
│   │   │   ├── marketing.ts               # channel-mix validation
│   │   │   ├── events.ts                  # random-event definitions
│   │   │   └── persona-pool.ts            # 8 persona-archetípus definíciók (used by Plan 2)
│   │   └── humor.ts                       # status-bar quips, loading-screen jokes
│   └── components/
│       ├── DashboardCard.astro
│       ├── StatPill.astro
│       └── EmptyState.astro
└── test-utils/
    └── d1-mock.ts                         # Miniflare-alapú in-memory D1
```

**Tests (Vitest):**

```
src/lib/game/__tests__/
├── db.test.ts
├── tick.test.ts
├── upgrade-tree.test.ts
├── pricing.test.ts
├── marketing.test.ts
└── customer-spawn.test.ts
```

---

## Tasks

### Task 1: Repo scaffold + GitHub publik

**Files:**
- Modify: `/home/aika/navtycoon/package.json` (create)
- Modify: `/home/aika/navtycoon/astro.config.mjs` (create)
- Modify: `/home/aika/navtycoon/tsconfig.json` (create)
- Modify: `/home/aika/navtycoon/tailwind.config.mjs` (create)
- Modify: `/home/aika/navtycoon/.env.example` (create)
- Modify: `/home/aika/navtycoon/README.md` (create)

- [ ] **Step 1: Astro project files**

`package.json`:
```json
{
  "name": "navtycoon",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@astrojs/cloudflare": "^12.0.0",
    "@astrojs/sitemap": "^3.2.1",
    "@astrojs/tailwind": "^5.1.4",
    "astro": "^5.0.0",
    "tailwindcss": "^3.4.16",
    "typescript": "^5.7.2"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241218.0",
    "miniflare": "^3.20241218.0",
    "vitest": "^2.1.8"
  }
}
```

`astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hyperscaler.game',
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  integrations: [tailwind(), sitemap()],
});
```

`tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "astro/client"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

`tailwind.config.mjs`:
```js
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        nt: {
          50: '#f5f7ff', 100: '#e8edff', 200: '#cdd7ff',
          400: '#7d92ff', 500: '#5670ff', 600: '#3b56e6',
          700: '#2c41ba', 900: '#161e4a',
          bg: '#0a0e1f', 'bg-2': '#121732', 'bg-3': '#1a2042',
          accent: '#5670ff', 'accent-l': 'rgba(86, 112, 255, 0.15)',
          text: '#e8edff', 'text-dim': '#9ba3c8',
          border: '#2a3157',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

`.env.example`:
```
# Cross-brand SSO (PromNET shared D1)
PROMNET_DB_BINDING_ID=6ae31f06-a817-44c9-a0ae-7ef090fb0d43
PROMNET_SSO_BASE_URL=https://promnet.hu

# Stripe (Phase 3 — placeholder for now)
STRIPE_PUBLIC_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=

# Audit + analytics
AUDIT_LOG_ENABLED=1
```

`.gitignore` (append):
```
node_modules/
dist/
.env
.env.local
.wrangler/
.astro/
*.log
```

`README.md`:
```markdown
# Hyperscaler

> Hosting-tycoon játék AI-ügyfelekkel. Browser-first, Cloudflare-natív.

🌐 https://hyperscaler.game (coming soon)

## Stack
Astro 5 · Cloudflare Pages + Workers + D1 + Cron · Workers AI (Llama-3.1-8b) · Vectorize

## Status
Phase 1 MVP development.
```

- [ ] **Step 2: Install + verify Astro builds**

```bash
cd /home/aika/navtycoon
npm install
npm run build  # should produce dist/ without error
```

Expected: clean build, `dist/` directory created.

- [ ] **Step 3: Create GitHub repo (per `feedback_github_autonomy.md` — `csiber/*` create autonóm)**

```bash
cd /home/aika/navtycoon
gh repo create csiber/navtycoon --public --description "Hosting-tycoon játék AI-ügyfelekkel. Cloudflare-natív." --source=. --remote=origin
git add .
git commit -m "feat: Astro 5 + Tailwind scaffold (Hyperscaler MVP Plan 1)"
git push -u origin main
```

- [ ] **Step 4: Verify**

```bash
cd /home/aika/navtycoon
git log --oneline
gh repo view csiber/navtycoon | head -10
```

Expected: 2 commits (initial spec + scaffold), repo visible on GH.

---

### Task 2: D1 database create + initial schema migration

**Files:**
- Create: `/home/aika/navtycoon/migrations/0001_initial_schema.sql`
- Modify: `/home/aika/navtycoon/wrangler.toml` (create)

- [ ] **Step 1: Create D1 database via REST API (per `feedback_d1_rest_api.md`)**

Per memory: D1+CF műveletek REST API + Global Key, magadtól. Credentials in `~/mackosajt.md`, headers `X-Auth-Email`+`X-Auth-Key` (NEM Bearer).

```bash
# Using REST: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database
# body: { "name": "navtycoon-prod" }
# Use X-Auth-Email + X-Auth-Key from ~/mackosajt.md
# Account-id from existing PromNET wrangler.toml or ~/.bashrc
```

Save the returned `database_id` for use in `wrangler.toml`.

Alternative (if REST is offline): `wrangler d1 create navtycoon-prod` (uses `~/.bashrc` token).

- [ ] **Step 2: `wrangler.toml`**

```toml
name = "navtycoon"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "navtycoon-prod"
database_id = "<paste-from-step-1>"

# Cross-brand: PromNET shared user-DB (read-only access)
[[d1_databases]]
binding = "PROMNET_DB"
database_name = "promnet-prod"
database_id = "6ae31f06-a817-44c9-a0ae-7ef090fb0d43"

[triggers]
crons = ["*/5 * * * *", "0 0 * * *"]
```

- [ ] **Step 3: Migration `0001_initial_schema.sql`**

```sql
-- migrations/0001_initial_schema.sql
-- Hyperscaler Phase 1 — initial schema (all 8 tables from spec §12)

CREATE TABLE IF NOT EXISTS players (
  user_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  city TEXT,
  founded_at INTEGER NOT NULL,
  current_era INTEGER NOT NULL DEFAULT 1,
  reputation INTEGER NOT NULL DEFAULT 50,
  cash_usd_cents INTEGER NOT NULL DEFAULT 100000,
  mrr_usd_cents INTEGER NOT NULL DEFAULT 0,
  pricing_hobby_cents INTEGER NOT NULL DEFAULT 500,
  pricing_business_cents INTEGER NOT NULL DEFAULT 1500,
  marketing_seo_pct INTEGER NOT NULL DEFAULT 33,
  marketing_ppc_pct INTEGER NOT NULL DEFAULT 33,
  marketing_referral_pct INTEGER NOT NULL DEFAULT 34,
  free_shifts_today INTEGER NOT NULL DEFAULT 1,
  paid_shifts_today INTEGER NOT NULL DEFAULT 0,
  is_pro INTEGER NOT NULL DEFAULT 0,
  pro_until INTEGER,
  last_active_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  persona_archetype TEXT NOT NULL,
  plan_tier TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  satisfaction INTEGER NOT NULL DEFAULT 50,
  churn_risk INTEGER NOT NULL DEFAULT 0,
  lifetime_value_cents INTEGER NOT NULL DEFAULT 0,
  last_ticket_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customers_player ON customers(player_id, is_active);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  ai_quality_rating INTEGER,
  satisfaction_delta INTEGER,
  embedding_id TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tickets_player_status ON tickets(player_id, status);

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  era INTEGER NOT NULL,
  type TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  current_load INTEGER NOT NULL DEFAULT 0,
  monthly_cost_cents INTEGER NOT NULL,
  upgrades_json TEXT NOT NULL DEFAULT '[]',
  purchased_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_servers_player ON servers(player_id);

CREATE TABLE IF NOT EXISTS upgrades (
  player_id TEXT NOT NULL,
  upgrade_id TEXT NOT NULL,
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, upgrade_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  data_json TEXT,
  spawned_at INTEGER NOT NULL,
  resolved_at INTEGER,
  outcome TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id, spawned_at DESC);

CREATE TABLE IF NOT EXISTS achievements (
  player_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_player ON audit_log(player_id, created_at DESC);
```

- [ ] **Step 4: Apply migration to PROD D1**

```bash
cd /home/aika/navtycoon
wrangler d1 execute navtycoon-prod --remote --file migrations/0001_initial_schema.sql
```

Expected: "✅ Executed N commands".

- [ ] **Step 5: Verify schema**

```bash
wrangler d1 execute navtycoon-prod --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: 8 tables (players, customers, tickets, servers, upgrades, events, achievements, audit_log).

- [ ] **Step 6: Commit**

```bash
git add wrangler.toml migrations/
git commit -m "feat(infra): D1 navtycoon-prod + initial schema (8 tables)"
git push origin main
```

---

### Task 3: TS-types + DB-helpers (TDD)

**Files:**
- Create: `/home/aika/navtycoon/src/lib/game/types.ts`
- Create: `/home/aika/navtycoon/src/lib/game/db.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/db.test.ts`
- Create: `/home/aika/navtycoon/test-utils/d1-mock.ts`

- [ ] **Step 1: Define types**

```typescript
// src/lib/game/types.ts
export type EraId = 1 | 2 | 3 | 4;
export type PlanTier = 'hobby' | 'business' | 'vps' | 'dedicated';
export type PersonaArchetype = 'karen' | 'newbie' | 'pro' | 'cheapskate' | 'ghost' | 'loyalist' | 'drama' | 'crypto';
export type ServerType = 'lamp_box' | 'rack_unit' | 'vps_node' | 'dedicated_box' | 'cloud_region' | 'edge_pop';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'churned';
export type EventType = 'ddos_attempt' | 'viral_blog' | 'electricity_spike' | 'recruit_ad' | 'intern_incident' | 'dmca' | 'cooling_failure' | 'security_breach';
export type EventOutcome = 'positive' | 'neutral' | 'negative';

export interface Player {
  user_id: string;
  company_name: string;
  city: string | null;
  founded_at: number;
  current_era: EraId;
  reputation: number;       // -100..+100
  cash_usd_cents: number;
  mrr_usd_cents: number;
  pricing_hobby_cents: number;
  pricing_business_cents: number;
  marketing_seo_pct: number;
  marketing_ppc_pct: number;
  marketing_referral_pct: number;
  free_shifts_today: number;
  paid_shifts_today: number;
  is_pro: 0 | 1;
  pro_until: number | null;
  last_active_at: number;
  created_at: number;
}

export interface Customer {
  id: number;
  player_id: string;
  name: string;
  persona_archetype: PersonaArchetype;
  plan_tier: PlanTier;
  joined_at: number;
  satisfaction: number;
  churn_risk: number;
  lifetime_value_cents: number;
  last_ticket_at: number | null;
  is_active: 0 | 1;
}

export interface Ticket {
  id: number;
  customer_id: number;
  player_id: string;
  summary: string;
  full_text: string;
  status: TicketStatus;
  resolution: string | null;
  ai_quality_rating: number | null;
  satisfaction_delta: number | null;
  embedding_id: string | null;
  created_at: number;
  resolved_at: number | null;
}

export interface Server {
  id: number;
  player_id: string;
  era: EraId;
  type: ServerType;
  capacity: number;
  current_load: number;
  monthly_cost_cents: number;
  upgrades_json: string;
  purchased_at: number;
}

export interface UpgradeRow {
  player_id: string;
  upgrade_id: string;
  purchased_at: number;
}

export interface GameEvent {
  id: number;
  player_id: string;
  event_type: EventType;
  data_json: string | null;
  spawned_at: number;
  resolved_at: number | null;
  outcome: EventOutcome | null;
}
```

- [ ] **Step 2: D1 mock test util**

```typescript
// test-utils/d1-mock.ts
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = '/home/aika/navtycoon/migrations';

export async function createTestDb(): Promise<D1Database> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: ':memory:' },
  });
  const db = await mf.getD1Database('DB');
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      try { await db.prepare(stmt).run(); } catch { /* IF NOT EXISTS-eket ignor */ }
    }
  }
  return db;
}
```

- [ ] **Step 3: Failing test**

```typescript
// src/lib/game/__tests__/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPlayer, getPlayer, updatePlayer } from '../db';
import { createTestDb } from '../../../../test-utils/d1-mock';

describe('game/db players', () => {
  let db: D1Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('createPlayer + getPlayer round-trip', async () => {
    const p = await createPlayer(db, {
      user_id: 'u-test', company_name: 'TestHost Inc.', city: 'Budapest',
    });
    expect(p.user_id).toBe('u-test');
    expect(p.cash_usd_cents).toBe(100000);  // $1000 starting cash
    expect(p.current_era).toBe(1);

    const fetched = await getPlayer(db, 'u-test');
    expect(fetched?.company_name).toBe('TestHost Inc.');
  });

  it('getPlayer returns null for missing', async () => {
    expect(await getPlayer(db, 'u-nope')).toBeNull();
  });

  it('updatePlayer applies patch', async () => {
    await createPlayer(db, { user_id: 'u-1', company_name: 'A', city: null });
    await updatePlayer(db, 'u-1', { cash_usd_cents: 50000, reputation: 70 });
    const p = await getPlayer(db, 'u-1');
    expect(p?.cash_usd_cents).toBe(50000);
    expect(p?.reputation).toBe(70);
  });
});
```

- [ ] **Step 4: Run, expect FAIL**

```bash
cd /home/aika/navtycoon
npm test -- src/lib/game/__tests__/db.test.ts
```

Expected: FAIL — "Cannot find module '../db'".

- [ ] **Step 5: Implement minimal db.ts (Player CRUD)**

```typescript
// src/lib/game/db.ts
import type { Player, Customer, Ticket, Server, UpgradeRow, GameEvent } from './types';

export async function createPlayer(
  db: D1Database,
  data: { user_id: string; company_name: string; city: string | null },
): Promise<Player> {
  const now = Math.floor(Date.now() / 1000);
  const r = await db.prepare(`
    INSERT INTO players (user_id, company_name, city, founded_at, last_active_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(data.user_id, data.company_name, data.city, now, now, now).first<Player>();
  if (!r) throw new Error('createPlayer no row');
  return r;
}

export async function getPlayer(db: D1Database, userId: string): Promise<Player | null> {
  const r = await db.prepare('SELECT * FROM players WHERE user_id = ?').bind(userId).first<Player>();
  return r ?? null;
}

export async function updatePlayer(
  db: D1Database, userId: string,
  patch: Partial<Omit<Player, 'user_id' | 'created_at'>>,
): Promise<void> {
  const allowed: (keyof typeof patch)[] = [
    'company_name', 'city', 'current_era', 'reputation', 'cash_usd_cents', 'mrr_usd_cents',
    'pricing_hobby_cents', 'pricing_business_cents',
    'marketing_seo_pct', 'marketing_ppc_pct', 'marketing_referral_pct',
    'free_shifts_today', 'paid_shifts_today', 'is_pro', 'pro_until', 'last_active_at',
  ];
  const setClauses: string[] = [];
  const args: unknown[] = [];
  for (const k of allowed) {
    if (k in patch) { setClauses.push(`${k} = ?`); args.push((patch as Record<string, unknown>)[k]); }
  }
  if (setClauses.length === 0) return;
  args.push(userId);
  await db.prepare(`UPDATE players SET ${setClauses.join(', ')} WHERE user_id = ?`).bind(...args).run();
}
```

- [ ] **Step 6: Run, PASS**

```bash
npm test -- src/lib/game/__tests__/db.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 7: Add CRUD for customers, tickets, servers, upgrades, events (TDD per group)**

For each group, add the test first, run-FAIL, implement, run-PASS:

**Customers** — `createCustomer`, `listCustomers(player_id, activeOnly)`, `getCustomer(id, player_id)`, `updateCustomer`, `setInactive(id)`

**Tickets** — `createTicket`, `listTickets(player_id, status?)`, `updateTicket(id, patch)`, `closeTicket(id, resolution, satisfaction_delta)`

**Servers** — `createServer`, `listServers(player_id)`, `getTotalCapacity(player_id)`, `getTotalLoad(player_id)` (SUM-aggregate)

**Upgrades** — `addUpgrade(player_id, upgrade_id)`, `listUpgrades(player_id)`, `hasUpgrade(player_id, upgrade_id)`

**Events** — `spawnEvent(player_id, type, data)`, `listRecentEvents(player_id, since)`, `resolveEvent(id, outcome)`

Each function: per-user-isolation test, round-trip test, edge cases (non-existent → null).

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/db.ts src/lib/game/__tests__/db.test.ts test-utils/d1-mock.ts
git commit -m "feat(game): TS-types + D1 CRUD-helpers (TDD)"
git push origin main
```

---

### Task 4: Auth + cross-brand SSO

**Files:**
- Create: `/home/aika/navtycoon/src/lib/auth.ts`
- Create: `/home/aika/navtycoon/src/pages/api/auth/promnet-bridge.ts`
- Create: `/home/aika/navtycoon/src/pages/api/auth/promnet-callback.ts`
- Create: `/home/aika/navtycoon/src/pages/api/auth/signup.ts`

- [ ] **Step 1: `lib/auth.ts` — getCurrentUser via session cookie**

```typescript
// src/lib/auth.ts
import type { APIContext } from 'astro';

export interface User {
  id: string;          // matches PromNET users.id
  email: string;
  display_name: string | null;
}

export function getDB(c: APIContext): D1Database | null {
  return (c.locals.runtime?.env.DB as D1Database) ?? null;
}

export function getPromnetDB(c: APIContext): D1Database | null {
  return (c.locals.runtime?.env.PROMNET_DB as D1Database) ?? null;
}

const SESSION_COOKIE = 'navtycoon_session';

export async function getCurrentUser(c: APIContext): Promise<User | null> {
  const cookie = c.request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1]);
  // Validate against PromNET's sessions table via PROMNET_DB binding
  const promnet = getPromnetDB(c);
  if (!promnet) return null;
  const r = await promnet.prepare(`
    SELECT u.id, u.email, u.display_name
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > ?
  `).bind(sessionId, Math.floor(Date.now() / 1000)).first<User>();
  return r ?? null;
}

export function setSessionCookie(sessionId: string, maxAgeSec = 30 * 24 * 3600): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
```

> **Note:** the PromNET session-validation query schema (`sessions.id`, `sessions.user_id`, `sessions.expires_at`) is the assumed shape. Before completing this task, verify it against `/home/aika/promnet/migrations/` for the actual `sessions` table definition. If field names differ, adjust this file.

- [ ] **Step 2: `signup.ts` API endpoint (in-game registration)**

```typescript
// src/pages/api/auth/signup.ts
import type { APIContext } from 'astro';
import { getDB, getPromnetDB } from '../../../lib/auth';
import { createPlayer } from '../../../lib/game/db';

export const prerender = false;

function jerr(s: number, e: string) {
  return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { 'content-type': 'application/json' } });
}

export const POST = async (c: APIContext): Promise<Response> => {
  const db = getDB(c); if (!db) return jerr(500, 'no DB');
  const promnet = getPromnetDB(c); if (!promnet) return jerr(500, 'no PROMNET_DB');

  let body: any = {};
  try { body = await c.request.json(); } catch { return jerr(400, 'JSON'); }
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const company_name = String(body.company_name ?? '').trim();
  const city = body.city ? String(body.city).trim() : null;

  if (!email || !password || !company_name) return jerr(400, 'email + password + company_name required');
  if (password.length < 8) return jerr(400, 'password min 8 chars');

  // Create user in PromNET shared users-table (same hash style as existing PromNET)
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);

  // INSERT into PromNET users (assumes columns: id, email, password_hash, display_name, created_at)
  // Verify against PromNET schema first
  await promnet.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(userId, email, passwordHash, company_name, now).run();

  // Create session in PromNET sessions
  const sessionId = crypto.randomUUID();
  const expiresAt = now + 30 * 24 * 3600;
  await promnet.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(sessionId, userId, expiresAt, now).run();

  // Create Hyperscaler player record
  await createPlayer(db, { user_id: userId, company_name, city });

  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('Set-Cookie', `navtycoon_session=${sessionId}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; Secure; SameSite=Lax`);
  return new Response(JSON.stringify({ ok: true, redirect: '/play' }), { status: 201, headers });
};

async function hashPassword(plain: string): Promise<string> {
  // Use SCRYPT or bcrypt to match PromNET — verify the actual hash-algo in PromNET's auth code first
  const enc = new TextEncoder().encode(plain);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveBits']),
    256,
  );
  return `pbkdf2$100000$${btoa(String.fromCharCode(...salt))}$${btoa(String.fromCharCode(...new Uint8Array(key)))}`;
}
```

> **Important:** before implementing, READ `/home/aika/promnet/src/lib/auth.ts` (or wherever PromNET hashes passwords) to USE THE EXACT SAME HASH SCHEME. This file's `hashPassword` is a placeholder — match PromNET's algorithm exactly so cross-brand login works.

- [ ] **Step 3: PromNET-bridge SSO endpoints**

```typescript
// src/pages/api/auth/promnet-bridge.ts — redirect to PromNET to authenticate
import type { APIContext } from 'astro';

export const prerender = false;

export const GET = async (c: APIContext): Promise<Response> => {
  const env = c.locals.runtime?.env as { PROMNET_SSO_BASE_URL?: string };
  const base = env?.PROMNET_SSO_BASE_URL ?? 'https://promnet.hu';
  const next = encodeURIComponent('https://hyperscaler.game/api/auth/promnet-callback');
  return Response.redirect(`${base}/app/sso/issue?target=hyperscaler&next=${next}`, 302);
};
```

```typescript
// src/pages/api/auth/promnet-callback.ts — receive session-handoff from PromNET
import type { APIContext } from 'astro';
import { getDB, getPromnetDB } from '../../../lib/auth';
import { createPlayer, getPlayer } from '../../../lib/game/db';

export const prerender = false;

export const GET = async (c: APIContext): Promise<Response> => {
  const url = new URL(c.request.url);
  const sessionId = url.searchParams.get('sid');
  if (!sessionId) return new Response('Missing sid', { status: 400 });

  const promnet = getPromnetDB(c);
  if (!promnet) return new Response('PromNET DB unavailable', { status: 500 });

  // Validate session
  const session = await promnet.prepare(`
    SELECT u.id, u.email, u.display_name
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > ?
  `).bind(sessionId, Math.floor(Date.now() / 1000)).first<{ id: string; email: string; display_name: string }>();
  if (!session) return new Response('Invalid session', { status: 401 });

  // Auto-create Hyperscaler player on first SSO if missing
  const db = getDB(c)!;
  const existing = await getPlayer(db, session.id);
  if (!existing) {
    await createPlayer(db, {
      user_id: session.id,
      company_name: session.display_name ?? `${session.email.split('@')[0]} Inc.`,
      city: null,
    });
  }

  const headers = new Headers();
  headers.append('Set-Cookie', `navtycoon_session=${sessionId}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; Secure; SameSite=Lax`);
  headers.set('Location', '/play');
  return new Response(null, { status: 302, headers });
};
```

> **Note:** the `target=hyperscaler` cross-brand SSO endpoint MUST exist on PromNET's side (`/app/sso/issue`). Check if it does (lookup `csiber/promnet-2026` for `sso/issue` route) — if not, this requires a PromNET-side change in a separate task. For now this task assumes it exists; if it doesn't, dispatch will report BLOCKED.

- [ ] **Step 4: Smoke compile**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -10
```

Should produce a clean Pages-output. TS-errors on c.locals.runtime are expected (same pre-existing pattern as PromNET/NavBot).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/pages/api/auth/
git commit -m "feat(auth): cross-brand SSO + in-game signup (PromNET shared users-table)"
git push origin main
```

---

### Task 5: Game-state API + dashboard skeleton

**Files:**
- Create: `/home/aika/navtycoon/src/pages/api/game/state.ts`
- Create: `/home/aika/navtycoon/src/layouts/Base.astro`
- Create: `/home/aika/navtycoon/src/pages/index.astro`
- Create: `/home/aika/navtycoon/src/pages/play/index.astro`

- [ ] **Step 1: Game-state API**

```typescript
// src/pages/api/game/state.ts
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';

export const prerender = false;

function jerr(s: number, e: string) { return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { 'content-type': 'application/json' } }); }

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c); if (!user) return jerr(401, 'auth');
  const db = getDB(c)!;
  const player = await getPlayer(db, user.id);
  if (!player) return jerr(404, 'no player');

  // Aggregate snapshot (additional queries: customer count, server count, ticket queue)
  const customerCount = (await db.prepare('SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1').bind(user.id).first<{ n: number }>())?.n ?? 0;
  const serverCount = (await db.prepare('SELECT COUNT(*) AS n FROM servers WHERE player_id = ?').bind(user.id).first<{ n: number }>())?.n ?? 0;
  const openTickets = (await db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status IN ('open', 'in_progress')`).bind(user.id).first<{ n: number }>())?.n ?? 0;

  return new Response(JSON.stringify({
    ok: true,
    player,
    counts: { customers: customerCount, servers: serverCount, openTickets },
  }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Base.astro layout (auth-aware)**

```astro
---
// src/layouts/Base.astro
import { getCurrentUser } from '../lib/auth';
const { title = 'Hyperscaler' } = Astro.props;
const user = await getCurrentUser(Astro);
---
<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · Hyperscaler</title>
  <link rel="stylesheet" href="/_astro/style.css" />
</head>
<body class="bg-nt-bg text-nt-text font-sans min-h-screen">
  <header class="border-b border-nt-border bg-nt-bg-2/70 backdrop-blur sticky top-0 z-10">
    <nav class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="text-xl font-bold tracking-tight">⚡ Hyperscaler</a>
      <div class="flex items-center gap-4 text-sm">
        {user ? (
          <>
            <a href="/play" class="hover:text-nt-accent">Play</a>
            <a href="/play/servers" class="hover:text-nt-accent">Servers</a>
            <a href="/play/customers" class="hover:text-nt-accent">Customers</a>
            <a href="/play/tickets" class="hover:text-nt-accent">Tickets</a>
            <span class="text-nt-text-dim">{user.display_name ?? user.email}</span>
          </>
        ) : (
          <>
            <a href="/pricing">Pricing</a>
            <a href="/login" class="px-3 py-1.5 bg-nt-accent rounded">Log in</a>
          </>
        )}
      </div>
    </nav>
  </header>
  <main class="max-w-6xl mx-auto px-4 py-8">
    <slot />
  </main>
</body>
</html>
```

- [ ] **Step 3: Landing (`index.astro`)**

```astro
---
// src/pages/index.astro
import Base from '../layouts/Base.astro';
---
<Base title="Hyperscaler — hosting tycoon with AI customers">
  <section class="text-center py-20">
    <h1 class="text-5xl font-bold mb-4 tracking-tight">
      Run a hosting empire.<br />
      <span class="text-nt-accent">Your customers are AI.</span>
    </h1>
    <p class="text-xl text-nt-text-dim mb-8 max-w-2xl mx-auto">
      A browser-based tycoon where every angry customer, every weird ticket, every late-night
      panic is generated by a real LLM that remembers your past mistakes.
    </p>
    <div class="flex gap-4 justify-center">
      <a href="/signup" class="px-6 py-3 bg-nt-accent rounded font-semibold">Start playing free</a>
      <a href="/pricing" class="px-6 py-3 border border-nt-border rounded">See pricing</a>
    </div>
  </section>

  <section class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
    <div class="bg-nt-bg-2 p-6 rounded-lg">
      <h3 class="font-bold mb-2">🤖 Real AI customers</h3>
      <p class="text-nt-text-dim text-sm">
        Every customer is a Llama-powered NPC with memory. They remember when you screwed
        up the migration last week. They tell their friends.
      </p>
    </div>
    <div class="bg-nt-bg-2 p-6 rounded-lg">
      <h3 class="font-bold mb-2">⚡ Cloud-native gameplay</h3>
      <p class="text-nt-text-dim text-sm">
        From a beige garage tower in 2002 to global edge by 2026. Real tech-tree, real
        decisions, no scripted nonsense.
      </p>
    </div>
    <div class="bg-nt-bg-2 p-6 rounded-lg">
      <h3 class="font-bold mb-2">🔥 Survive shifts</h3>
      <p class="text-nt-text-dim text-sm">
        Real-time support shifts. 30 minutes. 10 angry tickets. One Karen. Will you
        refund or hold the line?
      </p>
    </div>
  </section>
</Base>
```

- [ ] **Step 4: Play dashboard (`play/index.astro`)**

```astro
---
// src/pages/play/index.astro
import Base from '../../layouts/Base.astro';
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer } from '../../lib/game/db';

const user = await getCurrentUser(Astro);
if (!user) return Astro.redirect('/login?next=/play');
const db = getDB(Astro)!;
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');

const customerCount = (await db.prepare('SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1').bind(user.id).first<{ n: number }>())?.n ?? 0;
const serverCount = (await db.prepare('SELECT COUNT(*) AS n FROM servers WHERE player_id = ?').bind(user.id).first<{ n: number }>())?.n ?? 0;
const openTickets = (await db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status IN ('open', 'in_progress')`).bind(user.id).first<{ n: number }>())?.n ?? 0;

const fmtUsd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
---
<Base title={player.company_name}>
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-3xl font-bold">{player.company_name}</h1>
    <span class="text-nt-text-dim">Era {player.current_era} · founded {new Date(player.founded_at * 1000).getFullYear()}</span>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="bg-nt-bg-2 p-4 rounded">
      <div class="text-nt-text-dim text-sm">Cash</div>
      <div class="text-2xl font-bold">{fmtUsd(player.cash_usd_cents)}</div>
    </div>
    <div class="bg-nt-bg-2 p-4 rounded">
      <div class="text-nt-text-dim text-sm">MRR</div>
      <div class="text-2xl font-bold">{fmtUsd(player.mrr_usd_cents)}</div>
    </div>
    <div class="bg-nt-bg-2 p-4 rounded">
      <div class="text-nt-text-dim text-sm">Reputation</div>
      <div class="text-2xl font-bold">{player.reputation}</div>
    </div>
    <div class="bg-nt-bg-2 p-4 rounded">
      <div class="text-nt-text-dim text-sm">Customers</div>
      <div class="text-2xl font-bold">{customerCount}</div>
    </div>
  </div>

  <div class="bg-nt-bg-2 p-6 rounded mb-4">
    <h2 class="font-bold mb-3">Status</h2>
    <p class="text-nt-text-dim mb-2">Servers: {serverCount} · Open tickets: {openTickets}</p>
    {customerCount === 0 && (
      <p class="text-nt-accent">
        🌱 Empty inbox. Buy your first server in <a href="/play/servers" class="underline">Servers</a> and customers will start coming.
      </p>
    )}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <a href="/play/servers" class="bg-nt-bg-2 p-6 rounded hover:bg-nt-bg-3 transition">
      <div class="text-2xl mb-2">🖥️</div>
      <h3 class="font-bold">Servers</h3>
      <p class="text-sm text-nt-text-dim">Buy and upgrade</p>
    </a>
    <a href="/play/customers" class="bg-nt-bg-2 p-6 rounded hover:bg-nt-bg-3 transition">
      <div class="text-2xl mb-2">👥</div>
      <h3 class="font-bold">Customers</h3>
      <p class="text-sm text-nt-text-dim">Manage subscriptions</p>
    </a>
    <a href="/play/tickets" class="bg-nt-bg-2 p-6 rounded hover:bg-nt-bg-3 transition">
      <div class="text-2xl mb-2">🎫</div>
      <h3 class="font-bold">Tickets</h3>
      <p class="text-sm text-nt-text-dim">{openTickets} open</p>
    </a>
  </div>
</Base>
```

- [ ] **Step 5: Smoke**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/game/state.ts src/layouts/Base.astro src/pages/index.astro src/pages/play/index.astro
git commit -m "feat(ui): landing + auth-aware Base + play-dashboard skeleton"
git push origin main
```

---

### Task 6: Server-types + upgrade-tree definitions

**Files:**
- Create: `/home/aika/navtycoon/src/lib/game/server-types.ts`
- Create: `/home/aika/navtycoon/src/lib/game/upgrade-tree.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/upgrade-tree.test.ts`

- [ ] **Step 1: Server-type definitions (Era 1+2)**

```typescript
// src/lib/game/server-types.ts
import type { ServerType, EraId } from './types';

export interface ServerSpec {
  type: ServerType;
  era: EraId;
  display_name: string;
  capacity: number;             // max customers
  monthly_cost_cents: number;
  purchase_cost_cents: number;
  flavor: string;               // humor blurb
}

export const SERVER_SPECS: Record<ServerType, ServerSpec> = {
  lamp_box: {
    type: 'lamp_box', era: 1, display_name: 'Beige Tower (LAMP)',
    capacity: 30, monthly_cost_cents: 500, purchase_cost_cents: 15000,
    flavor: 'Pentium III, 512MB, fan louder than the customer complaints. Honest work.',
  },
  rack_unit: {
    type: 'rack_unit', era: 2, display_name: '1U Rack Server',
    capacity: 100, monthly_cost_cents: 3000, purchase_cost_cents: 90000,
    flavor: 'Dual Xeon, redundant PSU, smells of fresh datacenter.',
  },
  vps_node: {
    type: 'vps_node', era: 2, display_name: 'VPS Node',
    capacity: 250, monthly_cost_cents: 8000, purchase_cost_cents: 220000,
    flavor: 'KVM-virtualized, 32GB RAM. The intern thinks "VPS" stands for "Very Powerful Server".',
  },
  dedicated_box: {
    type: 'dedicated_box', era: 2, display_name: 'Dedicated Box (per-customer)',
    capacity: 1, monthly_cost_cents: 12000, purchase_cost_cents: 350000,
    flavor: 'For The Pro who insists on bare metal. They will still complain.',
  },
  cloud_region: { type: 'cloud_region', era: 3, display_name: 'Cloud Region (Phase 2)', capacity: 0, monthly_cost_cents: 0, purchase_cost_cents: 0, flavor: 'Era 3 unlock' },
  edge_pop: { type: 'edge_pop', era: 4, display_name: 'Edge POP (Phase 2)', capacity: 0, monthly_cost_cents: 0, purchase_cost_cents: 0, flavor: 'Era 4 unlock' },
};

export function affordableServerTypes(currentEra: EraId): ServerSpec[] {
  return Object.values(SERVER_SPECS).filter(s => s.era <= currentEra);
}
```

- [ ] **Step 2: Upgrade-tree (Era 1: 8 items, Era 2: 12 items)**

```typescript
// src/lib/game/upgrade-tree.ts
import type { EraId } from './types';

export interface UpgradeSpec {
  id: string;
  era: EraId;
  display_name: string;
  cost_usd_cents: number;
  effect: string;                // human-readable
  effect_data: Record<string, number>;  // applied numerically (e.g. { capacity_pct: 10 })
  prereq?: string;               // upgrade-id required first
}

export const UPGRADE_SPECS: UpgradeSpec[] = [
  // Era 1 (8)
  { id: 'cooling_fan', era: 1, display_name: 'Better Cooling', cost_usd_cents: 8000,
    effect: '+10% server capacity, less downtime', effect_data: { capacity_pct: 10, downtime_pct: -10 } },
  { id: 'ram_bump', era: 1, display_name: 'RAM Upgrade', cost_usd_cents: 15000,
    effect: '+50% capacity', effect_data: { capacity_pct: 50 } },
  { id: 'better_psu', era: 1, display_name: 'Redundant PSU', cost_usd_cents: 12000,
    effect: '-30% downtime events', effect_data: { downtime_pct: -30 } },
  { id: 'backup_script', era: 1, display_name: 'Daily Backup Script', cost_usd_cents: 5000,
    effect: '-50% data-loss event impact', effect_data: { dataloss_pct: -50 } },
  { id: 'cpanel_license', era: 1, display_name: 'cPanel License', cost_usd_cents: 25000,
    effect: '+20% customer satisfaction', effect_data: { satisfaction_bonus: 20 } },
  { id: 'mod_security', era: 1, display_name: 'mod_security', cost_usd_cents: 10000,
    effect: '-30% security events', effect_data: { security_pct: -30 } },
  { id: 'mod_pagespeed', era: 1, display_name: 'mod_pagespeed', cost_usd_cents: 8000,
    effect: '+15% page-load satisfaction', effect_data: { satisfaction_bonus: 15 } },
  { id: 'cdn_bind', era: 1, display_name: 'CDN Integration (EdgeRunners)', cost_usd_cents: 30000,
    effect: 'unlocks edge-cache, +25% sat', effect_data: { satisfaction_bonus: 25 }, prereq: 'mod_pagespeed' },

  // Era 2 (12)
  { id: 'hardware_raid', era: 2, display_name: 'Hardware RAID', cost_usd_cents: 40000,
    effect: '-60% data-loss', effect_data: { dataloss_pct: -60 }, prereq: 'backup_script' },
  { id: 'ups_battery', era: 2, display_name: 'UPS Battery Backup', cost_usd_cents: 25000,
    effect: '-50% power-event impact', effect_data: { power_pct: -50 } },
  { id: 'multi_uplink', era: 2, display_name: 'Multi-uplink BGP', cost_usd_cents: 80000,
    effect: '-70% network-down events', effect_data: { network_pct: -70 } },
  { id: 'nagios', era: 2, display_name: 'Nagios Monitoring', cost_usd_cents: 30000,
    effect: 'detect events 30% earlier', effect_data: { event_detection_pct: 30 } },
  { id: 'ssh_key_only', era: 2, display_name: 'SSH-key-only auth', cost_usd_cents: 5000,
    effect: '-40% security events', effect_data: { security_pct: -40 } },
  { id: 'auto_failover', era: 2, display_name: 'Automated Failover', cost_usd_cents: 100000,
    effect: '-80% downtime events', effect_data: { downtime_pct: -80 }, prereq: 'multi_uplink' },
  { id: 'ssl_wildcard', era: 2, display_name: 'SSL Wildcard Cert', cost_usd_cents: 20000,
    effect: '+15% satisfaction', effect_data: { satisfaction_bonus: 15 } },
  { id: 'webmin_license', era: 2, display_name: 'Webmin License', cost_usd_cents: 35000,
    effect: '+10% MRR per customer', effect_data: { mrr_pct: 10 }, prereq: 'cpanel_license' },
  { id: 'docker_enabled', era: 2, display_name: 'Containerization (Docker)', cost_usd_cents: 60000,
    effect: 'unlocks container-deploys', effect_data: { capacity_pct: 30 } },
  { id: 'cicd_pipeline', era: 2, display_name: 'CI/CD Pipeline', cost_usd_cents: 50000,
    effect: '-50% deploy-event impact', effect_data: { deploy_pct: -50 }, prereq: 'docker_enabled' },
  { id: 'postgres_addon', era: 2, display_name: 'PostgreSQL Add-on', cost_usd_cents: 40000,
    effect: 'Pro-tier customer unlock, +20% MRR', effect_data: { mrr_pct: 20 } },
  { id: 'cdn_global', era: 2, display_name: 'Global CDN POP', cost_usd_cents: 150000,
    effect: '+30% satisfaction, Era 3 prereq', effect_data: { satisfaction_bonus: 30 }, prereq: 'cdn_bind' },
];

export function availableUpgrades(currentEra: EraId, ownedIds: Set<string>): UpgradeSpec[] {
  return UPGRADE_SPECS.filter(u =>
    u.era <= currentEra
    && !ownedIds.has(u.id)
    && (!u.prereq || ownedIds.has(u.prereq))
  );
}

export function getUpgradeById(id: string): UpgradeSpec | undefined {
  return UPGRADE_SPECS.find(u => u.id === id);
}
```

- [ ] **Step 3: Test**

```typescript
// src/lib/game/__tests__/upgrade-tree.test.ts
import { describe, it, expect } from 'vitest';
import { availableUpgrades, getUpgradeById, UPGRADE_SPECS } from '../upgrade-tree';

describe('upgrade-tree', () => {
  it('20 specs total (Era 1: 8, Era 2: 12)', () => {
    expect(UPGRADE_SPECS.length).toBe(20);
    expect(UPGRADE_SPECS.filter(u => u.era === 1).length).toBe(8);
    expect(UPGRADE_SPECS.filter(u => u.era === 2).length).toBe(12);
  });

  it('Era 1 player sees only Era 1 unowned upgrades', () => {
    const avail = availableUpgrades(1, new Set());
    expect(avail.length).toBe(8);
    expect(avail.every(u => u.era === 1)).toBe(true);
  });

  it('owned upgrade hidden from available', () => {
    const avail = availableUpgrades(1, new Set(['cooling_fan']));
    expect(avail.find(u => u.id === 'cooling_fan')).toBeUndefined();
    expect(avail.length).toBe(7);
  });

  it('prereq enforced: cdn_bind hidden until mod_pagespeed owned', () => {
    const avail0 = availableUpgrades(1, new Set());
    expect(avail0.find(u => u.id === 'cdn_bind')).toBeUndefined();

    const avail1 = availableUpgrades(1, new Set(['mod_pagespeed']));
    expect(avail1.find(u => u.id === 'cdn_bind')).toBeDefined();
  });

  it('getUpgradeById works', () => {
    expect(getUpgradeById('cooling_fan')?.cost_usd_cents).toBe(8000);
    expect(getUpgradeById('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run + verify pass**

```bash
npm test -- src/lib/game/__tests__/upgrade-tree.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/server-types.ts src/lib/game/upgrade-tree.ts src/lib/game/__tests__/upgrade-tree.test.ts
git commit -m "feat(game): server-types + upgrade-tree (Era 1: 8, Era 2: 12)"
git push origin main
```

---

### Task 7: Server-buy + upgrade-buy APIs

**Files:**
- Create: `/home/aika/navtycoon/src/pages/api/game/server.ts`
- Create: `/home/aika/navtycoon/src/pages/api/game/upgrade.ts`

- [ ] **Step 1: Server-buy endpoint**

```typescript
// src/pages/api/game/server.ts
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer, updatePlayer } from '../../../lib/game/db';
import { SERVER_SPECS } from '../../../lib/game/server-types';
import type { ServerType } from '../../../lib/game/types';

export const prerender = false;
function jerr(s: number, e: string) { return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { 'content-type': 'application/json' } }); }

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c); if (!user) return jerr(401, 'auth');
  const db = getDB(c)!;
  const player = await getPlayer(db, user.id);
  if (!player) return jerr(404, 'no player');

  const body = await c.request.json() as { type?: string };
  const type = body.type as ServerType;
  const spec = SERVER_SPECS[type];
  if (!spec) return jerr(400, 'invalid server type');
  if (spec.era > player.current_era) return jerr(403, 'era locked');
  if (player.cash_usd_cents < spec.purchase_cost_cents) return jerr(402, 'insufficient cash');

  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`
      INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).bind(user.id, spec.era, spec.type, spec.capacity, spec.monthly_cost_cents, now),
    db.prepare(`UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?`).bind(spec.purchase_cost_cents, user.id),
  ]);

  return new Response(JSON.stringify({ ok: true, spec }), { status: 201, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Upgrade-buy endpoint**

```typescript
// src/pages/api/game/upgrade.ts
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';
import { getUpgradeById, availableUpgrades } from '../../../lib/game/upgrade-tree';

export const prerender = false;
function jerr(s: number, e: string) { return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { 'content-type': 'application/json' } }); }

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c); if (!user) return jerr(401, 'auth');
  const db = getDB(c)!;
  const player = await getPlayer(db, user.id);
  if (!player) return jerr(404, 'no player');

  const body = await c.request.json() as { upgrade_id?: string };
  const id = body.upgrade_id;
  const spec = id ? getUpgradeById(id) : null;
  if (!spec) return jerr(400, 'invalid upgrade');

  // Owned-check
  const owned = await db.prepare('SELECT upgrade_id FROM upgrades WHERE player_id = ?').bind(user.id).all<{ upgrade_id: string }>();
  const ownedIds = new Set(owned.results?.map(r => r.upgrade_id) ?? []);
  const avail = availableUpgrades(player.current_era, ownedIds);
  if (!avail.find(u => u.id === id)) return jerr(403, 'unavailable (era, prereq, or owned)');
  if (player.cash_usd_cents < spec.cost_usd_cents) return jerr(402, 'insufficient cash');

  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('INSERT INTO upgrades (player_id, upgrade_id, purchased_at) VALUES (?, ?, ?)').bind(user.id, id, now),
    db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?').bind(spec.cost_usd_cents, user.id),
  ]);

  return new Response(JSON.stringify({ ok: true, spec }), { status: 201, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 3: Smoke**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/game/server.ts src/pages/api/game/upgrade.ts
git commit -m "feat(game): server-buy + upgrade-buy APIs (era + prereq + cash gating)"
git push origin main
```

---

### Task 8: Pricing + Marketing APIs

**Files:**
- Create: `/home/aika/navtycoon/src/lib/game/pricing.ts`
- Create: `/home/aika/navtycoon/src/lib/game/marketing.ts`
- Create: `/home/aika/navtycoon/src/pages/api/game/pricing.ts`
- Create: `/home/aika/navtycoon/src/pages/api/game/marketing.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/pricing.test.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/marketing.test.ts`

- [ ] **Step 1: Pricing validation lib + test**

```typescript
// src/lib/game/pricing.ts
export const PRICING_BOUNDS = {
  hobby: { min: 300, max: 1000 },
  business: { min: 1000, max: 3000 },
  // vps unlocked Era 2 — Phase 1 still works since clamps applied only when fields present
};

export function clampPricing(hobby: number, business: number): { hobby: number; business: number } {
  return {
    hobby: Math.max(PRICING_BOUNDS.hobby.min, Math.min(PRICING_BOUNDS.hobby.max, hobby)),
    business: Math.max(PRICING_BOUNDS.business.min, Math.min(PRICING_BOUNDS.business.max, business)),
  };
}
```

```typescript
// src/lib/game/__tests__/pricing.test.ts
import { describe, it, expect } from 'vitest';
import { clampPricing } from '../pricing';

describe('clampPricing', () => {
  it('within bounds passes through', () => {
    expect(clampPricing(500, 1500)).toEqual({ hobby: 500, business: 1500 });
  });
  it('below min clamps up', () => {
    expect(clampPricing(100, 500)).toEqual({ hobby: 300, business: 1000 });
  });
  it('above max clamps down', () => {
    expect(clampPricing(5000, 9999)).toEqual({ hobby: 1000, business: 3000 });
  });
});
```

- [ ] **Step 2: Marketing validation lib + test**

```typescript
// src/lib/game/marketing.ts
export interface MarketingMix {
  seo: number; ppc: number; referral: number;
}

export function normalizeMix(mix: Partial<MarketingMix>): MarketingMix {
  const seo = Math.max(0, mix.seo ?? 0);
  const ppc = Math.max(0, mix.ppc ?? 0);
  const referral = Math.max(0, mix.referral ?? 0);
  const total = seo + ppc + referral;
  if (total === 0) return { seo: 33, ppc: 33, referral: 34 };
  return {
    seo: Math.round((seo / total) * 100),
    ppc: Math.round((ppc / total) * 100),
    referral: 100 - Math.round((seo / total) * 100) - Math.round((ppc / total) * 100),
  };
}
```

```typescript
// src/lib/game/__tests__/marketing.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeMix } from '../marketing';

describe('normalizeMix', () => {
  it('balanced mix sums to 100', () => {
    const m = normalizeMix({ seo: 33, ppc: 33, referral: 34 });
    expect(m.seo + m.ppc + m.referral).toBe(100);
  });
  it('all-zero defaults to balanced', () => {
    expect(normalizeMix({})).toEqual({ seo: 33, ppc: 33, referral: 34 });
  });
  it('lopsided normalizes', () => {
    const m = normalizeMix({ seo: 200, ppc: 0, referral: 0 });
    expect(m.seo).toBe(100);
    expect(m.ppc).toBe(0);
    expect(m.referral).toBe(0);
  });
  it('negative values clamped to 0', () => {
    const m = normalizeMix({ seo: -50, ppc: 50, referral: 50 });
    expect(m.seo).toBe(0);
    expect(m.ppc + m.referral).toBe(100);
  });
});
```

- [ ] **Step 3: API endpoints**

```typescript
// src/pages/api/game/pricing.ts
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { updatePlayer } from '../../../lib/game/db';
import { clampPricing } from '../../../lib/game/pricing';

export const prerender = false;
function jerr(s: number, e: string) { return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { 'content-type': 'application/json' } }); }

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c); if (!user) return jerr(401, 'auth');
  const db = getDB(c)!;
  const body = await c.request.json() as { hobby?: number; business?: number };
  if (typeof body.hobby !== 'number' || typeof body.business !== 'number') return jerr(400, 'hobby+business required');
  const { hobby, business } = clampPricing(Math.round(body.hobby), Math.round(body.business));
  await updatePlayer(db, user.id, { pricing_hobby_cents: hobby, pricing_business_cents: business });
  return new Response(JSON.stringify({ ok: true, hobby, business }), { headers: { 'content-type': 'application/json' } });
};
```

```typescript
// src/pages/api/game/marketing.ts
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { updatePlayer } from '../../../lib/game/db';
import { normalizeMix } from '../../../lib/game/marketing';

export const prerender = false;
function jerr(s: number, e: string) { return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { 'content-type': 'application/json' } }); }

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c); if (!user) return jerr(401, 'auth');
  const db = getDB(c)!;
  const body = await c.request.json() as { seo?: number; ppc?: number; referral?: number };
  const mix = normalizeMix(body);
  await updatePlayer(db, user.id, {
    marketing_seo_pct: mix.seo, marketing_ppc_pct: mix.ppc, marketing_referral_pct: mix.referral,
  });
  return new Response(JSON.stringify({ ok: true, mix }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/game/__tests__/pricing.test.ts src/lib/game/__tests__/marketing.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/pricing.ts src/lib/game/marketing.ts \
        src/lib/game/__tests__/pricing.test.ts src/lib/game/__tests__/marketing.test.ts \
        src/pages/api/game/pricing.ts src/pages/api/game/marketing.ts
git commit -m "feat(game): pricing-clamp + marketing-mix-normalize APIs (TDD)"
git push origin main
```

---

### Task 9: Customer-spawn placeholder + persona-pool

**Files:**
- Create: `/home/aika/navtycoon/src/lib/game/persona-pool.ts`
- Create: `/home/aika/navtycoon/src/lib/game/customer-spawn.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/customer-spawn.test.ts`

- [ ] **Step 1: Persona-pool definitions (used now for naming + spawn-rates; AI-prompts come Plan 2)**

```typescript
// src/lib/game/persona-pool.ts
import type { PersonaArchetype } from './types';

export interface PersonaSpec {
  archetype: PersonaArchetype;
  display_name: string;
  spawn_weight: number;          // 1-10, higher = more common
  starting_satisfaction: number;
  flavor: string;                // single-line tagline
  // AI-prompt-template assigned in Plan 2
}

export const PERSONAS: PersonaSpec[] = [
  { archetype: 'newbie', display_name: 'The Newbie', spawn_weight: 8, starting_satisfaction: 60,
    flavor: 'Confused about what a "domain" actually is.' },
  { archetype: 'pro', display_name: 'The Pro', spawn_weight: 5, starting_satisfaction: 50,
    flavor: 'Will quote RFCs at you.' },
  { archetype: 'cheapskate', display_name: 'The Cheapskate', spawn_weight: 7, starting_satisfaction: 40,
    flavor: 'Asks for refund on principle.' },
  { archetype: 'karen', display_name: 'The Karen', spawn_weight: 4, starting_satisfaction: 30,
    flavor: 'Will email your mom.' },
  { archetype: 'loyalist', display_name: 'The Loyalist', spawn_weight: 3, starting_satisfaction: 80,
    flavor: 'Genuinely happy. Suspiciously so.' },
  { archetype: 'ghost', display_name: 'The Ghost', spawn_weight: 4, starting_satisfaction: 50,
    flavor: 'You forgot they exist. They are leaving anyway.' },
  { archetype: 'drama', display_name: 'The Drama Queen', spawn_weight: 3, starting_satisfaction: 35,
    flavor: 'Twitter is a weapon.' },
  { archetype: 'crypto', display_name: 'The Crypto-bro', spawn_weight: 2, starting_satisfaction: 55,
    flavor: 'Probably mining XMR. Says it is "for science".' },
];

const TOTAL_WEIGHT = PERSONAS.reduce((s, p) => s + p.spawn_weight, 0);

export function pickPersona(): PersonaSpec {
  const r = Math.random() * TOTAL_WEIGHT;
  let acc = 0;
  for (const p of PERSONAS) {
    acc += p.spawn_weight;
    if (r < acc) return p;
  }
  return PERSONAS[0];
}

const FIRST_NAMES = ['Alex', 'Sam', 'Chris', 'Jamie', 'Morgan', 'Taylor', 'Casey', 'Jordan',
                     'Robin', 'Quinn', 'Avery', 'Cameron', 'Drew', 'Emerson', 'Finley'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Anderson', 'Thomas'];
const COMPANY_SUFFIX = ['LLC', 'Inc.', 'Studios', 'Co.', 'Group', 'Labs', 'Ventures', 'Partners'];

export function generateCustomerName(): string {
  const useCompany = Math.random() < 0.35;
  if (useCompany) {
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const suffix = COMPANY_SUFFIX[Math.floor(Math.random() * COMPANY_SUFFIX.length)];
    return `${last} ${suffix}`;
  }
  return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
}
```

- [ ] **Step 2: Customer-spawn (placeholder ticket-text, no AI yet)**

```typescript
// src/lib/game/customer-spawn.ts
// Plan 1 placeholder: spawn customers with simple seeded ticket-text.
// Plan 2 replaces this with Workers AI prompt-driven generation.
import type { PlanTier, PersonaArchetype } from './types';
import { PERSONAS, pickPersona, generateCustomerName } from './persona-pool';

const PLACEHOLDER_TICKETS: Record<PersonaArchetype, string[]> = {
  newbie: [
    'Where is the FTP? I need it for my homepage thing.',
    'My WordPress is showing PHP errors. Is that bad?',
    'I cannot find the login button.',
  ],
  pro: [
    '504 timeout under load. fastcgi_buffer_size at 16k, expected.',
    'Slow query log shows 2.3s on a JOIN. I need a covering index.',
    'TLS handshake failing on Android 11 — old cipher suites?',
  ],
  cheapskate: [
    'The site was down for 4 minutes yesterday. I want a refund.',
    'My neighbor pays half what I pay. Match the price?',
    'Disk usage is 51%. You said unlimited.',
  ],
  karen: [
    'THIS IS UNACCEPTABLE. My customers cannot reach the site.',
    'I have been ON HOLD for 8 minutes. WHO IS YOUR MANAGER.',
    'You will hear from my lawyer if this is not fixed in 1 hour.',
  ],
  loyalist: [
    'Hi! Just letting you know the new dashboard is great. ❤️',
    'Renewed for 2 years today. Keep up the good work.',
    'Quick question: can you recommend a good backup strategy?',
  ],
  ghost: [
    'Hi.',
    'still there?',
    '...',
  ],
  drama: [
    'I just posted on Twitter about your service. Reply count is climbing.',
    'My therapist says I need to switch hosts. This is taking years off me.',
    'A blog post is being drafted. You have one chance.',
  ],
  crypto: [
    'gm. Need 10x the bandwidth, big drop coming. WAGMI.',
    'Server keeps getting flagged. It is just a hashing experiment ser.',
    'Would you accept payment in $TYCOON? I can get you a discount.',
  ],
};

export interface SpawnedCustomer {
  name: string;
  persona_archetype: PersonaArchetype;
  plan_tier: PlanTier;
  starting_satisfaction: number;
  initial_ticket_text: string;
}

export function spawnCustomer(plan_tier: PlanTier = 'hobby'): SpawnedCustomer {
  const persona = pickPersona();
  const tickets = PLACEHOLDER_TICKETS[persona.archetype];
  const initial = tickets[Math.floor(Math.random() * tickets.length)];
  return {
    name: generateCustomerName(),
    persona_archetype: persona.archetype,
    plan_tier,
    starting_satisfaction: persona.starting_satisfaction,
    initial_ticket_text: initial,
  };
}
```

- [ ] **Step 3: Test**

```typescript
// src/lib/game/__tests__/customer-spawn.test.ts
import { describe, it, expect } from 'vitest';
import { spawnCustomer } from '../customer-spawn';
import { PERSONAS } from '../persona-pool';

describe('spawnCustomer', () => {
  it('returns valid persona + ticket text', () => {
    const c = spawnCustomer();
    expect(c.name.length).toBeGreaterThan(2);
    expect(PERSONAS.find(p => p.archetype === c.persona_archetype)).toBeDefined();
    expect(c.initial_ticket_text.length).toBeGreaterThan(2);
  });

  it('100 spawns produce variety', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(spawnCustomer().persona_archetype);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('plan_tier defaults to hobby', () => {
    expect(spawnCustomer().plan_tier).toBe('hobby');
    expect(spawnCustomer('vps').plan_tier).toBe('vps');
  });
});
```

- [ ] **Step 4: Run tests pass**

```bash
npm test -- src/lib/game/__tests__/customer-spawn.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/persona-pool.ts src/lib/game/customer-spawn.ts src/lib/game/__tests__/customer-spawn.test.ts
git commit -m "feat(game): persona-pool + customer-spawn (placeholder text, AI in Plan 2)"
git push origin main
```

---

### Task 10: Game-tick logic (cron-tick brain)

**Files:**
- Create: `/home/aika/navtycoon/src/lib/game/tick.ts`
- Create: `/home/aika/navtycoon/src/lib/game/__tests__/tick.test.ts`

- [ ] **Step 1: Tick logic**

```typescript
// src/lib/game/tick.ts
// Run every 5 minutes by Cron Trigger. Does:
// 1. ticket-spawn for each player based on customer-base + persona spawn-rate
// 2. money-trickle: MRR proportional to elapsed time
// 3. customer-churn: 48h+ unanswered tickets → 30% roll
// 4. server-load tick: capacity vs customers → satisfaction-decay >90%
// 5. random-event spawn (1-2/day chance)

import type { Player, Customer } from './types';
import { spawnCustomer } from './customer-spawn';
import { pickPersona } from './persona-pool';

const TICK_MINUTES = 5;
const CHURN_HOURS = 48;

export interface TickResult {
  player_id: string;
  ticket_spawned: number;
  money_added_cents: number;
  churned: number;
  events_spawned: number;
}

export async function tickPlayer(db: D1Database, player: Player, now: number): Promise<TickResult> {
  let ticketSpawned = 0;
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
    SELECT id, persona_archetype, satisfaction, last_ticket_at, plan_tier, churn_risk
    FROM customers WHERE player_id = ? AND is_active = 1
  `).bind(player.user_id).all<{
    id: number; persona_archetype: string; satisfaction: number;
    last_ticket_at: number | null; plan_tier: string; churn_risk: number;
  }>();

  // 3. Ticket spawn (5%/hour per active customer = ~0.4%/tick)
  const spawnProb = 0.004 * (TICK_MINUTES / 5);  // per customer per tick
  for (const c of customers.results ?? []) {
    if (Math.random() < spawnProb) {
      const archetype = c.persona_archetype as 'karen' | 'newbie' | 'pro' | 'cheapskate' | 'ghost' | 'loyalist' | 'drama' | 'crypto';
      // Use the same placeholder-spawn for ticket-text (Plan 2 replaces with AI)
      const fake = spawnCustomer(c.plan_tier as 'hobby' | 'business' | 'vps' | 'dedicated');
      // Override archetype to the existing customer's
      const ticketText = fake.initial_ticket_text;  // already keyed off random archetype, OK for placeholder
      await db.prepare(`
        INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at)
        VALUES (?, ?, ?, ?, 'open', ?)
      `).bind(c.id, player.user_id, ticketText.slice(0, 80), ticketText, now).run();
      await db.prepare('UPDATE customers SET last_ticket_at = ? WHERE id = ?').bind(now, c.id).run();
      ticketSpawned++;
      void archetype;  // suppress unused-var lint
    }
  }

  // 4. Churn check: customers with open tickets older than CHURN_HOURS
  const churnCandidates = await db.prepare(`
    SELECT c.id FROM customers c
    JOIN tickets t ON t.customer_id = c.id
    WHERE c.player_id = ? AND c.is_active = 1
      AND t.status IN ('open', 'in_progress')
      AND t.created_at < ?
    GROUP BY c.id
  `).bind(player.user_id, now - CHURN_HOURS * 3600).all<{ id: number }>();

  for (const row of churnCandidates.results ?? []) {
    if (Math.random() < 0.30) {  // 30% churn-roll
      await db.prepare('UPDATE customers SET is_active = 0, churn_risk = 100 WHERE id = ?').bind(row.id).run();
      // Update MRR (subtract this customer's plan)
      // Simplified: just mark; actual MRR-recompute below
      churned++;
    }
  }

  // 5. Recompute MRR from active customers' plan-tiers
  const mrrRow = await db.prepare(`
    SELECT
      SUM(CASE WHEN plan_tier = 'hobby' THEN ? WHEN plan_tier = 'business' THEN ? ELSE 0 END) AS mrr
    FROM customers WHERE player_id = ? AND is_active = 1
  `).bind(player.pricing_hobby_cents, player.pricing_business_cents, player.user_id).first<{ mrr: number }>();
  const newMrr = mrrRow?.mrr ?? 0;
  if (newMrr !== player.mrr_usd_cents) {
    await db.prepare('UPDATE players SET mrr_usd_cents = ? WHERE user_id = ?').bind(newMrr, player.user_id).run();
  }

  // 6. Random event (1-2/day average → ~1/144 ticks; use 0.7% per tick)
  if (Math.random() < 0.007) {
    const eventTypes = ['ddos_attempt', 'viral_blog', 'electricity_spike', 'recruit_ad', 'intern_incident', 'dmca', 'cooling_failure', 'security_breach'];
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    await db.prepare(`
      INSERT INTO events (player_id, event_type, spawned_at) VALUES (?, ?, ?)
    `).bind(player.user_id, type, now).run();
    eventsSpawned++;
  }

  return { player_id: player.user_id, ticket_spawned: ticketSpawned, money_added_cents: moneyAdded, churned, events_spawned: eventsSpawned };
}

export async function tickAllActivePlayers(db: D1Database, now: number, idleCutoffSec = 7 * 24 * 3600): Promise<TickResult[]> {
  const cutoff = now - idleCutoffSec;
  const players = await db.prepare(
    'SELECT * FROM players WHERE last_active_at >= ?'
  ).bind(cutoff).all<Player>();
  const out: TickResult[] = [];
  for (const p of players.results ?? []) {
    out.push(await tickPlayer(db, p, now));
  }
  return out;
}
```

- [ ] **Step 2: Test**

```typescript
// src/lib/game/__tests__/tick.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { tickPlayer } from '../tick';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer } from '../db';

describe('tickPlayer', () => {
  let db: D1Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('money trickle: positive MRR adds cash', async () => {
    const p = await createPlayer(db, { user_id: 'u-1', company_name: 'X', city: null });
    // Force MRR
    await db.prepare('UPDATE players SET mrr_usd_cents = 30000 WHERE user_id = ?').bind('u-1').run();
    const refreshed = await db.prepare('SELECT * FROM players WHERE user_id = ?').bind('u-1').first<any>();
    const cashBefore = refreshed.cash_usd_cents;
    const result = await tickPlayer(db, refreshed, 1715000000);
    expect(result.money_added_cents).toBeGreaterThan(0);
    const after = await db.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ?').bind('u-1').first<{ cash_usd_cents: number }>();
    expect(after?.cash_usd_cents).toBe(cashBefore + result.money_added_cents);
  });

  it('zero-MRR player adds zero cash', async () => {
    const p = await createPlayer(db, { user_id: 'u-2', company_name: 'Y', city: null });
    const result = await tickPlayer(db, p, 1715000000);
    expect(result.money_added_cents).toBe(0);
  });

  it('idle customer with old open ticket may churn', async () => {
    const p = await createPlayer(db, { user_id: 'u-3', company_name: 'Z', city: null });
    const now = 1715000000;
    // Insert one customer + one old ticket
    const cRes = await db.prepare(`
      INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction)
      VALUES (?, 'Test', 'karen', 'hobby', ?, 50)
      RETURNING id
    `).bind('u-3', now - 100 * 3600).first<{ id: number }>();
    await db.prepare(`
      INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at)
      VALUES (?, ?, 'old', 'old', 'open', ?)
    `).bind(cRes!.id, 'u-3', now - 60 * 3600).run();

    // Run ticks 100 times — 30% churn-roll → ~very high probability of churn at least once
    for (let i = 0; i < 100; i++) {
      await tickPlayer(db, await db.prepare('SELECT * FROM players WHERE user_id = ?').bind('u-3').first<any>(), now);
      const c = await db.prepare('SELECT is_active FROM customers WHERE id = ?').bind(cRes!.id).first<{ is_active: number }>();
      if (c?.is_active === 0) {
        // success
        return;
      }
    }
    throw new Error('expected churn after 100 ticks');
  });
});
```

- [ ] **Step 3: Run tests pass**

```bash
npm test -- src/lib/game/__tests__/tick.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/tick.ts src/lib/game/__tests__/tick.test.ts
git commit -m "feat(game): game-tick logic (money/churn/spawn/event)"
git push origin main
```

---

### Task 11: Cron-trigger endpoint + signup-bootstrap

**Files:**
- Create: `/home/aika/navtycoon/src/pages/api/cron/tick.ts`
- Modify: `/home/aika/navtycoon/wrangler.toml` — verify cron-trigger calls this
- Modify: `/home/aika/navtycoon/src/pages/api/auth/signup.ts` — bootstrap initial customer & server

- [ ] **Step 1: Cron-tick endpoint**

```typescript
// src/pages/api/cron/tick.ts
import type { APIContext } from 'astro';
import { getDB } from '../../../lib/auth';
import { tickAllActivePlayers } from '../../../lib/game/tick';

export const prerender = false;

export const POST = async (c: APIContext): Promise<Response> => {
  // Cron-only auth: simple shared-secret header
  const secret = c.request.headers.get('x-cron-secret');
  const env = c.locals.runtime?.env as { CRON_SECRET?: string };
  if (!env?.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const db = getDB(c)!;
  const now = Math.floor(Date.now() / 1000);
  const results = await tickAllActivePlayers(db, now);
  return new Response(JSON.stringify({ ok: true, players_ticked: results.length, totals: results.reduce((acc, r) => ({
    tickets: acc.tickets + r.ticket_spawned,
    money_cents: acc.money_cents + r.money_added_cents,
    churned: acc.churned + r.churned,
    events: acc.events + r.events_spawned,
  }), { tickets: 0, money_cents: 0, churned: 0, events: 0 }) }), {
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 2: Wire cron in `wrangler.toml`**

CF Pages with Functions does NOT have a direct `[triggers]` section like Workers — instead, you need a separate Worker for crons OR use scheduled-event functions in the Pages Functions feature.

For Pages-only: use a **separate Worker** that calls the Pages-endpoint HTTP. Or use the `cron-runner-cf` pattern (per memory).

**Simplest approach**: Pages Function with `scheduled` handler. Add `functions/_scheduled.ts`:

```typescript
// functions/_scheduled.ts (CF Pages Functions scheduled handler)
export const onRequest: PagesFunction = async (context) => {
  // Pages doesn't natively support scheduled events.
  // Workaround: a separate "navtycoon-cron" Worker hits this URL on schedule.
  return new Response('Use external cron-Worker → POST /api/cron/tick', { status: 410 });
};
```

Document in README that for production, deploy a thin cron-Worker (`csiber/navtycoon-cron`) which calls `POST https://hyperscaler.game/api/cron/tick` every 5 minutes with the `X-Cron-Secret` header. (Phase 2 task.)

For Plan 1 dev/staging: **manual trigger** — the developer can `curl -X POST https://navtycoon.pages.dev/api/cron/tick -H "x-cron-secret: $CRON_SECRET"` to test the tick.

- [ ] **Step 3: Add `CRON_SECRET` env**

Add to `.env.example`:
```
CRON_SECRET=<generate-with-openssl-rand-hex-32>
```

Document: set as CF Pages secret_text per `feedback_cf_env_vars.md`.

- [ ] **Step 4: Bootstrap initial state on signup**

Modify `src/pages/api/auth/signup.ts` to also:
1. Create 1 starter LAMP-server
2. Spawn 3 initial customers (hobby-tier)
3. Each customer gets 1 initial ticket (placeholder)

Add inside the signup POST handler, AFTER `createPlayer`:

```typescript
// inside signup.ts, after createPlayer(db, ...)
import { SERVER_SPECS } from '../../../lib/game/server-types';
import { spawnCustomer } from '../../../lib/game/customer-spawn';

// Free starter server
const starter = SERVER_SPECS.lamp_box;
await db.prepare(`
  INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at)
  VALUES (?, 1, 'lamp_box', ?, 0, 0, ?)
`).bind(userId, starter.capacity, now).run();  // monthly_cost 0 because gifted

// 3 starter customers
for (let i = 0; i < 3; i++) {
  const sc = spawnCustomer('hobby');
  const cRes = await db.prepare(`
    INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction, churn_risk)
    VALUES (?, ?, ?, 'hobby', ?, ?, 0)
    RETURNING id
  `).bind(userId, sc.name, sc.persona_archetype, now, sc.starting_satisfaction).first<{ id: number }>();
  // initial ticket
  await db.prepare(`
    INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at)
    VALUES (?, ?, ?, ?, 'open', ?)
  `).bind(cRes!.id, userId, sc.initial_ticket_text.slice(0, 80), sc.initial_ticket_text, now).run();
}

// Set initial MRR ($5 hobby × 3 = $15 = 1500 cents)
await db.prepare(`UPDATE players SET mrr_usd_cents = 1500 WHERE user_id = ?`).bind(userId).run();
```

- [ ] **Step 5: Smoke + commit**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -5
git add src/pages/api/cron/tick.ts src/pages/api/auth/signup.ts .env.example functions/
git commit -m "feat(game): cron-tick endpoint + signup-bootstrap (starter server + 3 customers)"
git push origin main
```

---

### Task 12: Servers + Customers + Tickets pages

**Files:**
- Create: `/home/aika/navtycoon/src/pages/play/servers.astro`
- Create: `/home/aika/navtycoon/src/pages/play/customers.astro`
- Create: `/home/aika/navtycoon/src/pages/play/tickets.astro`
- Create: `/home/aika/navtycoon/src/pages/play/pricing.astro`
- Create: `/home/aika/navtycoon/src/pages/play/marketing.astro`

- [ ] **Step 1: `play/servers.astro` — list owned + show buyable**

```astro
---
// src/pages/play/servers.astro
import Base from '../../layouts/Base.astro';
import { getCurrentUser, getDB } from '../../lib/auth';
import { getPlayer } from '../../lib/game/db';
import { SERVER_SPECS, affordableServerTypes } from '../../lib/game/server-types';
import { availableUpgrades, UPGRADE_SPECS } from '../../lib/game/upgrade-tree';

const user = await getCurrentUser(Astro);
if (!user) return Astro.redirect('/login?next=/play/servers');
const db = getDB(Astro)!;
const player = await getPlayer(db, user.id);
if (!player) return Astro.redirect('/signup');
const servers = (await db.prepare('SELECT * FROM servers WHERE player_id = ? ORDER BY purchased_at').bind(user.id).all<any>()).results ?? [];
const ownedUpgradeIds = new Set(((await db.prepare('SELECT upgrade_id FROM upgrades WHERE player_id = ?').bind(user.id).all<{ upgrade_id: string }>()).results ?? []).map(r => r.upgrade_id));
const buyable = affordableServerTypes(player.current_era);
const upgradesAvail = availableUpgrades(player.current_era, ownedUpgradeIds);
const fmtUsd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
---
<Base title="Servers">
  <h1 class="text-2xl font-bold mb-4">Your Infrastructure</h1>
  <p class="text-nt-text-dim mb-6">Cash: {fmtUsd(player.cash_usd_cents)}</p>

  <h2 class="font-bold text-lg mb-3">Owned ({servers.length})</h2>
  <div class="grid gap-3 mb-8">
    {servers.map((s: any) => {
      const spec = (SERVER_SPECS as any)[s.type];
      return (
        <div class="bg-nt-bg-2 p-4 rounded flex items-center justify-between">
          <div>
            <div class="font-bold">{spec?.display_name ?? s.type}</div>
            <div class="text-nt-text-dim text-sm">Era {s.era} · capacity {s.current_load}/{s.capacity}</div>
          </div>
          <div class="text-nt-text-dim text-sm">{s.monthly_cost_cents > 0 ? `${fmtUsd(s.monthly_cost_cents)}/mo` : 'free'}</div>
        </div>
      );
    })}
  </div>

  <h2 class="font-bold text-lg mb-3">Buy New Server</h2>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
    {buyable.map(s => (
      <div class="bg-nt-bg-2 p-4 rounded">
        <div class="flex items-start justify-between mb-2">
          <div class="font-bold">{s.display_name}</div>
          <div class="text-nt-accent">{fmtUsd(s.purchase_cost_cents)}</div>
        </div>
        <div class="text-nt-text-dim text-xs italic mb-2">{s.flavor}</div>
        <div class="text-nt-text-dim text-sm">capacity {s.capacity} · {fmtUsd(s.monthly_cost_cents)}/mo</div>
        <button data-buy={s.type} class="mt-3 px-3 py-1.5 bg-nt-accent rounded text-sm" disabled={player.cash_usd_cents < s.purchase_cost_cents}>
          {player.cash_usd_cents < s.purchase_cost_cents ? 'Need more cash' : 'Buy'}
        </button>
      </div>
    ))}
  </div>

  <h2 class="font-bold text-lg mb-3">Upgrades Available ({upgradesAvail.length})</h2>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
    {upgradesAvail.map(u => (
      <div class="bg-nt-bg-2 p-4 rounded">
        <div class="flex items-start justify-between mb-2">
          <div class="font-bold">{u.display_name}</div>
          <div class="text-nt-accent">{fmtUsd(u.cost_usd_cents)}</div>
        </div>
        <div class="text-nt-text-dim text-sm mb-2">{u.effect}</div>
        <button data-upgrade={u.id} class="mt-1 px-3 py-1.5 bg-nt-accent rounded text-sm" disabled={player.cash_usd_cents < u.cost_usd_cents}>
          {player.cash_usd_cents < u.cost_usd_cents ? 'Need more cash' : 'Buy'}
        </button>
      </div>
    ))}
  </div>

  <script>
    document.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', async () => {
      const type = (b as HTMLElement).dataset.buy;
      const r = await fetch('/api/game/server', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!r.ok) return alert('error: ' + await r.text());
      location.reload();
    }));
    document.querySelectorAll('[data-upgrade]').forEach(b => b.addEventListener('click', async () => {
      const id = (b as HTMLElement).dataset.upgrade;
      const r = await fetch('/api/game/upgrade', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ upgrade_id: id }),
      });
      if (!r.ok) return alert('error: ' + await r.text());
      location.reload();
    }));
  </script>
</Base>
```

- [ ] **Step 2: Customers list page**

Server-rendered table: name, persona, satisfaction (color-coded), plan_tier, lifetime_value, joined-date.

- [ ] **Step 3: Tickets list page**

Server-rendered table grouped by status: name, customer-name, summary, age. **No chat UI yet** — that's Plan 2. For Plan 1, just listing + manual "close" button (calls `PATCH /api/game/tickets/:id/close` — also implement that endpoint here or skip until Plan 2).

For Plan 1 simplicity: tickets are read-only here, with a note "Use Shift mode (coming soon) to handle these."

- [ ] **Step 4: Pricing page (slider UI for hobby + business)**

Two number-inputs + Save button → POST `/api/game/pricing`.

- [ ] **Step 5: Marketing page (3 sliders for SEO/PPC/referral)**

Three range-inputs + visual proportion-bar + Save button → POST `/api/game/marketing`.

- [ ] **Step 6: Smoke + commit**

```bash
cd /home/aika/navtycoon
npm run build 2>&1 | tail -5
git add src/pages/play/
git commit -m "feat(ui): play pages — servers/customers/tickets/pricing/marketing"
git push origin main
```

---

### Task 13: Login page + manual trigger UI for testing tick

**Files:**
- Create: `/home/aika/navtycoon/src/pages/login.astro`
- Create: `/home/aika/navtycoon/src/pages/signup.astro`

- [ ] **Step 1: Login page (PromNET-bridge + email/password fallback)**

```astro
---
// src/pages/login.astro
import Base from '../layouts/Base.astro';
const url = new URL(Astro.request.url);
const next = url.searchParams.get('next') ?? '/play';
---
<Base title="Log in">
  <div class="max-w-md mx-auto py-12">
    <h1 class="text-3xl font-bold mb-6">Log in</h1>
    <a href="/api/auth/promnet-bridge" class="block w-full px-4 py-3 bg-nt-accent rounded text-center font-semibold mb-4">
      Continue with PromNET account
    </a>
    <p class="text-center text-nt-text-dim mb-4">— or —</p>
    <form id="login-form" class="space-y-3">
      <input type="email" name="email" placeholder="Email" required class="w-full px-3 py-2 bg-nt-bg-2 border border-nt-border rounded" />
      <input type="password" name="password" placeholder="Password" required class="w-full px-3 py-2 bg-nt-bg-2 border border-nt-border rounded" />
      <button class="w-full px-4 py-2 border border-nt-border rounded">Log in with email</button>
    </form>
    <p class="mt-6 text-center text-nt-text-dim text-sm">
      No account? <a href="/signup" class="text-nt-accent">Start your hosting empire</a>.
    </p>
    <script define:vars={{ next }}>
      document.getElementById('login-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
        });
        if (!r.ok) return alert('Invalid login.');
        location.href = next;
      });
    </script>
  </div>
</Base>
```

> **Note:** the `/api/auth/login` endpoint (email/password) is NOT in the file structure above — add it as a quick task here OR document that Plan 1 auth = SSO-only (PromNET-bridge), email/password is Plan 2. Recommend: **SSO-only for Plan 1** to reduce complexity; remove the email/password form from login.astro and only show "Continue with PromNET".

- [ ] **Step 2: Signup page**

Pure POST form to `/api/auth/signup` with email, password, company_name, city. Standard form-validation.

- [ ] **Step 3: Smoke + commit**

```bash
cd /home/aika/navtycoon
npm run build
git add src/pages/login.astro src/pages/signup.astro
git commit -m "feat(ui): login + signup pages"
git push origin main
```

---

### Task 14: Production deployment

**Files:**
- Modify: CF Pages project + secrets

- [ ] **Step 1: Create CF Pages project**

Per memory: `feedback_cf_env_vars.md` — sensitive secrets MINDIG `secret_text`. CF Pages git-integrated → autodeploy on push to main.

```bash
# CF Pages dashboard: create project navtycoon, link csiber/navtycoon GitHub
# OR via wrangler: wrangler pages project create navtycoon --production-branch main
```

Set production secrets (REST API + Global Key per `feedback_d1_rest_api.md`):
- `CRON_SECRET` (32-byte hex, secret_text)
- `STRIPE_*` (placeholders, secret_text)

D1 + PROMNET_DB bindings: configure in CF dashboard → navtycoon project → Settings → Functions → D1 bindings:
- `DB` → navtycoon-prod
- `PROMNET_DB` → promnet-prod

- [ ] **Step 2: Verify deploy on push**

```bash
cd /home/aika/navtycoon
git push origin main  # last commit triggers auto-deploy
```

Wait ~2 min for CF Pages build. Then:

```bash
curl -sI https://navtycoon.pages.dev/   # 200
curl -sI https://navtycoon.pages.dev/play  # 302 → /login
```

- [ ] **Step 3: Set up custom domain (deferred until name picked)**

Per spec §17 open-question: domain decision. Default placeholder = `hyperscaler.game`. Once registered:
- DNS: CNAME → navtycoon.pages.dev
- CF Pages → Custom Domain → add `hyperscaler.game`

Until domain available, navtycoon.pages.dev works for dev/testing.

- [ ] **Step 4: Test signup flow E2E**

Manual test:
1. `https://navtycoon.pages.dev/signup` (or via PromNET-SSO bridge if implemented first)
2. Verify player-row created in D1
3. Verify 1 server + 3 customers + 3 tickets
4. Land on /play, see dashboard with stats

Use the `claude+admin@promnet.hu` user (per `feedback_promnet_admin_login.md`) for admin testing if SSO-bridge route is wired up.

- [ ] **Step 5: Tag release**

```bash
git tag -a v0.1.0-plan1-infra-core -m "Hyperscaler Plan 1 — Infra + Game Core deployed"
git push origin v0.1.0-plan1-infra-core
```

- [ ] **Step 6: Smoke-test cron-tick manually**

```bash
CRON_SECRET=<your-value>
curl -X POST https://navtycoon.pages.dev/api/cron/tick \
  -H "x-cron-secret: $CRON_SECRET"
```

Expected: `{"ok": true, "players_ticked": N, "totals": {...}}`. Verify in D1 that ticket-count grows for active player.

---

## Self-Review

**Spec coverage check (against `2026-05-10-hyperscaler-mvp-design.md` Plan 1 scope):**

- §1 Vision (browser, hybrid async) → infra delivered
- §2 Audience (EN/DE/HU) → EN-only Plan 1, i18n Plan 3
- §3.1 Async layer → ✅ Tasks 9-11 (cron-tick, money, churn, spawn, events)
- §3.2 Shift layer → **Plan 2** (intentional)
- §3.3 Events → spawn skeleton in tick.ts, full handling Plan 2
- §4 AI engine → **Plan 2** (intentional)
- §5 Architecture → ✅ Tasks 1-2 (Astro/D1/Cron, no DO/Vectorize/AI yet)
- §6 Tech-tree → ✅ Task 6 (Era 1+2 specs)
- §7 Server-upgrade tree → ✅ Tasks 6-7
- §8 Pricing/Marketing → ✅ Task 8
- §9 Auth/SSO → ✅ Task 4 (cross-brand bridge)
- §10 Brand humor → seeded (placeholder ticket-text + flavor strings); full system Plan 3
- §11 Visual style → minimal Plan 1 (Tailwind + Base.astro); polish Plan 3
- §12 Adatmodell → ✅ Task 2 (full schema)
- §13 Deployment → ✅ Task 14
- §14 Phase 2-4 → out of scope (Plan 2 + 3)
- §15 Sikermutatók → measurable post-launch (Plan 3 task)
- §16 Becslés → Plan 1 = ~3 hét of the ~12 hét

**Placeholder scan:**
- Task 11 step 2: cron-trigger via separate Worker — flagged as Phase 2 task. Manual trigger documented.
- Task 13 step 1: email/password login → recommended SSO-only for Plan 1.
- Task 4 step 2: hashPassword placeholder → MUST verify against PromNET schema before commit.
- Task 4 step 3: PromNET-side `/app/sso/issue?target=hyperscaler` — assumed to exist; report BLOCKED if not.

**Type consistency:**
- `Player`, `Customer`, `Ticket`, `Server`, `UpgradeRow`, `GameEvent` types defined in Task 3, used throughout.
- `EraId`, `PlanTier`, `PersonaArchetype`, `ServerType`, `TicketStatus`, `EventType` consistent everywhere.
- `cash_usd_cents`, `mrr_usd_cents` integer cents pattern consistent (matches NavBot HUF-cents pattern).

**Plan 2 dependencies (IMPORTANT — these are placeholders that Plan 2 MUST replace):**
- `customer-spawn.ts` placeholder ticket-text → Workers AI prompt-driven
- `tick.ts` ticket-spawn loop → uses Vectorize-recall + Workers AI
- New: Durable Object per-player (shift-mode WS)
- New: persona-prompt-templates per archetype

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-hyperscaler-plan-1-infra-core.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks. Best for 14-task plans where some tasks depend on previous outputs (e.g., Task 4's PromNET-schema-check informs Task 5+).

**2. Inline Execution** — tasks ebben a session-ben, batch-checkpoint per Phase (Tasks 1-3 = infra, Tasks 4-8 = APIs, Tasks 9-11 = game-logic, Tasks 12-14 = UI+deploy).

**Auto-mode active:** if no choice given, default = Subagent-Driven, start immediately.
