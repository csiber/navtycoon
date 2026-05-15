-- 0010b_marketplace_seed_buyable_leads.sql
-- 5 buyable lead listings (effect_type = spawn_customer) for the Phase 2
-- marketplace buy-flow. Idempotent via WHERE NOT EXISTS on (author_id, title).
-- Spec: docs/superpowers/specs/2026-05-15-marketplace-leads-buy-design.md
--
-- Production status: already applied to navtycoon-prod on 2026-05-15
-- (ids 14-18). Re-applying via wrangler / REST API is now a no-op.

INSERT INTO marketplace_listings
  (author_id, category, title, body, price_cents, price_unit, posted_at, is_npc, is_active, effect_type, effect_payload)
SELECT
  'npc-pixelforge', 'leads', 'Sarah Chen wants stable hobby hosting — referral $200',
  'Sarah runs a small DTC skincare shop on Squarespace. Wants a real $5-15/mo VPS for her staging environment. Loyal type — pays on time, asks once a quarter if everything''s fine. We are full, sending her your way for a flat $200 referral. She picks the host.',
  20000, 'one_time', strftime('%s','now') - (6*3600), 1, 1,
  'spawn_customer',
  '{"archetype":"loyalist","name":"Sarah Chen","plan_tier":"hobby","starting_satisfaction":75}'
WHERE NOT EXISTS (
  SELECT 1 FROM marketplace_listings WHERE author_id = 'npc-pixelforge' AND title = 'Sarah Chen wants stable hobby hosting — referral $200'
);

INSERT INTO marketplace_listings
  (author_id, category, title, body, price_cents, price_unit, posted_at, is_npc, is_active, effect_type, effect_payload)
SELECT
  'npc-riverside', 'leads', 'Tomás López — first-time founder needs hand-holding',
  'Tomás just left his sysadmin job to launch a local-business directory. Doesn''t know what a CNAME is yet but is patient and pays in advance. Cheap hobby tier, lots of support tickets but kind. $150 finder.',
  15000, 'one_time', strftime('%s','now') - (12*3600), 1, 1,
  'spawn_customer',
  '{"archetype":"newbie","name":"Tomás López","plan_tier":"hobby","starting_satisfaction":60}'
WHERE NOT EXISTS (
  SELECT 1 FROM marketplace_listings WHERE author_id = 'npc-riverside' AND title = 'Tomás López — first-time founder needs hand-holding'
);

INSERT INTO marketplace_listings
  (author_id, category, title, body, price_cents, price_unit, posted_at, is_npc, is_active, effect_type, effect_payload)
SELECT
  'npc-aurora-data', 'leads', 'Avery Tran — business-tier, RFC-quoting senior engineer',
  'Avery is a principal engineer at a fintech. Wants a business-tier setup for his side project. Will read your status page, will email you about IPv6, will pay on time, will not blink at $30/mo. Worth $400 to introduce. He picks the host.',
  40000, 'one_time', strftime('%s','now') - (2*3600), 1, 1,
  'spawn_customer',
  '{"archetype":"pro","name":"Avery Tran","plan_tier":"business","starting_satisfaction":60}'
WHERE NOT EXISTS (
  SELECT 1 FROM marketplace_listings WHERE author_id = 'npc-aurora-data' AND title = 'Avery Tran — business-tier, RFC-quoting senior engineer'
);

INSERT INTO marketplace_listings
  (author_id, category, title, body, price_cents, price_unit, posted_at, is_npc, is_active, effect_type, effect_payload)
SELECT
  'npc-belvedere', 'leads', 'Jordan Smith — bargain-hunter, hobby-tier',
  'Jordan emails three hosts every renewal cycle asking for a discount. They will pay, eventually, on the cheap plan. They will also open a refund ticket once a quarter. We charged a flat $80 to get rid of them — your funeral.',
  8000, 'one_time', strftime('%s','now') - (30*3600), 1, 1,
  'spawn_customer',
  '{"archetype":"cheapskate","name":"Jordan Smith","plan_tier":"hobby","starting_satisfaction":45}'
WHERE NOT EXISTS (
  SELECT 1 FROM marketplace_listings WHERE author_id = 'npc-belvedere' AND title = 'Jordan Smith — bargain-hunter, hobby-tier'
);

INSERT INTO marketplace_listings
  (author_id, category, title, body, price_cents, price_unit, posted_at, is_npc, is_active, effect_type, effect_payload)
SELECT
  'npc-maelstrom', 'leads', 'Beth Park — $50 fire-sale, do not say we didn''t warn you',
  'Beth is a "Karen". She has filed three P1 tickets at us in two weeks. Hates her current host. Will hate her next host. We are charging $50 to make her someone else''s problem. Hobby tier, sat starts at 25, you have been warned.',
  5000, 'one_time', strftime('%s','now') - (1*3600), 1, 1,
  'spawn_customer',
  '{"archetype":"karen","name":"Beth Park","plan_tier":"hobby","starting_satisfaction":25}'
WHERE NOT EXISTS (
  SELECT 1 FROM marketplace_listings WHERE author_id = 'npc-maelstrom' AND title = 'Beth Park — $50 fire-sale, do not say we didn''t warn you'
);
