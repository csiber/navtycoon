import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapStarterPlayer, ensurePlayer } from '../bootstrap';
import { getPlayer, type D1Like } from '../db';
import { createTestDb } from '../../../../test-utils/d1-mock';

async function count(d: D1Like, table: string, userId: string): Promise<number> {
  const r = await d.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`).bind(userId).first<{ n: number }>();
  return r?.n ?? 0;
}

describe('bootstrapStarterPlayer', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });

  it('creates the starter kit: 1 free server, 3 customers with an open ticket each, $15 MRR, language', async () => {
    const p = await bootstrapStarterPlayer(d, { user_id: 'u-1', company_name: 'Acme Hosting', city: 'Pécs', lang: 'hu' });
    expect(p.company_name).toBe('Acme Hosting');
    expect(p.mrr_usd_cents).toBe(1500);
    expect((p as unknown as { preferred_lang: string }).preferred_lang).toBe('hu');
    expect(await count(d, 'servers', 'u-1')).toBe(1);
    expect(await count(d, 'customers', 'u-1')).toBe(3);
    const open = await d.prepare("SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status = 'open'").bind('u-1').first<{ n: number }>();
    expect(open?.n).toBe(3);
    const srv = await d.prepare('SELECT monthly_cost_cents FROM servers WHERE player_id = ?').bind('u-1').first<{ monthly_cost_cents: number }>();
    expect(srv?.monthly_cost_cents).toBe(0);
  });
});

describe('ensurePlayer (reset-save redirect-loop regression)', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });

  it('returns the existing player untouched', async () => {
    await bootstrapStarterPlayer(d, { user_id: 'u-1', company_name: 'Acme', city: null });
    await d.prepare('UPDATE players SET cash_usd_cents = 4242 WHERE user_id = ?').bind('u-1').run();
    const p = await ensurePlayer(d, { id: 'u-1', display_name: 'Other', email: 'a@b.hu' });
    expect(p.cash_usd_cents).toBe(4242);
    expect(await count(d, 'customers', 'u-1')).toBe(3);
  });

  it('recreates a fresh company after the save was reset (players row deleted)', async () => {
    await bootstrapStarterPlayer(d, { user_id: 'u-1', company_name: 'Acme', city: null });
    for (const t of ['tickets', 'customers', 'servers']) {
      await d.prepare(`DELETE FROM ${t} WHERE player_id = ?`).bind('u-1').run();
    }
    await d.prepare('DELETE FROM players WHERE user_id = ?').bind('u-1').run();
    expect(await getPlayer(d, 'u-1')).toBeNull();

    const p = await ensurePlayer(d, { id: 'u-1', display_name: 'Acme Reborn', email: 'a@b.hu' });
    expect(p.company_name).toBe('Acme Reborn');
    expect(p.cash_usd_cents).toBe(100000);
    expect(await count(d, 'customers', 'u-1')).toBe(3);
  });

  it('an AikaHub nickname that breaks the company-name rules falls back to the default (leaderboard is public)', async () => {
    expect((await ensurePlayer(d, { id: 'u-3', display_name: 'AWS', email: 'x@aikahub.invalid' })).company_name).toBe('My Hosting Co.');
    expect((await ensurePlayer(d, { id: 'u-4', display_name: 'x'.repeat(81), email: 'x@aikahub.invalid' })).company_name).toBe('My Hosting Co.');
    expect((await ensurePlayer(d, { id: 'u-5', display_name: 'R', email: 'x@aikahub.invalid' })).company_name).toBe('My Hosting Co.');
    expect((await ensurePlayer(d, { id: 'u-6', display_name: 'Rókafül', email: 'x@aikahub.invalid' })).company_name).toBe('Rókafül');
  });

  it('falls back to a default company name when display_name is missing', async () => {
    const p = await ensurePlayer(d, { id: 'u-2', display_name: null, email: 'a@b.hu' });
    expect(p.company_name).toBe('My Hosting Co.');
  });
});
