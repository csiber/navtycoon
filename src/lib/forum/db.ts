// src/lib/forum/db.ts
// Thin D1 helpers for the community forum. Joins author info from the
// shared players table so we don't duplicate names/cities/personas.

import type { D1Database } from '@cloudflare/workers-types/experimental';

export interface ThreadListRow {
  id: number;
  author_id: string;
  author_name: string;
  author_city: string | null;
  is_npc: number;
  npc_archetype: string | null;
  title: string;
  body: string;
  created_at: number;
  last_reply_at: number;
  replies_count: number;
  is_pinned: number;
  is_locked: number;
  upvotes: number;
}

export interface ReplyRow {
  id: number;
  thread_id: number;
  author_id: string;
  author_name: string;
  is_npc: number;
  npc_archetype: string | null;
  body: string;
  created_at: number;
  upvotes: number;
}

export async function listThreads(
  db: D1Database,
  limit = 50,
  offset = 0,
): Promise<ThreadListRow[]> {
  const res = await db
    .prepare(
      'SELECT t.*, p.company_name AS author_name, p.city AS author_city, ' +
      '  p.npc_archetype AS npc_archetype ' +
      'FROM forum_threads t ' +
      'LEFT JOIN players p ON p.user_id = t.author_id ' +
      'ORDER BY t.is_pinned DESC, t.last_reply_at DESC ' +
      'LIMIT ? OFFSET ?',
    )
    .bind(limit, offset)
    .all<ThreadListRow>();
  return res.results ?? [];
}

export async function getThread(
  db: D1Database,
  id: number,
): Promise<ThreadListRow | null> {
  const res = await db
    .prepare(
      'SELECT t.*, p.company_name AS author_name, p.city AS author_city, ' +
      '  p.npc_archetype AS npc_archetype ' +
      'FROM forum_threads t ' +
      'LEFT JOIN players p ON p.user_id = t.author_id ' +
      'WHERE t.id = ? LIMIT 1',
    )
    .bind(id)
    .first<ThreadListRow>();
  return res ?? null;
}

export async function listReplies(
  db: D1Database,
  threadId: number,
): Promise<ReplyRow[]> {
  const res = await db
    .prepare(
      'SELECT r.*, p.company_name AS author_name, ' +
      '  p.npc_archetype AS npc_archetype ' +
      'FROM forum_replies r ' +
      'LEFT JOIN players p ON p.user_id = r.author_id ' +
      'WHERE r.thread_id = ? ' +
      'ORDER BY r.created_at ASC',
    )
    .bind(threadId)
    .all<ReplyRow>();
  return res.results ?? [];
}

export async function createThread(
  db: D1Database,
  authorId: string,
  title: string,
  body: string,
  isNpc = false,
): Promise<{ id: number }> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .prepare(
      'INSERT INTO forum_threads (author_id, title, body, created_at, last_reply_at, is_npc) ' +
      'VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    )
    .bind(authorId, title, body, now, now, isNpc ? 1 : 0)
    .first<{ id: number }>();
  return { id: res?.id ?? 0 };
}

export async function createReply(
  db: D1Database,
  threadId: number,
  authorId: string,
  body: string,
  isNpc = false,
): Promise<{ id: number }> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .prepare(
      'INSERT INTO forum_replies (thread_id, author_id, body, created_at, is_npc) ' +
      'VALUES (?, ?, ?, ?, ?) RETURNING id',
    )
    .bind(threadId, authorId, body, now, isNpc ? 1 : 0)
    .first<{ id: number }>();
  // Bump the thread's last_reply_at + replies_count
  await db
    .prepare(
      'UPDATE forum_threads SET last_reply_at = ?, replies_count = replies_count + 1 WHERE id = ?',
    )
    .bind(now, threadId)
    .run();
  return { id: res?.id ?? 0 };
}
