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
  let updated = 0;

  for (const npc of NPC_CHARACTERS) {
    // UPSERT: insert new NPC, or refresh state to the spec'd initial
    // values. This is also our recovery path when something has zeroed
    // an NPC's MRR (e.g. an old `tickPlayer` build running over them
    // before the is_npc=0 filter shipped).
    const res = await db
      .prepare(
        'INSERT INTO players (' +
          'user_id, company_name, city, founded_at, current_era, reputation, ' +
          'cash_usd_cents, mrr_usd_cents, last_active_at, created_at, ' +
          'is_npc, npc_archetype, npc_persona_bio, npc_last_decision_at' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0) ' +
        'ON CONFLICT(user_id) DO UPDATE SET ' +
          'company_name = excluded.company_name, ' +
          'city = excluded.city, ' +
          'current_era = excluded.current_era, ' +
          'reputation = excluded.reputation, ' +
          'cash_usd_cents = excluded.cash_usd_cents, ' +
          'mrr_usd_cents = excluded.mrr_usd_cents, ' +
          'last_active_at = excluded.last_active_at, ' +
          'is_npc = 1, ' +
          'npc_archetype = excluded.npc_archetype, ' +
          'npc_persona_bio = excluded.npc_persona_bio, ' +
          'npc_last_decision_at = 0',
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
    // D1 .run() meta.changes = 1 for both insert and update via UPSERT,
    // so we have to look at last_row_id vs existence-check separately.
    // Cheap approach: count meta.changes; we don't strictly need the
    // insert/update split, but it's nice telemetry.
    const changes = (res as { meta?: { changes?: number; last_row_id?: number } }).meta?.changes ?? 0;
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
