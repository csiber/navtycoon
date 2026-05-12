-- migrations/0004_onboarding.sql
-- Hyperscaler — first-time-player onboarding flag.
--
-- A /play dashboard egy 4-5 slide-os welcome modal-t mutat az új játékosoknak.
-- A modal-t a felhasználó zárja be (Let's go gomb → POST /api/game/onboarding-complete).
-- NULL = még nem látta a modal-t, INTEGER = unix-ts amikor lezárta.

ALTER TABLE players ADD COLUMN onboarding_completed_at INTEGER DEFAULT NULL;
