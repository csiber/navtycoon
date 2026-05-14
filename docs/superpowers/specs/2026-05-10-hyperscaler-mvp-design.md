# Hyperscales — Hosting-tycoon játék MVP design

**Working title:** Hyperscales (`hyperscaler.game`)
**Status:** Design — user-approved 2026-05-10, delegated decisions filled in
**Owner:** csiber
**Phase:** 1 / 4 (MVP) → Phase 2 multiplayer-events → Phase 3 Era 3+4 → Phase 4 Steam-port

---

## 1. Vision

Browser-based hybrid (async + real-time) hosting-tycoon játék, ahol:
- Az ügyfelek **valódi LLM-NPC-k** (Workers AI, Llama-3.1-8b), nem scriptelt mondatok
- **Perzisztens memory** (Vectorize) — minden ügyfél emlékszik a múltbeli ticketjeire
- **Tech-tree progresszió**: 2002 LAMP → 2008 VPS → 2015 Cloud → 2026 Edge-AI (MVP-ben Era 1-2)
- **Cloudflare-cosplay** termék-nevek + dev-meta humor
- F2P + $5/hó Pro

**USP:** "Az első tycoon, ahol az ügyfelek tényleg veled beszélgetnek." Senki nem csinál ilyet single-player skálán.

**Nem-cél:** AAA-grafika, Steam-port (Phase 4), mobile-app (browser-first felelős). Phase 1 **pure browser**, mobile-responsive.

## 2. Cél-közönség

- **Primary:** Cloudflare-developer-community + indie-SaaS-buildelők, globális, EN-elsősorban
- **Secondary:** Dev-tycoon-rajongók (Game Dev Tycoon, Startup Company-fanok)
- **Languages:** EN (default) + DE + HU
- **Acquisition channels:** Twitter/X, HN ("Show HN: AI-customers in a hosting tycoon"), r/sysadmin, CF Discord

## 3. Játék-rétegek (a mag)

### 3.1 Háttér / Async (mindig megy)

**Cron-tick: 5 percenként**
- Ticket-spawn: aktív ügyfelek 5%-a/óra ticket-et generál (Workers AI háttér-batch)
- Money-trickle: `MRR × (5/60/24)` per tick → bevétel
- Customer-churn: 48h+ válasz nélküli ticket → 30% churn-roll
- Server-load tick: kapacitás-arány → satisfaction-decay >90%-on
- Random-event spawn: napi 1-2 (DDoS, viral, electricity-bill, recruit-ad, intern-incident)

Belépéskor: "Az elmúlt 6 órában..." összefoglaló (Egg Inc. minta).

### 3.2 Shift / Real-time (15-30 perc-es ülés)

**"Start Shift"** → Durable Object bind → WebSocket nyit:
- Queue: 5-15 várakozó ticket
- Mindegyik egy AI-NPC (perzisztens persona + Vectorize-recall)
- Chat-window: szabadszöveges válasz
- Akció-gombok: `[Refund 30%] [Refund 50%] [Escalate to senior] [Investigate (mini-puzzle)] [Close as resolved]`
- AI-customer reagál: hangulat-szám változik (-100..+100)
- Sikeres lezárás → +XP, +reputation, +tip
- Sikertelen → -reputation, -MRR, churn-prone

Shift végén: Z-style summary, animált XP-bar, "today's top customer save: …".

### 3.3 Event / Special (havi)

Phase 1 **single-player only**, multiplayer Phase 2:
- **DDoS-day**: 24h × +500% ticket-rate, kapacitás-bottleneck
- **Viral-blog**: egy ügyfél blogja virálissá vált → +3000 visitor/sec
- **Black Friday**: ügyfél-akvizíció +200%, ár-verseny, margin-squeeze
- **Compliance-audit**: random GDPR/HIPAA mini-event
- **DMCA-takedown**: jogi event ("egy ügyfeled torrent-trackert üzemeltet")

## 4. AI-customer engine

### 4.1 Persona archetípusok (8 db Phase 1)

