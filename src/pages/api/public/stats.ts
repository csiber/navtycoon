// GET /api/public/stats — no-auth public stats for landing-page social-proof.
// Returns: { players, total_mrr_cents, customers_total, tickets_resolved, top_run }
//
// Cache-Control: public, max-age=60 — refresh ≤1min, fine for an aggregate snapshot.
// Returns 500 with shape-stable JSON if DB binding is missing (so the landing
// page's fetch always parses cleanly).

import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/auth';

export const prerender = false;

const ZERO = {
  players: 0,
  total_mrr_cents: 0,
  customers_total: 0,
  tickets_resolved: 0,
  top_run: null as null | { company_name: string; day: number; user_id: string },
};

export const GET: APIRoute = async (ctx) => {
  const db = getDB(ctx);
  const headers = {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=60',
  };
  if (!db) {
    return new Response(JSON.stringify(ZERO), { status: 200, headers });
  }
  try {
    const playersRow = await db.prepare(
      'SELECT COUNT(*) AS n FROM players',
    ).first<{ n: number }>();
    const mrrRow = await db.prepare(
      'SELECT COALESCE(SUM(mrr_usd_cents), 0) AS s FROM players',
    ).first<{ s: number }>();
    const custRow = await db.prepare(
      'SELECT COUNT(*) AS n FROM customers WHERE is_active = 1',
    ).first<{ n: number }>();
    const resolvedRow = await db.prepare(
      "SELECT COUNT(*) AS n FROM tickets WHERE status = 'resolved'",
    ).first<{ n: number }>();
    const topRow = await db.prepare(
      'SELECT user_id, company_name, founded_at FROM players ORDER BY mrr_usd_cents DESC, cash_usd_cents DESC LIMIT 1',
    ).first<{ user_id: string; company_name: string; founded_at: number }>();
    const top_run = topRow ? {
      company_name: topRow.company_name,
      day: Math.max(1, Math.floor((Date.now() / 1000 - topRow.founded_at) / 86400) + 1),
      user_id: topRow.user_id,
    } : null;
    return new Response(JSON.stringify({
      players: playersRow?.n ?? 0,
      total_mrr_cents: mrrRow?.s ?? 0,
      customers_total: custRow?.n ?? 0,
      tickets_resolved: resolvedRow?.n ?? 0,
      top_run,
    }), { status: 200, headers });
  } catch (e) {
    console.error('public-stats error', e);
    return new Response(JSON.stringify(ZERO), { status: 200, headers });
  }
};
