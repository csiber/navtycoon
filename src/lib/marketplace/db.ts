// src/lib/marketplace/db.ts
// Thin D1 helpers for the marketplace listings board. Joins author from
// the shared players table — same pattern as forum/db.ts so NPC archetype
// tags + real-player branding land in the UI for free.

import type { D1Database } from '@cloudflare/workers-types/experimental';

export type ListingCategory = 'peering' | 'hardware' | 'service' | 'leads';
export type PriceUnit = 'one_time' | 'monthly' | 'per_gb';

export interface MarketplaceListing {
  id: number;
  author_id: string;
  author_name: string;
  author_city: string | null;
  is_npc: number;
  npc_archetype: string | null;
  category: ListingCategory;
  title: string;
  body: string;
  price_cents: number;
  price_unit: PriceUnit;
  posted_at: number;
  is_active: number;
}

export async function listListings(
  db: D1Database,
  opts: { category?: ListingCategory; limit?: number; offset?: number } = {},
): Promise<MarketplaceListing[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  let sql =
    'SELECT m.*, p.company_name AS author_name, p.city AS author_city, p.npc_archetype ' +
    'FROM marketplace_listings m ' +
    'LEFT JOIN players p ON p.user_id = m.author_id ' +
    'WHERE m.is_active = 1';
  const binds: (string | number)[] = [];
  if (opts.category) {
    sql += ' AND m.category = ?';
    binds.push(opts.category);
  }
  sql += ' ORDER BY m.posted_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);
  const res = await db.prepare(sql).bind(...binds).all<MarketplaceListing>();
  return res.results ?? [];
}

export async function createListing(
  db: D1Database,
  authorId: string,
  category: ListingCategory,
  title: string,
  body: string,
  priceCents: number,
  priceUnit: PriceUnit,
  isNpc = false,
): Promise<{ id: number }> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .prepare(
      'INSERT INTO marketplace_listings (author_id, category, title, body, ' +
      'price_cents, price_unit, posted_at, is_npc) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    )
    .bind(authorId, category, title, body, priceCents, priceUnit, now, isNpc ? 1 : 0)
    .first<{ id: number }>();
  return { id: res?.id ?? 0 };
}