| ID | Név | Karakter | Tipikus complaint |
|---|---|---|---|
| `karen` | The Karen | Felháborodott, eszkalál, hangos | "MOST kell, fekete-péntek!" |
| `newbie` | The Newbie | Zavart, alapfogalmakat sem ért | "Hol a 'Submit' gomb?" |
| `pro` | The Pro | Technikás, részletes, szakszerűt vár | "504 timeout, fastcgi_buffer_size?" |
| `cheapskate` | The Cheapskate | Alkudozik, refund-vadász | "Tegnap downtime volt, jár visszatérítés!" |
| `ghost` | The Ghost | Alig jelez, csendben elmegy | (ritka, de fontos: kérdezned kell ha eltűnik) |
| `loyalist` | The Loyalist | Magas satisfaction, ritka panaszú | (érdemes őt megtartani) |
| `drama` | The Drama Queen | Twitter-fenyegetés, kis dolgokat felfúj | "Posztoltam már Twitterre!" |
| `crypto` | The Crypto-bro | High-traffic, gyanús botnet-jel | "Légyszi több bandwith, fontos miner-projekt" |

Plusz **Easter-egg-NPC-k** (rare-spawn): `L. Torvalds` (csak kernel-panaszok), `S. Stallman` (GNU/Linux-pronunciation insist), `Patrick from SpongeBob` (értelmetlen panasz).

### 4.2 Persona → NPC példányosítás

Minden customer egy `persona_archetype`-ot kap és kis randomizációt:
```
customer = {
  id, player_id, name (random from name-pool per-locale),
  persona_archetype, persona_drift (small random adj),
  plan_tier, joined_at, satisfaction, churn_risk, lifetime_value,
  last_ticket_at
}
```

### 4.3 Memory (Vectorize)

```
ticket_history (D1):
  ticket_id, customer_id, summary, resolution,
  player_response_quality (AI-rated 0-10), embedding_id

vectorize index: customer_memory
  vector: 768-dim (llama-embed)
  metadata: { customer_id, ticket_id, sentiment, era_id }
```

Ticket-spawn workflow:
1. Vectorize-lookup top-3 past tickets a customer-nek
2. System prompt: persona + history-context + current-state + random-event
3. Llama-3.1-8b-instruct → ticket szöveg
4. Ment D1 + új embedding Vectorize

Shift-chat workflow:
1. WebSocket DO-tól → user msg érkezik
2. DO felveszi a customer current-state-et + recent-chat-buffer
3. Workers AI streamel választ (incremental WS-frame)
4. Akció-gomb-választás → DO updateli satisfaction/state

### 4.4 Cost-control

- **Per-user daily cap**: free 5 LLM/nap, paid 50/nap (hard-stop, queue-elt)
- **Idle-user pause**: 7 napja inaktív → cron-spawn skip
- **Batch spawn**: 1 cron-tick = 50 customer egy prompt-szettben
- **Rate-limit**: 1 chat-msg / 2sec / user (DO-counter)
- **Abuse-detection**: >5× normál használat → temp-ban
- **Fallback**: ha Workers AI down → Gemini-Flash ($0.075/M)
- **System-prompt cache**: persona-template mindig ugyanaz → CF auto-cache

→ **Becsült cost: $0.05-0.30 / user / hó. $5/hó subscription = 16-100× margin.**

## 5. Architektúra (CF-natív)

```
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare Pages (Astro 5 + Vite + React-component)         │
│ Routes: /, /play, /tech-tree, /shift, /settings, /pricing  │
│ Auth: cross-brand SSO (PromNET/NavBot users-tábla bind)    │
└──────────┬──────────────────────────────────────────────────┘
           │ HTTPS + WS (in shift-mode)
┌──────────▼──────────────────────────────────────────────────┐
│ Workers (game-API + WS-upgrade)                             │
│ /api/game/state           GET state-snapshot                │
│ /api/game/upgrade         POST server-upgrade               │
│ /api/game/pricing         POST pricing-slider              │
│ /api/game/marketing       POST channel-allocation           │
│ /api/shift/start          POST → DO-bind, WS-upgrade        │
│ /api/shift/msg            WS frame relay                    │
│ /api/shift/action         POST [refund|escalate|...]        │
│ /api/leaderboard          GET top-100                       │
│ /api/billing              Stripe webhooks                   │
└─┬────────┬────────┬────────┬────────┬────────┬─────────────┘
  │        │        │        │        │        │
  ▼        ▼        ▼        ▼        ▼        ▼
 ┌──┐  ┌────────┐ ┌────────┐ ┌──────┐ ┌─────┐ ┌────────┐
 │D1│  │DO      │ │Workers │ │R2    │ │Vec- │ │Queues  │
 │  │  │(per    │ │AI      │ │      │ │tor- │ │(batch  │
 │  │  │player+ │ │(Llama- │ │logs, │ │ize  │ │LLM,    │
 │  │  │shift   │ │8b)     │ │tickets │      │ │NAV-szla│
 │  │  │room)   │ │        │ │ticket-│ │     │ │... no, │
 │  │  │        │ │        │ │attach)│ │     │ │not    │
 │  │  │        │ │        │ │       │ │     │ │needed)│
 └──┘  └────────┘ └────────┘ └──────┘ └─────┘ └────────┘

Cron Triggers:
  */5 * * * *  → game-tick (ticket-spawn, money, churn, events)
  0 0 * * *    → daily reset (shifts/day counter, daily quests)
  0 * * * *    → analytics-flush
```

