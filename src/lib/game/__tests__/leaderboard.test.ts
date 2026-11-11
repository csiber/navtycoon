// Hyperscales — ranglista: a saját helyezés és a táblázat ugyanabból a rendezésből jön.
import { describe, it, expect } from 'vitest';
import { rankPlayers, isNpc, type LbPlayer } from '../leaderboard';

const p = (user_id: string, mrr: number, cash = 0, rep = 50): LbPlayer => ({
  user_id, company_name: user_id, mrr_usd_cents: mrr, cash_usd_cents: cash, reputation: rep, current_era: 1, founded_at: 0,
});

describe('rankPlayers', () => {
  it('ranks by MRR, then cash, then reputation, then id — consecutive ranks', () => {
    const { ranked } = rankPlayers([p('a', 100), p('b', 500), p('c', 100, 900), p('d', 100, 900, 70)], 'a');
    expect(ranked.map((r) => r.user_id)).toEqual(['b', 'd', 'c', 'a']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it('my rank equals my row position even with MRR ties (old bug: COUNT(mrr >) + 1)', () => {
    const rows = [p('npc-1', 1500, 5000), p('npc-2', 1500, 100), p('me', 1500, 99900), p('npc-3', 9000)];
    const { ranked, me } = rankPlayers(rows, 'me');
    expect(me?.rank).toBe(2);
    expect(ranked[me!.rank - 1].user_id).toBe('me');
  });
  it('marks NPCs', () => {
    expect(isNpc('npc-belvedere')).toBe(true);
    expect(isNpc('u_123')).toBe(false);
    expect(rankPlayers([p('npc-x', 1)], 'u').ranked[0].is_npc).toBe(true);
  });
  it('me is null when not in the list', () => {
    expect(rankPlayers([p('a', 1)], 'zzz').me).toBeNull();
  });
});
