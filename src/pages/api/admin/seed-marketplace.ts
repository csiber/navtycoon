// POST /api/admin/seed-marketplace — one-shot idempotent seeder for the
// 13 NPC marketplace listings. Same admin-gate as seed-forum / seed-npcs.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { MARKETPLACE_SEEDS } from '../../../lib/marketplace/npc-seeds';

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
  let inserted = 0;

  for (const seed of MARKETPLACE_SEEDS) {
    const existing = await db
      .prepare('SELECT id FROM marketplace_listings WHERE author_id = ? AND title = ? LIMIT 1')
      .bind(seed.author_id, seed.title)
      .first<{ id: number }>();
    if (existing) continue;
    const postedAt = now - seed.hours_ago * 3600;
    await db
      .prepare(
        'INSERT INTO marketplace_listings (author_id, category, title, body, ' +
        'price_cents, price_unit, posted_at, is_npc) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      )
      .bind(seed.author_id, seed.category, seed.title, seed.body, seed.price_cents, seed.price_unit, postedAt)
      .run();
    inserted++;
  }

  const totalRow = await db
    .prepare('SELECT COUNT(*) AS n FROM marketplace_listings WHERE is_active = 1')
    .first<{ n: number }>();

  return new Response(
    JSON.stringify({ ok: true, inserted, total_active: totalRow?.n ?? 0 }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } },
  );
};
