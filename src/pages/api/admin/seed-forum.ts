// POST /api/admin/seed-forum — one-shot idempotent forum seeder.
//
// Inserts the 5 NPC threads + their replies, skipping any that already
// exist (matched by author_id + title). Same admin-gate as seed-npcs.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { NPC_SEED_THREADS } from '../../../lib/forum/npc-seeds';

export const prerender = false;

function jerr(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isAdmin(email: string): boolean {
  return email.includes('+admin') || email === 'csiberius@gmail.com';
}

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  if (!isAdmin(user.email)) return jerr(403, 'admin only');

  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  const now = Math.floor(Date.now() / 1000);
  // Stagger seed-thread creation across the last 36 hours so the forum
  // feels organic from the first page-load (not all-at-once timestamps).
  let baseAt = now - 36 * 3600;

  let threadsInserted = 0;
  let repliesInserted = 0;

  for (const seed of NPC_SEED_THREADS) {
    const existing = await db
      .prepare('SELECT id FROM forum_threads WHERE author_id = ? AND title = ? LIMIT 1')
      .bind(seed.author_id, seed.title)
      .first<{ id: number }>();
    let threadId: number;
    if (existing) {
      threadId = existing.id;
    } else {
      const lastReply = seed.replies.length > 0
        ? baseAt + seed.replies[seed.replies.length - 1].minutes_after_thread * 60
        : baseAt;
      const inserted = await db
        .prepare(
          'INSERT INTO forum_threads (author_id, title, body, created_at, last_reply_at, replies_count, is_npc) ' +
          'VALUES (?, ?, ?, ?, ?, ?, 1) RETURNING id',
        )
        .bind(seed.author_id, seed.title, seed.body, baseAt, lastReply, seed.replies.length)
        .first<{ id: number }>();
      threadId = inserted?.id ?? 0;
      threadsInserted++;
    }

    for (const reply of seed.replies) {
      const replyAt = baseAt + reply.minutes_after_thread * 60;
      const existingReply = await db
        .prepare(
          'SELECT id FROM forum_replies WHERE thread_id = ? AND author_id = ? AND created_at = ? LIMIT 1',
        )
        .bind(threadId, reply.author_id, replyAt)
        .first();
      if (!existingReply) {
        await db
          .prepare(
            'INSERT INTO forum_replies (thread_id, author_id, body, created_at, is_npc) ' +
            'VALUES (?, ?, ?, ?, 1)',
          )
          .bind(threadId, reply.author_id, reply.body, replyAt)
          .run();
        repliesInserted++;
      }
    }

    // Space threads out so older seeds appear older
    baseAt += 4 * 3600;
  }

  return new Response(
    JSON.stringify({ ok: true, threads_inserted: threadsInserted, replies_inserted: repliesInserted }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } },
  );
};
