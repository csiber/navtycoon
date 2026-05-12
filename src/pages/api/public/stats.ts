// GET /api/public/stats — no-auth public stats for landing-page social-proof.
// Returns: { players, total_mrr_cents, customers_total, tickets_resolved, top_run }
//
// Cache-Control: public, max-age=60 — refresh ≤1min, fine for an aggregate snapshot.
// Returns 500 with shape-stable JSON if DB binding is missing (so the landing
// page's fetch always parses cleanly).

import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/auth';

export const prerender = false;

interface ActivityItem {
  kind: 'customer_joined' | 'ticket_resolved';
  who: string;
  msg: string;
  time_ago_sec: number;
}
const ZERO = {
  players: 0,
  total_mrr_cents: 0,
  customers_total: 0,
  tickets_resolved: 0,
  top_run: null as null | { company_name: string; day: number; user_id: string },
  recent_activity: [] as ActivityItem[],
};

// Anonymize: take first 8 chars + ellipsis OR initial+random tag.
function maskName(name: string): string {
  const first = (name || '?').trim()[0]?.toUpperCase() || '?';
  return first + '·' + Math.abs(name.length * 37 % 1000).toString(36);
}

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

    // Recent activity (last 20 events, anonymized): newest customer joins
    // + ticket resolutions, merged + sorted desc.
    const now = Math.floor(Date.now() / 1000);
    interface JoinRow { name: string; joined_at: number }
    interface ResolveRow { customer_name: string | null; resolved_at: number }
    const joins = (await db.prepare(
      'SELECT name, joined_at FROM customers ORDER BY joined_at DESC LIMIT 10',
    ).all<JoinRow>()).results ?? [];
    const resolves = (await db.prepare(
      'SELECT c.name AS customer_name, t.resolved_at AS resolved_at ' +
      'FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id ' +
      "WHERE t.status = 'resolved' AND t.resolved_at IS NOT NULL " +
      'ORDER BY t.resolved_at DESC LIMIT 10',
    ).all<ResolveRow>()).results ?? [];
    const activity: ActivityItem[] = [
      ...joins.map((j): ActivityItem => ({
        kind: 'customer_joined',
        who: maskName(j.name),
        msg: 'new customer signed up',
        time_ago_sec: Math.max(0, now - j.joined_at),
      })),
      ...resolves.map((r): ActivityItem => ({
        kind: 'ticket_resolved',
        who: maskName(r.customer_name ?? '?'),
        msg: 'ticket resolved',
        time_ago_sec: Math.max(0, now - r.resolved_at),
      })),
    ];
    activity.sort((a, b) => a.time_ago_sec - b.time_ago_sec);
    const recent_activity = activity.slice(0, 12);

    return new Response(JSON.stringify({
      players: playersRow?.n ?? 0,
      total_mrr_cents: mrrRow?.s ?? 0,
      customers_total: custRow?.n ?? 0,
      tickets_resolved: resolvedRow?.n ?? 0,
      top_run,
      recent_activity,
    }), { status: 200, headers });
  } catch (e) {
    console.error('public-stats error', e);
    return new Response(JSON.stringify(ZERO), { status: 200, headers });
  }
};
