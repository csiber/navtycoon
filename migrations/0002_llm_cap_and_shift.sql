-- migrations/0002_llm_cap_and_shift.sql
-- Plan 2: LLM-usage daily counter + shift_history

CREATE TABLE IF NOT EXISTS llm_usage (
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,
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
  outcome TEXT,
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shift_history_player ON shift_history(player_id, started_at DESC);
