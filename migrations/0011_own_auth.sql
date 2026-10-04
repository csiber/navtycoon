-- Hyperscales saját belépés (2026-10-05): eddig a PromNET users/sessions tábláit használta (PROMNET_DB binding).
-- A legacy_accounts a PromNET-korszak játékosainak e-mail → user_id párja (jelszó nélkül): ugyanazzal az
-- e-mail-címmel regisztrálva a régi user_id-t, és vele a játékállást kapják vissza.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS legacy_accounts (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
);
