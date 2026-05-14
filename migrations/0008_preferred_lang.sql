-- 0008_preferred_lang.sql
-- Persist the player's preferred UI language on the player record so the
-- dashboard can render in the right locale on first load without depending
-- on localStorage (which doesn't survive cache clears, private browsing,
-- or new-device first-visit).
--
-- Filled at signup-time from the form's ?lang=... URL param (which the
-- landing CTA forwards). User can change it later via /play/settings.

ALTER TABLE players ADD COLUMN preferred_lang TEXT NOT NULL DEFAULT 'en';
