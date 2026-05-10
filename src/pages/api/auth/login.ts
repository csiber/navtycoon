// POST /api/auth/login — email/password login (navtycoon-only fiókok).
//
// Body: { email, password }
// 1. Validáció (email-formátum + password jelenlét)
// 2. Lookup PromNET users táblában (cross-brand store)
// 3. verifyPassword (PBKDF2-SHA256 100k iter, BIT-egyező a PromNET-tel)
// 4. createPromnetSession → új sor PromNET sessions-ben
// 5. setSessionCookie + return { ok, redirect: '/play' }
//
// Megjegyzés: SSO-only login is elérhető a /api/auth/promnet-bridge-en
// keresztül (PromNET-account → handoff-token → navtycoon_session).
// Ez az endpoint a navtycoon-only signup-pal regisztrált usereknek kell.

import type { APIContext } from 'astro';
import {
  getPromnetDB, createPromnetSession, setSessionCookie,
  verifyPassword, isValidEmail,
} from '../../../lib/auth';

export const prerender = false;

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(context: APIContext): Promise<Response> {
  const pdb = getPromnetDB(context);
  if (!pdb) return jerr(500, 'PROMNET_DB nincs konfigurálva.');

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
    const token = await createPromnetSession(pdb, u.id, ip, ua);

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
