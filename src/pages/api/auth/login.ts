// POST /api/auth/login — email/password login (navtycoon-only fiókok).
//
// Body: { email, password }
// 1. Validáció (email-formátum + password jelenlét)
// 2. Lookup a users táblában
// 3. verifyPassword (PBKDF2-SHA256 100k iter)
// 4. createSession → új sor a sessions táblában
// 5. setSessionCookie + return { ok, redirect: '/play' }
//

import type { APIContext } from 'astro';
import {
  getAuthDB, createSession, setSessionCookie,
  verifyPassword, isValidEmail,
} from '../../../lib/auth';

export const prerender = false;

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(context: APIContext): Promise<Response> {
  const pdb = getAuthDB(context);
  if (!pdb) return jerr(500, 'DB nincs konfigurálva.');

  let body: LoginBody;
  try {
    body = await context.request.json() as LoginBody;
  } catch {
    return jerr(400, 'Érvénytelen JSON.');
  }

  const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) return jerr(400, 'Email és jelszó kötelező.');
  if (!isValidEmail(email)) return jerr(400, 'Érvénytelen email-cím.');

  try {
    const u = await pdb.prepare(
      'SELECT id, email, password_hash, password_salt, display_name ' +
      'FROM users WHERE email = ? LIMIT 1',
    ).bind(email).first<{
      id: string; email: string;
      password_hash: string; password_salt: string;
      display_name: string | null;
    }>();
    if (!u) return jerr(401, 'Hibás email vagy jelszó.');

    const ok = await verifyPassword(password, u.password_hash, u.password_salt);
    if (!ok) return jerr(401, 'Hibás email vagy jelszó.');

    const ip = context.request.headers.get('cf-connecting-ip') ?? undefined;
    const ua = context.request.headers.get('user-agent') ?? undefined;
    const token = await createSession(pdb, u.id, ip, ua);

    setSessionCookie(context, token);
    return new Response(
      JSON.stringify({ ok: true, redirect: '/play' }),
      { status: 200, headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
      } },
    );
  } catch (e) {
    const msg = (e as Error).message ?? 'Ismeretlen hiba.';
    return jerr(500, `Bejelentkezés sikertelen: ${msg}`);
  }
}

function jerr(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
