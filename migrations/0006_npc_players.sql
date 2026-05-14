-- 0006_npc_players.sql
-- Population trick: 10 LLM-flavoured NPC competitor companies are stored
-- alongside real players in the same `players` table, so leaderboard
-- queries, MRR-trend charts and acquisition logic all work without an
-- if/else branch for NPCs. They are distinguished only by `is_npc = 1`.
--
-- NPC tick is rule-based with random variance per archetype (no LLM call
-- on the hot path) — `last_decision_at` rate-limits decisions to ~once
-- per game-day so they don't sprint past real players.

ALTER TABLE players ADD COLUMN is_npc INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN npc_archetype TEXT;
ALTER TABLE players ADD COLUMN npc_persona_bio TEXT;
ALTER TABLE players ADD COLUMN npc_last_decision_at INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_players_npc ON players(is_npc);
