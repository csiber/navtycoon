-- 0005_shift_daily_reset.sql
-- Adds last_shift_reset_at to track per-day shift-counter rollover.
-- Without this, free_shifts_today / paid_shifts_today accumulate forever,
-- and players are capped at the day-1 quota.
--
-- Reset rule: tick (or dashboard-load) checks `last_shift_reset_at` against
-- todayUtcStart = floor(now/86400)*86400; if lastReset < todayUtcStart, both
-- counters reset to 0 and last_shift_reset_at = todayUtcStart.

ALTER TABLE players ADD COLUMN last_shift_reset_at INTEGER NOT NULL DEFAULT 0;
