// POST /api/cron/tick — cron-only tick endpoint.
//
// A Cloudflare Pages/Workers cron-trigger (vagy bármilyen ütemező) hívja, és
// `tickAllActivePlayers`-szel végigfut az aktív játékosokon.
//
// Auth: `x-cron-secret` header MUST egyezzen az env.CRON_SECRET értékkel.
// Hibás / hiányzó titok → 403.
//
// Válasz: JSON { ok, players_ticked, totals: { tickets, money_cents, churned, events } }

import type { APIContext } from 'astro';
import { getDB } from '../../../lib/auth';
import { tickAllActivePlayers } from '../../../lib/game/tick';

export const prerender = false;

export const POST = async (c: APIContext): Promise<Response> => {
  const secret = c.request.headers.get('x-cron-secret');
  const env = c.locals.runtime?.env as { CRON_SECRET?: string } | undefined;
  if (!env?.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const db = getDB(c);
  if (!db) return new Response('no DB', { status: 500 });

  const now = Math.floor(Date.now() / 1000);
  const results = await tickAllActivePlayers(db, now);

  const totals = results.reduce(
    (acc, r) => ({
      tickets: acc.tickets + r.tickets_spawned,
      money_cents: acc.money_cents + r.money_added_cents,
      churned: acc.churned + r.churned,
      events: acc.events + r.events_spawned,
    }),
    { tickets: 0, money_cents: 0, churned: 0, events: 0 },
  );

  return new Response(
    JSON.stringify({ ok: true, players_ticked: results.length, totals }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } },
  );
};
