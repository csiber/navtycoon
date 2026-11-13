// src/lib/game/leaderboard.ts
// Hyperscales — ranglista-sorrend EGY helyen (2026-11-11). Korábban a táblázat MRR+pénz szerint rendezett,
// a saját helyezés viszont csak „MRR nagyobb" alapján számolódott, így az egyezőknél ellentmondott a
// táblázatnak („#23 a 6. és 7. között", „22 players above you" sor a 6. helyen). Most mindkettő ugyanabból
// a teljes rendezésből jön: MRR ↓, pénz ↓, hírnév ↓, majd user_id (determinisztikus).

export interface LbPlayer {
  user_id: string;
  company_name: string;
  mrr_usd_cents: number;
  cash_usd_cents: number;
  reputation: number;
  current_era: number;
  founded_at: number;
  /** 2026-11-13 (végjáték): ennyi nap alatt érte el a végcélt (null = még nem). Csak kijelzés, a sorrendet nem változtatja. */
  finished_days?: number | null;
}

/** A ranglista-lekérdezés: a játékosok + a befejezés napja (events.game_completed, migráció nélkül). */
export const LEADERBOARD_SQL =
  'SELECT p.user_id, p.company_name, p.mrr_usd_cents, p.cash_usd_cents, p.current_era, p.reputation, p.founded_at, ' +
  "(SELECT CAST(json_extract(e.data_json, '$.days') AS INTEGER) FROM events e WHERE e.player_id = p.user_id AND e.event_type = 'game_completed' ORDER BY e.id ASC LIMIT 1) AS finished_days " +
  'FROM players p LIMIT 5000';

/** A leggyorsabb befejezők (napok szerint növekvő, holtversenyben MRR szerint). */
export function fastestFinishers<T extends LbPlayer>(rows: T[], n = 5): T[] {
  return rows.filter((r) => r.finished_days != null)
    .sort((a, b) => (a.finished_days! - b.finished_days!) || (b.mrr_usd_cents - a.mrr_usd_cents))
    .slice(0, n);
}

export interface RankedPlayer extends LbPlayer { rank: number; is_npc: boolean; is_me: boolean }

export function isNpc(userId: string): boolean {
  return userId.startsWith('npc-');
}

export function compareLb(a: LbPlayer, b: LbPlayer): number {
  return (b.mrr_usd_cents - a.mrr_usd_cents)
    || (b.cash_usd_cents - a.cash_usd_cents)
    || (b.reputation - a.reputation)
    || (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0);
}

/** Teljes rangsor + a saját sor. A rangok 1-től folyamatosak, egyezés nincs (a rendezés teljes). */
export function rankPlayers(rows: LbPlayer[], myId: string): { ranked: RankedPlayer[]; me: RankedPlayer | null } {
  const ranked = [...rows].sort(compareLb).map((r, i) => ({ ...r, rank: i + 1, is_npc: isNpc(r.user_id), is_me: r.user_id === myId }));
  return { ranked, me: ranked.find((r) => r.is_me) ?? null };
}
