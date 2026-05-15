// POST /api/marketplace/purchase/:id
// Atomically: mark listing sold, deduct player cash, insert customer.
// Spec: docs/superpowers/specs/2026-05-15-marketplace-leads-buy-design.md
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../../lib/auth';
import { getListing } from '../../../../lib/marketplace/db';
import { validateBuy, parseEffect } from '../../../../lib/marketplace/buy';

export const prerender = false;

function jerr(s: number, e: string): Response {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s, headers: { 'content-type': 'application/json' },
  });
}

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth required');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  const idParam = c.params.id ?? '';
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id) || id <= 0) return jerr(400, 'bad id');

  const listing = await getListing(db, id);
  if (!listing) return jerr(404, 'not found');

  const player = await db
    .prepare('SELECT cash_usd_cents FROM players WHERE user_id = ? LIMIT 1')
    .bind(user.id)
    .first<{ cash_usd_cents: number }>();
  if (!player) return jerr(403, 'no player record');

  const v = validateBuy(
    {
      id: listing.id,
      category: listing.category,
      effect_type: listing.effect_type,
      effect_payload: listing.effect_payload,
      price_cents: listing.price_cents,
      sold_at: listing.sold_at,
    },
    player.cash_usd_cents,
  );
  if (!v.ok) {
    const code = v.error === 'insufficient_cash' ? 402
      : v.error === 'sold' ? 409
      : v.error === 'not_buyable' ? 400
      : 500;
    return jerr(code, v.error);
  }

  const effect = parseEffect(listing.effect_payload);
  if (!effect) return jerr(500, 'bad_payload'); // already validated, defensive

  const now = Math.floor(Date.now() / 1000);

  // D1 batch — atomic per Cloudflare docs.
  // The `WHERE sold_at IS NULL` on the UPDATE is the race-safe gate:
  // a concurrent buyer's batch will affect 0 rows on that statement,
  // but the batch still commits. We re-read sold_at afterward to
  // detect the loss and refund/rollback by deletion.
  const result = await db.batch([
    db.prepare(
      'UPDATE marketplace_listings SET sold_at = ?, sold_to_player_id = ? ' +
      'WHERE id = ? AND sold_at IS NULL',
    ).bind(now, user.id, listing.id),
    db.prepare(
      'UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ?',
    ).bind(listing.price_cents, user.id),
    db.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction, is_active) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 1)',
    ).bind(user.id, effect.name, effect.archetype, effect.plan_tier, now, effect.starting_satisfaction),
  ]);

  // Race detection: first statement is the UPDATE on listing.
  // D1 returns meta.changes per statement. If 0, someone else bought it.
  // The local D1Like batch return type omits `meta` (it's part of the real
  // D1Result shape, see @cloudflare/workers-types), so we widen by cast.
  const meta0 = (result[0] as unknown as { meta?: { changes?: number } } | undefined)?.meta;
  if (!meta0 || meta0.changes !== 1) {
    // Loser of race — undo the cash deduction and the customer insert.
    // We know the customer's archetype + joined_at uniquely identifies
    // it within this transaction window for this player.
    await db.batch([
      db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?').bind(listing.price_cents, user.id),
      db.prepare('DELETE FROM customers WHERE player_id = ? AND name = ? AND joined_at = ?').bind(user.id, effect.name, now),
    ]);
    return jerr(409, 'sold');
  }

  // Fetch the new customer id for the client redirect/toast.
  const created = await db.prepare(
    'SELECT id FROM customers WHERE player_id = ? AND name = ? AND joined_at = ? ORDER BY id DESC LIMIT 1',
  ).bind(user.id, effect.name, now).first<{ id: number }>();

  return new Response(JSON.stringify({
    ok: true,
    customer_id: created?.id ?? null,
    customer_name: effect.name,
    cash_remaining_cents: player.cash_usd_cents - listing.price_cents,
  }), { headers: { 'content-type': 'application/json' } });
};
