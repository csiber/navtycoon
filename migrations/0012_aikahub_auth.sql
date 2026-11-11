-- AikaHub-belépés (OAuth 2.0 + PKCE, 2026-11-11). Spec: navtycoon-terv/aikahub-oauth-spec.md.
--
-- account_links: külső fiók → users.id. Kulcs a (provider, sub): az AikaHub `sub` kliensenként (pairwise) stabil,
-- a becenév változhat, ezért az csak megjelenítésre van itt. Egy usernek providerenként legfeljebb egy kötése lehet.
-- Tokent NEM tárolunk: a profilt csak belépéskor olvassuk, utána a frissítő tokent azonnal visszavonjuk.
CREATE TABLE IF NOT EXISTS account_links (
  provider TEXT NOT NULL,
  sub TEXT NOT NULL,
  user_id TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  PRIMARY KEY (provider, sub)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_links_user ON account_links(provider, user_id);

-- oauth_pending: a folyamatban lévő belépések (state → PKCE-verifier), 10 percig. Egyszer használható: a callback törli.
-- A state egy httpOnly sütiben is ott van, a callback a kettőt összeveti (login-CSRF ellen).
-- link_user_id: ha belépett (e-mailes) user a Beállításokból köti hozzá az AikaHub-fiókját.
CREATE TABLE IF NOT EXISTS oauth_pending (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  link_user_id TEXT,
  next_path TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_pending_expires ON oauth_pending(expires_at);