**CF-cosplay belül a game-ben** (player-facing termék-nevek):

| CF-szolgáltatás | In-game név |
|---|---|
| Workers | `EdgeRunners` (NPC-szerverek) |
| D1 | `QuickStore` |
| R2 | `ColdVault` |
| Vectorize | `MemoryMesh` |
| DO | `RoomCoordinator` |
| Cron | `TimeKeeper` |
| Queues | `JobBroker` |
| Workers AI | `OracleAI` |

→ Játékban "vásárolhatsz" ezeket — a játékos nem tudja hogy ez tényleg a saját CF-stack. Easter egg: aki látja a wrangler.toml-t, mosolyog.

## 6. Tech-tree (MVP: Era 1 + Era 2)

### Era 1 — LAMP / Shared hosting (~2002, kezdő)

**Visual:** beige-tower garage-rack (pixel-art), CRT-monitor frame a UI körül, IRC-style support-window.

**Server-tech:**
- Apache + MySQL + PHP4 (mono-server)
- Max 100 customer / box
- Shared filesystem, /home/user/public_html

**Customer-tier:**
- Hobby ($5/hó) — 100MB disk, 1GB bandwith
- Business ($15/hó) — 1GB disk, 10GB bandwith

**Tipikus complaint:**
- "phpBB telepítés nem megy"
- ".htaccess miért nem működik?"
- "Hol az FTP-jelszó?"

**Random events:**
- "Slashdot effect" (akkor még Slashdot, nem HN)
- "Háztartási áram-kimaradás"
- "Egy ügyfeled WordPress XSS-vulnerable" (security-event)

**Eras-szám: 6-8 órás játékmenet**, ~50 customer-cap-el zárul.

### Era 2 — VPS / Dedicated (~2008, unlock 50 customer után)

**Visual:** rack-server datacenter-térkép, SSH-terminal mini-game, Webmin-cosplay UI.

**Server-tech:**
- KVM/Xen virtualizáció
- Dedikált box-ok (200 customer/rack)
- IPv4-bérlet (limitált, drága)
- RAID-config (1/5/10), monitoring (Nagios-cosplay)

**Customer-tier:**
- VPS ($25/hó) — 2GB RAM, 50GB SSD
- Dedicated ($150/hó) — saját rack-egység

**Tipikus complaint:**
- "VPS-em RAM-out, szöszölj már bele"
- "SSL-cert lejárt"
- "Lassú a database, slow-query-log?"

**Random events:**
- "Datacenter cooling failure"
- "Network-uplink ISP-down"
- "Botnet bérlés ügyfél-fele" (DMCA-event)

**Eras-szám: 10-12 órás játékmenet**, ~500 customer-cap-el.

### Phase 2 (későbbi)
- **Era 3 — Cloud-native (~2015):** AWS-cosplay, autoscale, S3-bucket, container-deploy
- **Era 4 — Edge-AI (~2026):** Workers, Vectorize, AI-augmented support, edge-globális

## 7. Server-upgrade tree (Phase 1, kb. 20 item)

**Era 1:**
1. Cooling-fan upgrade (+10% capacity)
2. RAM-bővítés (+50% capacity)
3. Better PSU (-30% downtime-roll)
4. Backup-script (-50% data-loss-event impact)
5. cPanel-license (+20% customer-satisfaction)
6. Apache-mod_security (-30% security-event)
7. mod_pagespeed (+15% page-load = +sat)
8. CDN-bind (Cloudflare-cosplay első unlock)

