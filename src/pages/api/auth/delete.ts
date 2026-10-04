// POST /api/auth/delete — törli a felhasználói fiókot teljes egészében.
// Törli a játékállást (player + customers + tickets + events + servers + achievements + upgrades + llm_usage),
// a fiókot (users, sessions, legacy_accounts — 2026-10-05 óta saját táblák), majd kijelentkeztet.

import type { APIContext } from 'astro';
import {
  getCurrentUser, getDB,
  getAuthDB, getSessionCookie, clearSessionCookie, deleteSession,
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
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM legacy_accounts WHERE user_id = ?').bind(user.id).run();
    await db.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  } catch (e) {
    return jerr(500, 'Account-delete hiba: ' + (e as Error).message);
  }

  // A cookie-hoz tartozó session (ha a fenti törlés előtt keletkezett volna).
  const token = getSessionCookie(context);
  if (token) {
    const pdb = getAuthDB(context);
    if (pdb) {
      try { await deleteSession(pdb, token); }
      catch (e) { console.warn('delete-account: deleteSession hiba:', (e as Error).message); }
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
