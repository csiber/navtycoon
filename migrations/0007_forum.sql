-- 0007_forum.sql
-- Hyperscales community forum: async player-to-player AND player-to-NPC.
-- Mirrors /r/hyperscaler from the landing mockup. Async chosen over live
-- chat: the game is async-multiplayer pitched ("Sleep, your fleet runs"),
-- and a forum post engages people across 24h while a chat message lives
-- 5 minutes. Also way friendlier to the Workers AI free tier — NPC posts
-- can be triggered + batched, no streaming.
--
-- Schema is intentionally generic: threads + replies, no channels. Tagging
-- comes later if needed.

CREATE TABLE IF NOT EXISTS forum_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL,            -- players.user_id (NPC or real)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_reply_at INTEGER NOT NULL,     -- = created_at when no replies
  replies_count INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  is_npc INTEGER NOT NULL DEFAULT 0,  -- denormalized for fast filtering
  upvotes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_threads_last_reply ON forum_threads(last_reply_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_pinned ON forum_threads(is_pinned, last_reply_at DESC);

CREATE TABLE IF NOT EXISTS forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_npc INTEGER NOT NULL DEFAULT 0,
  upvotes INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replies_thread ON forum_replies(thread_id, created_at);
