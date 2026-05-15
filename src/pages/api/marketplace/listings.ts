// GET /api/marketplace/listings
//   - public read, paginated
//   - ?category=peering|hardware|service|leads (optional)
// POST /api/marketplace/listings
//   - auth required, moderated body, 8000-char cap

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { listListings, createListing, type ListingCategory, type PriceUnit } from '../../../lib/marketplace/db';
import { moderate } from '../../../lib/forum/moderation';

export const prerender = false;

const CATEGORIES: readonly ListingCategory[] = ['peering', 'hardware', 'service', 'leads'] as const;
const PRICE_UNITS: readonly PriceUnit[] = ['one_time', 'monthly', 'per_gb'] as const;

function jerr(s: number, e: string): Response {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

export const GET = async (c: APIContext): Promise<Response> => {
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');
  const url = new URL(c.request.url);
  const catRaw = url.searchParams.get('category');
  const category = catRaw && (CATEGORIES as readonly string[]).includes(catRaw)
    ? (catRaw as ListingCategory)
    : undefined;
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
  const listings = await listListings(db, { category, limit, offset });
  return new Response(JSON.stringify({ ok: true, listings }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
};

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth required');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  let body: {
    category?: string;
    title?: string;
    body?: string;
    price_cents?: number;
    price_unit?: string;
  };
  try {
    body = await c.request.json() as typeof body;
  } catch {
    return jerr(400, 'bad JSON');
  }
  const category = body.category;
  const title = (body.title ?? '').trim();
  const text = (body.body ?? '').trim();
  const priceCents = Math.max(0, Math.min(99999999, Math.round(Number(body.price_cents ?? 0))));
  const priceUnit = body.price_unit ?? 'one_time';

  if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
    return jerr(400, 'Érvénytelen kategória.');
  }
  if (!(PRICE_UNITS as readonly string[]).includes(priceUnit)) {
    return jerr(400, 'Érvénytelen árképzés.');
  }
  if (title.length < 4) return jerr(400, 'A cím legalább 4 karakter.');
  if (title.length > 140) return jerr(400, 'A cím max 140 karakter.');
  const tm = moderate(title);
  if (!tm.ok) return jerr(400, tm.reason ?? 'moderated');
  const bm = moderate(text);
  if (!bm.ok) return jerr(400, bm.reason ?? 'moderated');

  // Player must exist
  const player = await db
    .prepare('SELECT user_id FROM players WHERE user_id = ?')
    .bind(user.id)
    .first();
  if (!player) return jerr(403, 'no player record');

  const { id } = await createListing(
    db, user.id,
    category as ListingCategory,
    title, text, priceCents,
    priceUnit as PriceUnit,
    false,
  );
  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'content-type': 'application/json' },
  });
};
