// POST /api/marketplace/purchase/:id
// Atomically: mark listing sold, deduct player cash, insert customer.
// 2026-11-12 (csapat-utókör): a peering kategóriájú, enable_peering hatású hirdetés a peeringet kapcsolja be
// kedvezményes havidíjjal (purchasePeering lent; game/network.ts, marketplace/buy.ts).
// Spec: docs/superpowers/specs/2026-05-15-marketplace-leads-buy-design.md
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../../lib/auth';
import { getListing } from '../../../../lib/marketplace/db';
import { validateBuy, parseEffect, isPeeringListing, parsePeeringEffect, peeringBlock } from '../../../../lib/marketplace/buy';
import { getPlayer } from '../../../../lib/game/db';
import { ECONOMY } from '../../../../lib/game/economy';
import { loadNetwork, encodePeering } from '../../../../lib/game/network';
import { apiMsg, localeFromRequest } from '../../../../lib/i18n/api-errors';

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

  if (isPeeringListing(listing)) return purchasePeering(c, db, user.id, listing);

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

type Db = NonNullable<ReturnType<typeof getDB>>;
type Listing = NonNullable<Awaited<ReturnType<typeof getListing>>>;

/** Hibaválasz a játékos nyelvén is (message), a régi kliens kedvéért az error a kód marad. */
function perr(c: APIContext, s: number, code: string, msg?: string): Response {
  return new Response(JSON.stringify({ ok: false, error: code, message: msg ?? code }), {
    status: s, headers: { 'content-type': 'application/json' },
  });
}

async function purchasePeering(c: APIContext, db: Db, uid: string, listing: Listing): Promise<Response> {
  const NR = ECONOMY.network;
  const loc = localeFromRequest(c.request);
  if (!NR) return perr(c, 400, 'not_buyable');
  const effect = parsePeeringEffect(listing.effect_payload, NR.peering.monthly_cents);
  if (!effect) return perr(c, 500, 'bad_payload');
  if (listing.sold_at !== null) return perr(c, 409, 'sold');
  const player = await getPlayer(db, uid);
  if (!player) return perr(c, 403, 'no player record');
  // A tábla megléte (a 0013-as migráció előtt élesített kód ne dőljön el): érthető hiba.
  let ready = true;
  try { await db.prepare('SELECT 1 FROM player_network LIMIT 1').bind().all(); } catch { ready = false; }
  const net = ready ? await loadNetwork(db, uid) : { transit_tier: 0, peering: 0, ddos: 0 };
  const block = peeringBlock(listing.price_cents, {
    era: player.current_era, min_era: NR.min_era, ready, has_peering: !!net.peering,
    transit_tier: net.transit_tier, min_tier: NR.peering.min_tier, cash_cents: player.cash_usd_cents,
  });
  if (block === 'era_locked') return perr(c, 403, 'era_locked', apiMsg(loc, 'era_locked'));
  if (block === 'not_ready') return perr(c, 503, 'feature_not_ready', apiMsg(loc, 'feature_not_ready'));
  if (block === 'has_peering') return perr(c, 409, 'has_peering');
  if (block === 'needs_transit') return perr(c, 400, 'needs_transit');
  if (block === 'insufficient_cash') return perr(c, 402, 'insufficient_cash');

  const now = Math.floor(Date.now() / 1000);
  const price = listing.price_cents;
  const peerVal = encodePeering({ peering: 1, peering_monthly_cents: effect.monthly_cents });
  // D1 batch: 0 = elkel-kapu (sold_at IS NULL), 1 = pénz-kapu, 2 = a peering bekapcsolása (csak ha még nincs).
  const result = await db.batch([
    db.prepare('UPDATE marketplace_listings SET sold_at = ?, sold_to_player_id = ? WHERE id = ? AND sold_at IS NULL')
      .bind(now, uid, listing.id),
    db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ? AND cash_usd_cents >= ?')
      .bind(price, uid, price),
    db.prepare(
      'INSERT INTO player_network (player_id, transit_tier, peering, ddos, updated_at) VALUES (?, ?, ?, 0, ?) ' +
      'ON CONFLICT(player_id) DO UPDATE SET peering = excluded.peering, updated_at = excluded.updated_at WHERE player_network.peering = 0',
    ).bind(uid, net.transit_tier, peerVal, now),
  ]);
  const changes = (r: unknown): number => (r as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0;
  const sold = changes(result[0]) === 1;
  const paid = changes(result[1]) === 1;
  const on = changes(result[2]) === 1;
  if (sold && paid && on) {
    await db.prepare(
      'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
      "VALUES (?, 'network_changed', ?, ?, 'neutral', ?)",
    ).bind(uid, JSON.stringify({
      from: net, to: { ...net, peering: 1, peering_monthly_cents: effect.monthly_cents },
      cash_delta_cents: -price, via: 'marketplace', listing_id: listing.id,
    }), now, now).run();
    const post = await db.prepare('SELECT cash_usd_cents FROM players WHERE user_id = ? LIMIT 1')
      .bind(uid).first<{ cash_usd_cents: number }>();
    return new Response(JSON.stringify({
      ok: true, peering: true, monthly_cents: effect.monthly_cents,
      cash_remaining_cents: post?.cash_usd_cents ?? (player.cash_usd_cents - price),
    }), { headers: { 'content-type': 'application/json' } });
  }
  // Visszagörgetés: amit a batch már beírt, azt visszacsináljuk.
  const undo: ReturnType<typeof db.prepare>[] = [];
  if (sold) undo.push(db.prepare('UPDATE marketplace_listings SET sold_at = NULL, sold_to_player_id = NULL WHERE id = ?').bind(listing.id));
  if (paid) undo.push(db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?').bind(price, uid));
  if (on) undo.push(db.prepare('UPDATE player_network SET peering = 0, updated_at = ? WHERE player_id = ? AND peering = ?').bind(now, uid, peerVal));
  if (undo.length > 0) await db.batch(undo);
  if (!paid) return perr(c, 402, 'insufficient_cash');
  if (!on) return perr(c, 409, 'has_peering');
  return perr(c, 409, 'sold');
}