**Era 2:**
9. Hardware RAID-controller
10. UPS battery-backup
11. Multi-uplink BGP-config
12. Nagios-monitoring
13. SSH-key-only auth (-40% security-event)
14. Automated-failover
15. SSL-wildcard cert
16. Webmin-licensed (+10% rev/sat)
17. Containerization-first (Docker-prelude)
18. CI/CD pipeline (-50% deploy-event)
19. PostgreSQL-add (Pro-customer unlock)
20. CDN-pop globális (Era 3 előzmény)

Mindegyik upgrade D1-ben tárolt; UI-ban tech-tree-grafika (kattintható node-ok).

## 8. Pricing + Marketing

### 8.1 Pricing (in-game, customer-facing)

Player állít: 3-tier-slider:
- Hobby: $3-10/hó
- Business: $10-30/hó
- VPS: $20-60/hó (Era 2-ben unlock)

→ Magasabb ár = kevesebb új customer + magasabb churn, alacsonyabb = több customer + low margin. Balance dilemma.

### 8.2 Marketing (in-game)

3 channel-allokáció (heti $-budget szétosztva):
- **SEO** (lassú, organikus, sticky customer)
- **PPC** (gyors, drága, churn-prone)
- **Referral** (organikus de slow-burn, loyal customer)

Plus passzív: customer-satisfaction → word-of-mouth bonus.

### 8.3 Pricing (real, monetization)

- **Free** — 1 shift/nap, 5 LLM/shift, alap events, anonim leaderboard
- **Pro $5/hó** — 5 shift/nap, 50 LLM/shift, premium events ("VIP-customer-spawn"), named leaderboard, persona-customization (Phase 2)
- **Phase 2 DLC**: "Era 3 Cloud Pack" $9 one-time, "Era 4 Edge-AI Pack" $9 one-time
- **Stripe USD-first** (global), HUF + EUR Phase 2

## 9. Auth + Cross-brand integráció

### 9.1 Cross-brand SSO

Új user megteheti:
- Sign up in-game directly (email + password, navtycoon-only fiók)
- "Login with PromNET account" — meglévő PromNET/NavBot user-rekord re-use

Architektúra:
- **Shared `users` D1-tábla** a PromNET/NavBot D1-ben (`promnet-prod`)
- Új `navtycoon_*` táblák saját D1-ben (`navtycoon-prod`) — separation of scaling concerns
- `users.id` (TEXT) → `navtycoon_*` rekord-FK

### 9.2 Cross-brand promóció

- PromNET-dashboard-on banner: "Játssz Hyperscales-rel" (dev-érdeklődő user-eknek)
- Hyperscales-on Easter-egg: "Want a real CF-account?" → PromNET-promóció link
- "Csaba-cameo" achievement: ha eléred az 1M MRR-t → fő-NPC-ként megjelenik egy "Founder Polyák Csaba" customer

## 10. Brand humor (kötelező réteg!)

A célközönség dev-meta-humor-szerelmes. Bele kell sütni mindenbe.

### 10.1 Customer dialógus (példa-snippet-ek)

Minden persona-archetype prompt-template-ben **explicit humor-utasítás**:
- Karen: "Always use ALL CAPS at least once. Threaten Twitter."
- Crypto-bro: "Use 'gm', 'wagmi', 'bullish', mention 'discord ser'."
- Newbie: "Confuse technical terms — say 'database' when meaning 'WordPress', 'cookies' when meaning 'cache'."
- Pro: "Quote man-page snippets, mention obscure RFC-numbers. Sigh deeply about kids these days."

### 10.2 Random-event narratíva

Ne száraz: "DDoS attack — capacity -50%". Inkább:
- "🚨 **HN front page!** Egy ügyfél blogja a #1-en. Az infra füstöl. ETA előtt 45 perc."
- "💸 **Áram-kimaradás:** A buta intern megint elfelejtette fizetni a számlát. -2 óra service. -8% reputation. Felmondod?"
- "🍺 **Datacenter-pincér esemény:** A kollégád vidéki meccs-éjszakán kávé-helyett sört ivott. Random server-restart. -50% sat 1 órára."

### 10.3 Achievement-rendszer (Phase 1: 12 db)

