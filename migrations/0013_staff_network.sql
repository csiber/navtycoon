-- 0013_staff_network.sql — Csapat és Hálózat (2026-11-12, csapat- és hálózat-kör).
-- Additív és visszafelé kompatibilis: csak új táblák. A kód a migráció ELŐTT is fut: ha a táblák még nincsenek,
-- a tick és a lapok üres csapattal és az ingyenes alap-hálózattal számolnak (staff.ts loadStaff, network.ts
-- loadNetwork), a felvétel és a hálózat-váltás pedig érthető hibát ad.
--
-- staff: a játékos munkatársai. A jelölteket nem tároljuk (naponta 3, a játékos azonosítójából és a napból
-- determinisztikusan: staff.ts generateCandidates). A szint a felvétel óta eltelt napokból jön (level_start +
-- tenure), így nem kell naponta írni; a hangulatot (morale) a tick félnaponta frissíti.
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  role TEXT NOT NULL,                       -- support | sre | sales
  name TEXT NOT NULL,
  trait TEXT NOT NULL,                      -- steady | fast_learner | frugal | perfectionist
  level_start INTEGER NOT NULL DEFAULT 1,
  base_salary_cents INTEGER NOT NULL,       -- 1. szintű havi bér (a jellemmel)
  raise_pct INTEGER NOT NULL DEFAULT 0,     -- csapatdrámában adott emelések
  morale INTEGER NOT NULL DEFAULT 70,
  four_day INTEGER NOT NULL DEFAULT 0,      -- négynapos hét (csapatdráma)
  hired_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staff_player ON staff(player_id);

-- player_network: játékosonként egy sor (ha nincs, az ingyenes alap: 0. csomag, peering és DDoS-védelem nélkül).
CREATE TABLE IF NOT EXISTS player_network (
  player_id TEXT PRIMARY KEY,
  transit_tier INTEGER NOT NULL DEFAULT 0,
  peering INTEGER NOT NULL DEFAULT 0,
  ddos INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(user_id) ON DELETE CASCADE
);
