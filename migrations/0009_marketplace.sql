-- 0009_marketplace.sql
-- Hyperscales easy-v0.8 marketplace: passive board of listings posted by
-- both players and NPCs. NPCs seed it on day 1 so the page never reads
-- "empty" to a brand-new player. Phase 2 will add transactions
-- (peering deals, hardware-resale, lead-buy) — this PR is read-only +
-- player-post-your-own.
--
-- 4 categories cover the natural lanes from the landing copy:
--   peering   — cross-region transit / regional capacity
--   hardware  — colocation slots, used servers, RAID shelves
--   service   — managed support, SOC 2 evidence packs
--   leads     — "want to buy" entries (mirror of "for sale")

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL,
  category TEXT NOT NULL,             -- peering | hardware | service | leads
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  price_unit TEXT NOT NULL DEFAULT 'one_time',  -- one_time | monthly | per_gb
  posted_at INTEGER NOT NULL,
  is_npc INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_marketplace_posted
  ON marketplace_listings(is_active, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_category
  ON marketplace_listings(category, is_active, posted_at DESC);
