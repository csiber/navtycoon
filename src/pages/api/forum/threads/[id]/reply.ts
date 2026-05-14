// POST /api/forum/threads/[id]/reply
//   - auth required
//   - moderated body
//   - bumps thread.last_reply_at + replies_count

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../../../lib/auth';
import { createReply, getThread } from '../../../../../lib/forum/db';
import { moderate } from '../../../../../lib/forum/moderation';

export const prerender = false;

function jerr(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth required');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  const threadId = parseInt(c.params.id ?? '0', 10);
  if (!threadId) return jerr(400, 'bad thread id');

  const thread = await getThread(db, threadId);
  if (!thread) return jerr(404, 'thread not found');
  if (thread.is_locked === 1) return jerr(403, 'thread locked');

  let body: { body?: string };
  try {
    body = await c.request.json() as { body?: string };
  } catch {
    return jerr(400, 'bad JSON');
  }
  const text = (body.body ?? '').trim();
  const mod = moderate(text);
  if (!mod.ok) return jerr(400, mod.reason ?? 'moderated');

  const { id } = await createReply(db, threadId, user.id, text, false);
  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'content-type': 'application/json' },
  });
};
