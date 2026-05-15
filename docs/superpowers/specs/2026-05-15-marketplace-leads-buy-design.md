# Marketplace Leads — Buy-flow MVP

**Status:** approved (2026-05-15)
**Author:** Claude + csiber
**Implements:** Phase 2 of Marketplace v0.8 — first real game-mechanic tied to the marketplace board.

## Problem

`/play/marketplace` ships today as a passive board. NPC listings exist, players can post their own, but nothing transacts — no cash moves, no customer/server effect. User feedback: *"mire jó ez?"* The board reads as flavor with no payoff.

Early-game players are also choke-pointed on customer count: 3 customers means ~$15 MRR which is well below the $15/day burn. Acquiring a customer through the marketplace is the natural lever — it ties an existing surface to the game's main bottleneck.

## Goals

- Player can spend cash on a marketplace lead listing and receive a **real customer row** in their flotta.
- 5 starter listings cover the customer archetype spectrum (loyalist → karen) at different price/risk tiers.
- The transaction is atomic, idempotent, and visible across UI surfaces (`/play/marketplace`, `/play/customers`, `/play/finance`).
- Foundation is reusable: schema supports future `effect_type`s (hardware-buy, peering-discount, service-buff) without re-migration.

## Non-goals (YAGNI)

- Refund / re-list flow.
- Player-posted lead-listings being buyable (only NPC listings).
- Tier-filter UI on the marketplace board.
- "Verified seller" / reputation system for sellers.
- 24h cron refresh of new leads (Phase 3; for MVP the 5 seeds stay).

## Architecture

### Data model

Migration on `marketplace_listings`:

```sql
ALTER TABLE marketplace_listings ADD COLUMN effect_type TEXT;
ALTER TABLE marketplace_listings ADD COLUMN effect_payload TEXT;  -- JSON
ALTER TABLE marketplace_listings ADD COLUMN sold_at INTEGER;       -- unix sec, nullable
ALTER TABLE marketplace_listings ADD COLUMN sold_to_player_id TEXT;
CREATE INDEX idx_marketplace_listings_sold ON marketplace_listings(sold_at);
```

`effect_type` is an open enum — initial value `'spawn_customer'`. `null` means the listing is informational only (the 3 existing WTB seeds stay this way).

`effect_payload` for `spawn_customer`:

```json
{
  "archetype": "loyalist",
  "name": "Sarah Chen",
  "starting_satisfaction": 75,
  "monthly_cents": 2900,
  "trial_days": 7
}
```

### 5 new NPC lead seeds

| Name        | Archetype  | Price | MRR     | Trial   | Starting sat | Notes                              |
|-------------|------------|-------|---------|---------|--------------|------------------------------------|
| Sarah Chen  | loyalist   | $200  | $29/mo  | 7 days  | 75           | low churn, stable                  |
| Tomás López | newbie     | $150  | $15/mo  | 7 days  | 60           | med risk — generates more tickets  |
| Avery Tran  | pro        | $400  | $59/mo  | 0 (paying immediately) | 60 | low churn, RFC-quoting             |
| Jordan Smith| cheapskate | $80   | $9/mo   | 14 days | 45           | refund-asker                       |
| Beth Park   | karen      | $50   | $19/mo  | 7 days  | 25           | **HIGH churn risk, P1 magnet**     |

The intentional pricing-vs-quality tension: cheap leads carry the worst archetypes. Player decision becomes "do I splurge on Avery Tran or risk Beth Park?", not "I buy the cheapest one every time."

The 3 existing WTB listings (`npc-pixelforge`, `npc-quantum-pulse`, `npc-maelstrom`) keep their current copy with `effect_type = NULL` — flavor only, not buyable.

### Buy flow

**Frontend (`marketplace.astro`):**
- Lead-category cards with `effect_type = 'spawn_customer'` and `sold_at IS NULL` render a **"Vétel $X"** button.
- Click opens a confirm modal: archetype/MRR/trial summary + cancel/confirm.
- Confirm → `POST /api/marketplace/purchase/:id`.
- Success → toast "+1 ügyfél: {name}" + `location.reload()` (matches the existing post-form-submit pattern in `marketplace.astro`).
- Sold listings render a grayed-out "ELADVA" badge instead of a button.

