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
