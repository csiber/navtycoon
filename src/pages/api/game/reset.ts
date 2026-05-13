// POST /api/game/reset — törli az aktuális player save-et a navtycoon DB-ből.
// Megőrzi: PromNET user-rekordot + leaderboard-historyt (shift_history-ban
// marad). Törli: customers, tickets, servers, events, achievements,
// upgrades, players. Új /play hit-en a player.signup-bootstrap újra
// létrejön (kezdő 3 customer + 1 lamp_box + $1000 cash).

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const user = await getCurrentUser(context);
  if (!user) return jerr(401, 'Be kell jelentkezned.');
  const db = getDB(context);
  if (!db) return jerr(500, 'No DB');

  try {
    // Sorrend fontos a FOREIGN KEY-k miatt: tickets → customers, servers, events,
    // achievements, upgrades, llm_usage → players.
    await db.prepare('DELETE FROM tickets WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM customers WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM servers WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM events WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM achievements WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM upgrades WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM llm_usage WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM players WHERE user_id = ?').bind(user.id).run();
  } catch (e) {
    return jerr(500, 'Reset hiba: ' + (e as Error).message);
  }

  return new Response(
    JSON.stringify({ ok: true, redirect: '/play' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    },
  );
}

function jerr(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
