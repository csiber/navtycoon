// POST /api/admin/force-tick — admin-only manual cron-tick trigger.
//
// Dev-tooling: amikor a tényleges cron-handler nem fut (pl. 5/5 trigger-limit,
// debug-szituáció), egy admin manuálisan elindíthatja a tickelést az összes
// aktív játékosra. UI: dashboard widget /play oldalon, csak admin-emailek
// számára.
//
// Admin-gate: email '+admin' subaddress (pl. claude+admin@promnet.hu) VAGY
// hardcoded owner (csiberius@gmail.com). Bármilyen más user → 403.
//
// Egyébként ugyanaz a logika, mint /api/cron/tick — `tickAllActivePlayers`-t
// hívja az AI + Vectorize bindingokkal.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { tickAllActivePlayers } from '../../../lib/game/tick';
import { tickAllNpcs } from '../../../lib/game/npc-tick';
import type { WorkersAIBinding } from '../../../lib/ai/workers-ai';
import type { VectorizeBinding } from '../../../lib/ai/vectorize';

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

  const env = c.locals.runtime?.env as {
    AI?: WorkersAIBinding;
    VECTORIZE?: VectorizeBinding;
  } | undefined;

  const now = Math.floor(Date.now() / 1000);
  const results = await tickAllActivePlayers(db, now, {
    ai: env?.AI,
    vectorize: env?.VECTORIZE,
  });
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
