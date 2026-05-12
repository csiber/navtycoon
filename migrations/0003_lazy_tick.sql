-- migrations/0003_lazy_tick.sql
-- Hyperscaler — lazy-tick gating column.
--
-- Workaround a free-tier CF cron-cap-hez (5/5 trigger): a Worker-szintű
-- 5-percenkénti tick nem regisztrálható, ezért a /play dashboard load-ja
-- triggereli a per-player tick-et. A `last_ticked_at` mező biztosítja, hogy
-- ne ticktelünk gyakrabban mint LAZY_TICK_MIN_INTERVAL (5 perc).

ALTER TABLE players ADD COLUMN last_ticked_at INTEGER NOT NULL DEFAULT 0;
