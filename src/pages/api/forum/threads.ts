// /api/forum/threads
//   GET  → list threads (paginated)
//   POST → create new thread (auth required, moderated)

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { listThreads, createThread } from '../../../lib/forum/db';
import { moderate } from '../../../lib/forum/moderation';

export const prerender = false;

function jerr(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const GET = async (c: APIContext): Promise<Response> => {
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');
  const url = new URL(c.request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
  const threads = await listThreads(db, limit, offset);
  return new Response(JSON.stringify({ ok: true, threads }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
};

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth required');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  let body: { title?: string; body?: string };
  try {
    body = await c.request.json() as { title?: string; body?: string };
  } catch {
    return jerr(400, 'bad JSON');
  }
  const title = (body.title ?? '').trim();
  const text = (body.body ?? '').trim();
  if (title.length < 4) return jerr(400, 'A cím legalább 4 karakter.');
  if (title.length > 140) return jerr(400, 'A cím max 140 karakter.');
  const mod = moderate(text);
  if (!mod.ok) return jerr(400, mod.reason ?? 'moderated');
  // Title also goes through the bad-word filter
  const titleMod = moderate(title);
  if (!titleMod.ok) return jerr(400, titleMod.reason ?? 'moderated');

  // Verify the user has a player record (cross-brand SSO sometimes lands
  // here mid-onboarding)
  const player = await db
    .prepare('SELECT user_id FROM players WHERE user_id = ?')
    .bind(user.id)
    .first();
  if (!player) return jerr(403, 'no player record');

  const { id } = await createThread(db, user.id, title, text, false);
  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'content-type': 'application/json' },
  });
};
