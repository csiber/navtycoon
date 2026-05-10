// POST /api/auth/logout — kijelentkeztet (cookie + PromNET sessions-row).
//
// A `navtycoon_session` cookie értéke = PromNET sessions.token, így
// ha kitöröljük a sort, a user PromNET-en is kijelentkezik (a `pn_session`
// cookie még él, de a session-token már nem létezik a sessions-ben).
//
// A POST-ot azért ragaszkodjuk, hogy CSRF ne kattintsa ki a usert.

import type { APIContext } from 'astro';
import {
  getPromnetDB, getSessionCookie, clearSessionCookie,
  deletePromnetSession,
} from '../../../lib/auth';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const token = getSessionCookie(context);
  if (token) {
    const pdb = getPromnetDB(context);
    if (pdb) {
      try { await deletePromnetSession(pdb, token); }
      catch (e) { console.warn('logout: deletePromnetSession hiba:', (e as Error).message); }
    }
  }
  clearSessionCookie(context);

  // A modern PRG-pattern szerint redirect a homepage-re.
  return new Response(
    JSON.stringify({ ok: true, redirect: '/' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    },
  );
}

// GET-fallback: ha böngésző direct GET-tel jön, kijelentkeztet és redirect.
export async function GET(context: APIContext): Promise<Response> {
  const token = getSessionCookie(context);
  if (token) {
    const pdb = getPromnetDB(context);
    if (pdb) {
      try { await deletePromnetSession(pdb, token); }
      catch { /* ignore */ }
    }
  }
  clearSessionCookie(context);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Cache-Control': 'no-store' },
  });
}
