// POST /api/admin/seed-npcs — idempotent seeder for the 10 NPC competitors.
//
// Same admin-gate as force-tick: email '+admin' subaddress OR hardcoded
// owner. Re-running is safe (uses INSERT OR IGNORE on user_id).
//
// Returns { ok, inserted, total } so we can verify the population is
// healthy from the dashboard or a script.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { NPC_CHARACTERS } from '../../../lib/game/npc-characters';

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

  const now = Math.floor(Date.now() / 1000);
  let inserted = 0;

  for (const npc of NPC_CHARACTERS) {
    const res = await db
      .prepare(
        'INSERT OR IGNORE INTO players (' +
          'user_id, company_name, city, founded_at, current_era, reputation, ' +
          'cash_usd_cents, mrr_usd_cents, last_active_at, created_at, ' +
          'is_npc, npc_archetype, npc_persona_bio, npc_last_decision_at' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)',
      )
      .bind(
        npc.user_id,
        npc.company_name,
        npc.city,
        now,
        npc.initial_era,
        npc.initial_reputation,
        npc.initial_cash_cents,
        npc.initial_mrr_cents,
        now,
        now,
        npc.archetype,
        npc.persona_bio,
      )
      .run();
    // D1 .run() returns { meta: { changes } } — count real inserts
    const changes = (res as { meta?: { changes?: number } }).meta?.changes ?? 0;
    if (changes > 0) inserted++;
  }

  const totalRow = await db
    .prepare('SELECT COUNT(*) AS n FROM players WHERE is_npc = 1')
    .first<{ n: number }>();

  return new Response(
    JSON.stringify({
      ok: true,
      inserted,
      total_npcs: totalRow?.n ?? 0,
      characters: NPC_CHARACTERS.map((c) => ({
        user_id: c.user_id,
        company_name: c.company_name,
        archetype: c.archetype,
      })),
    }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } },
  );
};
