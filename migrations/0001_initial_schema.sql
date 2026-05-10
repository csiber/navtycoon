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