- **"First Blood"** — Első customer onboarding
- **"Survived First HN Hug of Death"** — Viral-event-et túléltél  
- **"DMCA Veteran"** — 5× DMCA-takedown lekezelve
- **"`rm -rf /` Survivor"** — Intern-incident után visszaállítottál
- **"The Long Tail"** — 100 ügyfél elérte
- **"Ticket Whisperer"** — 50 ticket back-to-back resolved
- **"Refund King"** — $1000 refund-osztva (negatív achievement, vicc)
- **"Karen Whisperer"** — 10 Karen-archetype +90 satisfaction-tel
- **"Cluster F"** — Egy órán belül 3 outage
- **"L. Torvalds Approved"** — Easter-egg-NPC-t boldogan elengedted
- **"From Garage to Glory"** — Era 2 unlock
- **"Polyák Award"** — $1M lifetime MRR

### 10.4 UI-szöveg humor (loading + status)

Loading-screen-ek:
- "Compiling complaints..."
- "Reticulating splines... wait wrong game"
- "Rebooting the rebooter..."
- "Asking the AI nicely..."
- "Counting the bytes (manually)..."

Status-bar quips (random rotation):
- "Server status: Existentially questioning"
- "Server status: Coffee-deprived"
- "Server status: Surprisingly fine, suspicious"
- "Server status: One step away from production"

### 10.5 Easter-eggs

- Konzol-bemenetre `cat /var/log/syslog` → ASCII-art + viccek
- Bizonyos óra (3 AM player-time) → "Why are you up?" üzenet
- Steam-jellegű achievement-popup amikor unlock-olsz
- Konami-code → cheat-mode (csak Phase 2 dev-test-re)

## 11. Visual style + UI-stack

### 11.1 Aesthetic-direction

- **Default:** modern dashboard (Tailwind + shadcn-style components), dark-mode default
- **Tech-tree-view:** era-specifikus skeu-touches:
  - Era 1: CRT-frame, beige-rack pixel-art, IRC-style chat
  - Era 2: rack-grafika SSH-terminal-betű, Webmin-cosplay panels
- **Animation:** subtle (parallax, fade-in), nem WebGL-AAA

### 11.2 UI-component-pluginok használata

A `ui-ux-pro-max` plugint be lehet vetni:
- Color-palette + font-pairing-választás (Tailwind-config-into)
- Industry-pattern: SaaS-dashboard + Game-HUD-komponens-ek
- Accessibility-baseline (kontraszt, reduced-motion, screen-reader)

A `frontend-design` plugint a shift-chat UI-design-ra (XSS-safe, real-time WS-friendly, gamified-feeling).

### 11.3 Locale (i18n)

3 nyelv: EN (default), DE, HU.
- Static UI-szövegek: JSON-locale-fájlok (Astro-i18n integration)
- AI-customer-szöveg: prompt-szerinti `language: <code>` szabad-szóbeszéd-generálás
- Loading-screen humor: nyelvenként más vicc-szettek

## 12. Adatmodell (D1 — `navtycoon-prod`)

```sql
-- Players (1:1 user-rel; `user_id` FK to PromNET shared users.id)
CREATE TABLE players (
  user_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  city TEXT,
  founded_at INTEGER NOT NULL,
  current_era INTEGER NOT NULL DEFAULT 1,
  reputation INTEGER NOT NULL DEFAULT 50,  -- -100..+100
  cash_usd_cents INTEGER NOT NULL DEFAULT 100000,  -- starts $1000
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

-- Customers (NPC-k)
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  persona_archetype TEXT NOT NULL,  -- 'karen' | 'newbie' | ...
  plan_tier TEXT NOT NULL,  -- 'hobby' | 'business' | 'vps' | 'dedicated'
  joined_at INTEGER NOT NULL,
  satisfaction INTEGER NOT NULL DEFAULT 50,  -- -100..+100
  churn_risk INTEGER NOT NULL DEFAULT 0,  -- 0-100
  lifetime_value_cents INTEGER NOT NULL DEFAULT 0,
  last_ticket_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);
CREATE INDEX idx_customers_player ON customers(player_id, is_active);

-- Tickets
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'in_progress' | 'resolved' | 'churned'
  resolution TEXT,
  ai_quality_rating INTEGER,  -- 0-10 from AI
  satisfaction_delta INTEGER,
  embedding_id TEXT,  -- Vectorize-id
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX idx_tickets_player_status ON tickets(player_id, status);

-- Servers (player infrastructure)
CREATE TABLE servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  era INTEGER NOT NULL,
  type TEXT NOT NULL,  -- 'lamp_box' | 'rack_unit' | 'vps_node' | ...
  capacity INTEGER NOT NULL,
  current_load INTEGER NOT NULL DEFAULT 0,
  monthly_cost_cents INTEGER NOT NULL,
  upgrades_json TEXT NOT NULL DEFAULT '[]',  -- array of upgrade-id-k
  purchased_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);

-- Upgrades (megvásárolt tech-tree-node-ok)
CREATE TABLE upgrades (
  player_id TEXT NOT NULL,
  upgrade_id TEXT NOT NULL,  -- 'cooling_fan' | 'cpanel_license' | ...
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, upgrade_id)
);

-- Events (random + scheduled)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  data_json TEXT,
  spawned_at INTEGER NOT NULL,
  resolved_at INTEGER,
  outcome TEXT  -- 'positive' | 'neutral' | 'negative'
);

-- Achievements
CREATE TABLE achievements (
  player_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, achievement_id)
);

-- Audit-log (security + abuse-detection)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
```