**API (`/api/marketplace/purchase/[id].ts`):**
- Auth check, listing exists, `category='leads'`, `effect_type='spawn_customer'`, `sold_at IS NULL`.
- Read player cash. If `cash_usd_cents < price_cents` → 402 `{error:'insufficient_cash'}`.
- D1 batch (single transaction):
  1. `UPDATE marketplace_listings SET sold_at=?, sold_to_player_id=? WHERE id=? AND sold_at IS NULL` (sold-once guard).
  2. `UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?` (cash deduction).
  3. `INSERT INTO customers (player_id, name, persona_archetype, satisfaction, monthly_rate_cents, is_active, trial_ends_at, created_at, ...)` — fields drawn from `effect_payload`. `trial_ends_at = created_at + trial_days*86400` (when `trial_days=0`, equals `created_at` → no trial, customer pays from day 1; the cron-tick already treats `trial_ends_at <= now` as paying).
- If step 1 affects 0 rows (race), return 409 `{error:'sold'}`.
- Response: `{ok:true, customer_id, customer_name, cash_remaining_cents}`.

### Listing lifecycle

- Sold listings stay visible on the board (with the ELADVA/SOLD/VERKAUFT badge) — players see what others bought. Distinguishes a "depleted" marketplace from an empty one.
- `listListings()` includes sold rows by default; the UI grays them.
- No respawn in MVP. Future Phase 3 cron job refills the pool.

### i18n keys (new)

In `src/lib/i18n.ts` for each locale (EN/HU/DE):

- `marketplace.buy_cta` — "Buy $X" / "Vétel $X" / "Kaufen $X"
- `marketplace.buy_confirm_title` — "Confirm purchase" / "Vásárlás megerősítése" / "Kauf bestätigen"
- `marketplace.buy_confirm_body` — "{name} ({archetype}) for $X. Expected: $Y/mo, {trial} day trial." (with placeholders)
- `marketplace.buy_confirm_ok` — "Buy" / "Megveszem" / "Kaufen"
- `marketplace.buy_confirm_cancel` — "Cancel" / "Mégse" / "Abbrechen"
- `marketplace.buy_success` — "+1 customer: {name}" / "+1 ügyfél: {name}" / "+1 Kunde: {name}"
- `marketplace.sold_badge` — "SOLD" / "ELADVA" / "VERKAUFT"
- `marketplace.err.insufficient_cash` — "Not enough cash" / "Nincs elég készpénz" / "Nicht genug Geld"
- `marketplace.err.sold` — "Already sold" / "Már elkelt" / "Bereits verkauft"

Archetype names already covered by existing `shift.archetype.*` keys — reuse them in the confirm-modal body.

### Files affected

| File                                                | Change                                  |
|-----------------------------------------------------|-----------------------------------------|
| `migrations/<next-seq>_marketplace_listings_effect.sql` | new — ALTER + INDEX. Sequence number assigned at implementation time. Existing rows get `effect_type=NULL` (no default), so the 3 WTB seeds remain informational-only without code changes. |
| `src/lib/marketplace/db.ts`                         | extend types, helper `markSold()`       |
| `src/lib/marketplace/npc-seeds.ts`                  | append 5 new lead seeds w/ effect       |
| `src/lib/marketplace/translations.ts`               | translate 5 new lead titles/bodies HU/DE|
| `src/pages/api/marketplace/purchase/[id].ts`        | new — POST handler                      |
| `src/pages/play/marketplace.astro`                  | buy button + confirm modal + toast      |
| `src/lib/i18n.ts`                                   | 9 new keys × 3 locales                  |

### Testing / verification

Smoke flow with `auditen@hyperscales.local`:

1. Open `/play/marketplace?category=leads` — see 8 listings (3 WTB + 5 new).
2. Click "Buy $200" on Sarah Chen → confirm → success toast.
3. `/play/finance` → cash reduced by $200.
4. `/play/customers` → Sarah Chen visible, archetype=loyalist, trial_ends_at = now + 7d.
5. Back to marketplace → Sarah Chen card shows ELADVA badge, no button.
6. Try `POST /api/marketplace/purchase/<sarah_id>` again via curl → 409 sold.
7. Repeat with insufficient cash: player at $50 tries Avery Tran ($400) → 402 insufficient_cash.

Repeat the locale check on HU + DE audit users — confirm buttons, modal copy, toast all match.

### Risks

- **D1 transactional guarantees:** D1 batches are atomic; the `UPDATE … WHERE sold_at IS NULL` check is the race-safe gate. If two players race, only one batch's UPDATE affects a row; the loser's batch sees 0 affected rows and returns 409.
- **Trial mechanics:** the existing `customers` table already has `trial_ends_at` and the cron-tick (`/api/cron/tick.ts`) flips trial → paying on expiry. New customers slot in cleanly.
- **Cash floor at zero:** cash is stored as signed `cash_usd_cents`. We check `>= price` before the deduction so we never go negative.
