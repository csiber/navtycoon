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
  // - Statement 0 (listing UPDATE) is the sold-once gate: WHERE sold_at IS NULL.
  // - Statement 1 (cash UPDATE) is the funds gate: WHERE cash_usd_cents >= price.
  // - Statement 2 (INSERT customer) uses RETURNING so we get the new id back
  //   for the rollback path; without it we can't safely target the customer
  //   in case of an over-matching name+joined_at race.
  const result = await db.batch([
    db.prepare(
      'UPDATE marketplace_listings SET sold_at = ?, sold_to_player_id = ? ' +
      'WHERE id = ? AND sold_at IS NULL',
    ).bind(now, user.id, listing.id),
    db.prepare(
      'UPDATE players SET cash_usd_cents = cash_usd_cents - ? ' +
      'WHERE user_id = ? AND cash_usd_cents >= ?',
    ).bind(listing.price_cents, user.id, listing.price_cents),
    db.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction, is_active) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 1) RETURNING id',
    ).bind(user.id, effect.name, effect.archetype, effect.plan_tier, now, effect.starting_satisfaction),
  ]);

  // D1's `meta.changes` lives outside the local D1Like typing — cast to read it.
  function changesOf(r: unknown): number {
    return (r as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0;
  }
  // RETURNING id surfaces in result[2].results[0].id; cast to read it.
  function returnedId(r: unknown): number | null {
    const row = (r as { results?: Array<{ id?: number }> } | undefined)?.results?.[0];
    return typeof row?.id === 'number' ? row.id : null;
  }

  const listingSold = changesOf(result[0]) === 1;
  const cashDeducted = changesOf(result[1]) === 1;
  const insertedCustomerId = returnedId(result[2]);

  // Happy path — both gates passed.
  if (listingSold && cashDeducted) {
    const post = await db
      .prepare('SELECT cash_usd_cents FROM players WHERE user_id = ? LIMIT 1')
      .bind(user.id)
      .first<{ cash_usd_cents: number }>();
    return new Response(JSON.stringify({
      ok: true,
      customer_id: insertedCustomerId,
      customer_name: effect.name,
      cash_remaining_cents: post?.cash_usd_cents ?? (player.cash_usd_cents - listing.price_cents),
    }), { headers: { 'content-type': 'application/json' } });
  }

  // Rollback path — at least one gate failed. Undo whatever the batch did
  // commit so the world is consistent.
  const rollbackStmts: ReturnType<typeof db.prepare>[] = [];
  if (listingSold) {
    rollbackStmts.push(
      db.prepare('UPDATE marketplace_listings SET sold_at = NULL, sold_to_player_id = NULL WHERE id = ?').bind(listing.id),
    );
  }
  if (cashDeducted) {
    rollbackStmts.push(
      db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?').bind(listing.price_cents, user.id),
    );
  }
  if (insertedCustomerId !== null) {
    rollbackStmts.push(
      db.prepare('DELETE FROM customers WHERE id = ?').bind(insertedCustomerId),
    );
  }
  if (rollbackStmts.length > 0) {
    await db.batch(rollbackStmts);
  }

  // Surface the most specific failure: cash race takes precedence over sold
  // race for the user-facing error, since the player can re-try after a
  // shift cleared a refund vs they can't un-sell a listing.
  if (!cashDeducted) return jerr(402, 'insufficient_cash');
  return jerr(409, 'sold');
};