## 13. Deployment + DevOps

- Új GitHub repo: `csiber/navtycoon` (publik landing-only readme; engine privát)
- Új CF Pages project: `navtycoon`
- Új D1 database: `navtycoon-prod` (külön a PromNET-től)
- Vectorize index: `navtycoon-customer-memory`
- Új Stripe products: "Hyperscales Pro Monthly" ($5)
- Domain: **`hyperscaler.game`** (ha foglalt: `edgebaron.io`, `hostlords.com`, vagy user-pick)
- Cron Trigger: `*/5 * * * *` game-tick + `0 0 * * *` daily-reset

## 14. Phase 2-4 előretekintés (NEM része Phase 1-nek)

- **Phase 2** (3-4 hó MVP-launch után): multiplayer-events (Black Friday tournament, DDoS-day), persona-customization, EU/HUF Stripe, achievement-bővítés
- **Phase 3** (6 hó): Era 3 (Cloud) + Era 4 (Edge-AI), real DLC-monetizáció, partner-integration ("Use real CF-account-od" achievement)
- **Phase 4** (12+ hó): Steam-port, mobile-natív, esports-jellegű streamer-friendly mode

## 15. Sikermutatók (Phase 1 launch+90 nap)

- 1.000+ regisztráció
- 100+ aktív Pro-subscriber ($500+ MRR)
- 30%+ D7 retention (free user)
- 4.0+/5 user-rating (in-game)
- 1+ HN front-page hit (acquisition)
- 0 cost-disaster (Workers-AI < $50/hó)

## 16. Becslés (Phase 1 MVP)

| Szakasz | Idő |
|---|---|
| Repo+infra setup, Pages-deploy, D1-schema | 0.5 hét |
| Game-engine core (state, cron-tick, money-loop) | 2 hét |
| AI-customer engine (Workers AI + Vectorize) | 1.5 hét |
| Shift-mode UI + WS + DO-room + chat | 2 hét |
| Server-upgrade tree + UI | 1 hét |
| Pricing + marketing UI | 0.5 hét |
| Random-events + balance-pass | 1.5 hét |
| Stripe + onboarding + cross-brand SSO | 0.5 hét |
| Leaderboard + i18n (EN+DE+HU) | 1 hét |
| Achievements + humor-content | 0.5 hét |
| Polish + playtest + balance | 1 hét |
| **Total** | **~12 hét = ~3 hónap** |

## 17. Open Questions (delegated decisions Csaba-nak később)

1. **Domain end-pick** — `hyperscaler.game` vs `edgebaron.io` vs saját ötlet
2. **Visual-asset-stílus** — saját pixel-art / Midjourney-batch / shadcn-only
3. **Music + sound** — Phase 1 silent vagy chiptune-loop
4. **Beta-list** — kit invitálsz first-100 user-be (CF-discord-rajongók?)

Ezek a launch-időszakban dönthetők, nem blokkolnak fejlesztést.

---

**Ezt a spec-et a brainstorm alapján Claude (Opus 4.7) írta, user-delegated decisions-ekkel, 2026-05-10. Az implementáció a writing-plans-skill task-decompozíciójával folytatódik a `csiber/navtycoon` repo-ban.**
