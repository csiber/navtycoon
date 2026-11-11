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
import { NO_PASSWORD } from '../../../lib/aikahub';
import { localeFromRequest, jsonError, type ApiLocale } from '../../../lib/i18n/api-errors';

export const prerender = false;

interface LoginBody {
  email?: string;
  password?: string;
  lang?: string;
}

export async function POST(context: APIContext): Promise<Response> {
  // A hibaüzenetek a kérés nyelvén mennek vissza (body.lang → hs_lang süti → Accept-Language).
  let loc: ApiLocale = localeFromRequest(context.request);
  const pdb = getAuthDB(context);
  if (!pdb) return jsonError(500, loc, 'db_missing');

  let body: LoginBody;
  try {
    body = await context.request.json() as LoginBody;
  } catch {
    return jsonError(400, loc, 'invalid_json');
  }
  loc = localeFromRequest(context.request, body.lang);

  const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) return jsonError(400, loc, 'email_password_required');
  if (!isValidEmail(email)) return jsonError(400, loc, 'invalid_email');

  try {
    const u = await pdb.prepare(
      'SELECT id, email, password_hash, password_salt, display_name ' +
      'FROM users WHERE email = ? LIMIT 1',
    ).bind(email).first<{
      id: string; email: string;
      password_hash: string; password_salt: string;
      display_name: string | null;
    }>();
    if (!u) return jsonError(401, loc, 'bad_credentials');
    // AikaHub-fiókos usernek nincs jelszava ('!'), csak a „Belépés AikaHub-fiókkal" gombbal léphet be.
    if (u.password_hash === NO_PASSWORD) return jsonError(401, loc, 'bad_credentials');

    const ok = await verifyPassword(password, u.password_hash, u.password_salt);
    if (!ok) return jsonError(401, loc, 'bad_credentials');

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
    // A belső hibaszöveg csak a logba megy, a kliens általános üzenetet kap.
    console.error('login failed', e);
    return jsonError(500, loc, 'login_failed');
  }
}
