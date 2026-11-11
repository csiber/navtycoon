// POST /api/auth/delete — törli a felhasználói fiókot teljes egészében.
// Törli a játékállást, a fórum- és piactér-tartalmat és a fiókot (src/lib/auth/delete-account.ts), majd kijelentkeztet.

import type { APIContext } from 'astro';
import {
  getCurrentUser, getDB,
  getAuthDB, getSessionCookie, clearSessionCookie, deleteSession,
} from '../../../lib/auth';
import { localeFromRequest, jsonError } from '../../../lib/i18n/api-errors';
import { deleteAccountData, type DeleteDb } from '../../../lib/auth/delete-account';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const loc = localeFromRequest(context.request);
  const user = await getCurrentUser(context);
  if (!user) return jsonError(401, loc, 'unauthorized');
  const db = getDB(context);
  if (!db) return jsonError(500, loc, 'db_missing');

  try {
    await deleteAccountData(db as unknown as DeleteDb, user.id);
  } catch (e) {
    console.error('delete-account failed', e);
    return jsonError(500, loc, 'internal');
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

