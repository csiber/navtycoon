// POST /api/auth/logout — kijelentkeztet (cookie + a sessions-sor törlése).
//
// A POST-ot azért ragaszkodjuk, hogy CSRF ne kattintsa ki a usert.

import type { APIContext } from 'astro';
import {
  getAuthDB, getSessionCookie, clearSessionCookie,
  deleteSession,
} from '../../../lib/auth';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const token = getSessionCookie(context);
  if (token) {
    const pdb = getAuthDB(context);
    if (pdb) {
      try { await deleteSession(pdb, token); }
      catch (e) { console.warn('logout: deleteSession hiba:', (e as Error).message); }
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
    const pdb = getAuthDB(context);
    if (pdb) {
      try { await deleteSession(pdb, token); }
      catch { /* ignore */ }
    }
  }
  clearSessionCookie(context);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Cache-Control': 'no-store' },
  });
}
