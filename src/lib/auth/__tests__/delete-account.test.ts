import { describe, it, expect } from 'vitest';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, type D1Like } from '../../game/db';
import { deleteAccountData, type DeleteDb } from '../delete-account';

describe('deleteAccountData', () => {
  it('removes forum, marketplace, shift history and game rows of the user only', async () => {
    const db = await createTestDb();
    const now = 1_800_000_000;
    const q = (sql: string, ...a: unknown[]) => db.prepare(sql).bind(...a).run();
    for (const u of ['me', 'other']) {
      await createPlayer(db as unknown as D1Like, { user_id: u, company_name: 'X', city: null });
      await q("INSERT INTO marketplace_listings (author_id, category, title, body, posted_at) VALUES (?, 'hardware', 't', 'b', ?)", u, now);
      await q("INSERT INTO shift_history (player_id, started_at, ended_at, tickets_handled, satisfaction_total, refunds_given_cents, outcome) VALUES (?, ?, ?, 1, 5, 0, 'completed')", u, now, now);
    }
    // other's thread with replies from both; my own thread with a reply from other
    await q("INSERT INTO forum_threads (id, author_id, title, body, created_at, last_reply_at, replies_count) VALUES (1, 'other', 't', 'b', ?, ?, 2)", now, now + 20);
    await q("INSERT INTO forum_replies (thread_id, author_id, body, created_at) VALUES (1, 'other', 'r', ?)", now + 10);
    await q("INSERT INTO forum_replies (thread_id, author_id, body, created_at) VALUES (1, 'me', 'r', ?)", now + 20);
    await q("INSERT INTO forum_threads (id, author_id, title, body, created_at, last_reply_at, replies_count) VALUES (2, 'me', 't', 'b', ?, ?, 1)", now, now);
    await q("INSERT INTO forum_replies (thread_id, author_id, body, created_at) VALUES (2, 'other', 'r', ?)", now + 5);

    await deleteAccountData(db as unknown as DeleteDb, 'me');

    const n = async (sql: string, ...a: unknown[]) => (await db.prepare(sql).bind(...a).first<{ n: number }>())?.n;
    expect(await n("SELECT COUNT(*) AS n FROM marketplace_listings WHERE author_id = 'me'")).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM marketplace_listings WHERE author_id = 'other'")).toBe(1);
    expect(await n("SELECT COUNT(*) AS n FROM shift_history WHERE player_id = 'me'")).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM shift_history WHERE player_id = 'other'")).toBe(1);
    expect(await n("SELECT COUNT(*) AS n FROM forum_threads WHERE id = 2")).toBe(0);
    expect(await n('SELECT COUNT(*) AS n FROM forum_replies WHERE thread_id = 2')).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM forum_replies WHERE author_id = 'me'")).toBe(0);
    const t1 = await db.prepare('SELECT replies_count, last_reply_at FROM forum_threads WHERE id = 1').first<{ replies_count: number; last_reply_at: number }>();
    expect(t1).toEqual({ replies_count: 1, last_reply_at: now + 10 });
    expect(await n("SELECT COUNT(*) AS n FROM players WHERE user_id = 'me'")).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM players WHERE user_id = 'other'")).toBe(1);
  });
});
