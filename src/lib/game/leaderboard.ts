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
