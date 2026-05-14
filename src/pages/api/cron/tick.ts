// POST /api/cron/tick — cron-only tick endpoint.
//
// A Cloudflare Pages/Workers cron-trigger (vagy bármilyen ütemező) hívja, és
// `tickAllActivePlayers`-szel végigfut az aktív játékosokon.
//
// Auth: `x-cron-secret` header MUST egyezzen az env.CRON_SECRET értékkel.
// Hibás / hiányzó titok → 403.
//
// AI bindings (env.AI + env.VECTORIZE) opcionálisak — ha jelen vannak,
// a tick LLM-generált ticket-eket írhat (LLM-cap-pal védve).
//
// Válasz: JSON { ok, players_ticked, totals: { tickets, ai_tickets,
// placeholder_tickets, money_cents, churned, events } }

import type { APIContext } from 'astro';
import { getDB } from '../../../lib/auth';
import { tickAllActivePlayers } from '../../../lib/game/tick';
import { tickAllNpcs } from '../../../lib/game/npc-tick';
import type { WorkersAIBinding } from '../../../lib/ai/workers-ai';
import type { VectorizeBinding } from '../../../lib/ai/vectorize';

export const prerender = false;

export const POST = async (c: APIContext): Promise<Response> => {
  const secret = c.request.headers.get('x-cron-secret');
  const env = c.locals.runtime?.env as {
    CRON_SECRET?: string;
    AI?: WorkersAIBinding;
    VECTORIZE?: VectorizeBinding;
  } | undefined;
  if (!env?.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const db = getDB(c);
  if (!db) return new Response('no DB', { status: 500 });

  const now = Math.floor(Date.now() / 1000);
  const results = await tickAllActivePlayers(db, now, {
    ai: env.AI,
    vectorize: env.VECTORIZE,
  });
  // Run NPC competitors on the same tick. Independent of LLM bindings —
  // archetype-driven, no AI call. Errors here must NOT fail the real
  // player tick, so it's wrapped.
  let npcResult = { npcs_examined: 0, npcs_decided: 0, actions: {} as Record<string, number> };
  try {
    npcResult = await tickAllNpcs(db, now);
  } catch (e) {
    console.error('tickAllNpcs failed', e);
  }

  const totals = results.reduce(
    (acc, r) => ({
      tickets: acc.tickets + r.tickets_spawned,
      ai_tickets: acc.ai_tickets + r.ai_tickets,
      placeholder_tickets: acc.placeholder_tickets + r.placeholder_tickets,
      money_cents: acc.money_cents + r.money_added_cents,
      churned: acc.churned + r.churned,
      events: acc.events + r.events_spawned,
    }),
    { tickets: 0, ai_tickets: 0, placeholder_tickets: 0, money_cents: 0, churned: 0, events: 0 },
  );

  return new Response(
    JSON.stringify({ ok: true, players_ticked: results.length, totals, npcs: npcResult }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } },
  );
};
