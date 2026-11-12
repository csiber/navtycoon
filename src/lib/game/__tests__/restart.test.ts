// „Vállalat újraindítása" (restart.ts): nulláról induló cég, megmaradó fiók-adatok, nincs keret-kiskapu.
import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapStarterPlayer } from '../bootstrap';
import { restartCompany, RESTART_WIPED_TABLES } from '../restart';
import { getPlayer, type D1Like } from '../db';
import { createTestDb } from '../../../../test-utils/d1-mock';

async function count(d: D1Like, table: string, userId: string): Promise<number> {
  const r = await d.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`).bind(userId).first<{ n: number }>();
  return r?.n ?? 0;
}

describe('restartCompany', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });

  it('starts the company from scratch but keeps name, language, Pro, today\'s shift and AI quota', async () => {
    await bootstrapStarterPlayer(d, { user_id: 'u-1', company_name: 'Rókalyuk Hosting', city: 'Pécs', lang: 'hu' });
    const today = Math.floor(Date.now() / 1000 / 86400) * 86400;
    await d.prepare(
      'UPDATE players SET cash_usd_cents = -5000, mrr_usd_cents = 0, reputation = 3, current_era = 2, is_pro = 1, ' +
      'pro_until = 1999999999, free_shifts_today = 1, last_shift_reset_at = ?, onboarding_completed_at = 123 WHERE user_id = ?',
    ).bind(today, 'u-1').run();
    await d.prepare("INSERT INTO servers (player_id, era, type, capacity, monthly_cost_cents, purchased_at) VALUES ('u-1', 1, 'lamp_box', 30, 500, 1)").run();
    await d.prepare("INSERT INTO upgrades (player_id, upgrade_id, purchased_at) VALUES ('u-1', 'ram_bump', 1)").run();
    await d.prepare("INSERT INTO events (player_id, event_type, spawned_at) VALUES ('u-1', 'dmca', 1)").run();
    await d.prepare("INSERT INTO llm_usage (player_id, day, call_count) VALUES ('u-1', '2026-11-12', 40)").run();
    await d.prepare("INSERT INTO shift_history (player_id, started_at, tickets_handled) VALUES ('u-1', 1, 7)").run();

    const r = await restartCompany(d, 'u-1');
    expect(r.ok).toBe(true);
    const p = (await getPlayer(d, 'u-1')) as unknown as Record<string, unknown>;
    // nulláról
    expect(p.cash_usd_cents).toBe(100000);
    expect(p.mrr_usd_cents).toBe(1500);
    expect(p.reputation).toBe(50);
    expect(p.current_era).toBe(1);
    expect(await count(d, 'servers', 'u-1')).toBe(1);
    expect(await count(d, 'customers', 'u-1')).toBe(3);
    expect(await count(d, 'upgrades', 'u-1')).toBe(0);
    expect(await count(d, 'events', 'u-1')).toBe(0);
    // megmarad
    expect(p.company_name).toBe('Rókalyuk Hosting');
    expect(p.city).toBe('Pécs');
    expect(p.preferred_lang).toBe('hu');
    expect(p.is_pro).toBe(1);
    expect(p.pro_until).toBe(1999999999);
    expect(p.onboarding_completed_at).toBe(123);
    // nincs kiskapu: a mai műszak elhasználva marad, az AI-keret számlálója is
    expect(p.free_shifts_today).toBe(1);
    expect(p.last_shift_reset_at).toBe(today);
    expect(await count(d, 'llm_usage', 'u-1')).toBe(1);
    expect(await count(d, 'shift_history', 'u-1')).toBe(1);
  });

  it('touches only the caller\'s rows', async () => {
    await bootstrapStarterPlayer(d, { user_id: 'u-1', company_name: 'A', city: null });
    await bootstrapStarterPlayer(d, { user_id: 'u-2', company_name: 'B', city: null });
    await d.prepare('UPDATE players SET cash_usd_cents = 4242 WHERE user_id = ?').bind('u-2').run();
    await restartCompany(d, 'u-1');
    expect((await getPlayer(d, 'u-2'))?.cash_usd_cents).toBe(4242);
    for (const t of RESTART_WIPED_TABLES.filter((x) => x === 'customers' || x === 'servers' || x === 'tickets')) {
      expect(await count(d, t, 'u-2')).toBeGreaterThan(0);
    }
  });

  it('refuses NPC companies and reports a missing player', async () => {
    await bootstrapStarterPlayer(d, { user_id: 'npc-x', company_name: 'NPC', city: null });
    await d.prepare('UPDATE players SET is_npc = 1 WHERE user_id = ?').bind('npc-x').run();
    expect(await restartCompany(d, 'npc-x')).toEqual({ ok: false, error: 'npc' });
    expect(await restartCompany(d, 'nobody')).toEqual({ ok: false, error: 'no_player' });
  });
});
