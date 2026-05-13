// POST /api/auth/delete — törli a felhasználói fiókot teljes egészében.
// Törli a navtycoon DB rekordjait + PromNET sessions-rowt, majd
// kijelentkezteti és redirect-eli a homepage-re.
//
// FIGYELEM: a PromNET users-tábla rekordját NEM töröljük itt — az a
// PromNET-oldali profil. Ez csak a hyperscaler-saját state-et törli
// (player + customers + tickets + events + servers + achievements
// + upgrades + llm_usage), és kijelentkezteti a usert.

import type { APIContext } from 'astro';
import {
  getCurrentUser, getDB,
  getPromnetDB, getSessionCookie, clearSessionCookie, deletePromnetSession,
} from '../../../lib/auth';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const user = await getCurrentUser(context);
  if (!user) return jerr(401, 'Be kell jelentkezned.');
  const db = getDB(context);
  if (!db) return jerr(500, 'No DB');

  try {
    await db.prepare('DELETE FROM tickets WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM customers WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM servers WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM events WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM achievements WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM upgrades WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM llm_usage WHERE player_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM players WHERE user_id = ?').bind(user.id).run();
  } catch (e) {
    return jerr(500, 'Account-delete hiba: ' + (e as Error).message);
  }

  // PromNET session-row törlés (közös sessions-tábla).
  const token = getSessionCookie(context);
  if (token) {
    const pdb = getPromnetDB(context);
    if (pdb) {
      try { await deletePromnetSession(pdb, token); }
      catch (e) { console.warn('delete-account: deletePromnetSession hiba:', (e as Error).message); }
    }
  }
  clearSessionCookie(context);

  return new Response(
    JSON.stringify({ ok: true, redirect: '/' }),
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
