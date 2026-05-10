// GET /api/game/state — state-snapshot a dashboard / client-side polling-hoz.
// Per-user szigetelt (player_id = user.id). 401 ha nincs auth, 404 ha nincs player.
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';

export const prerender = false;

function jerr(s: number, e: string): Response {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');
  const player = await getPlayer(db, user.id);
  if (!player) return jerr(404, 'no player');

  const customerCount = (await db.prepare(
    'SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1',
  ).bind(user.id).first<{ n: number }>())?.n ?? 0;
  const serverCount = (await db.prepare(
    'SELECT COUNT(*) AS n FROM servers WHERE player_id = ?',
  ).bind(user.id).first<{ n: number }>())?.n ?? 0;
  const openTickets = (await db.prepare(
    `SELECT COUNT(*) AS n FROM tickets WHERE player_id = ? AND status IN ('open', 'in_progress')`,
  ).bind(user.id).first<{ n: number }>())?.n ?? 0;

  return new Response(JSON.stringify({
    ok: true,
    player,
    counts: { customers: customerCount, servers: serverCount, openTickets },
  }), { headers: { 'content-type': 'application/json' } });
};
