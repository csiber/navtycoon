// POST /api/auth/signup — új Hyperscaler-fiók (cross-brand: PromNET users-be).
//
// Body: { email, password, company_name, city? }
// 1. Validáció (email, password ≥8, company_name ≥2)
// 2. Email-foglaltság check a PromNET users táblában
// 3. createPromnetUser → új sor PromNET users-ben (PBKDF2-SHA256 hash)
// 4. createPromnetSession → új sor PromNET sessions-ben
// 5. createPlayer (lokális navtycoon DB) → játékos rekord
// 6. setSessionCookie + return { ok, redirect: '/play' }
//
// Egyetlen tranzakcióban nincs (D1 nem támogat cross-DB tranzakciót), így
// best-effort: ha 5. lépés elhasal, a PromNET-user ÉS session megmarad.
// A user legközelebb a /play first-hit-en kap player-rekordot
// (promnet-callback hasonló logikát csinál).

import type { APIContext } from 'astro';
import {
  getDB, getPromnetDB,
  isEmailTaken, createPromnetUser, createPromnetSession,
  setSessionCookie,
  isValidEmail, passwordIssue, companyNameIssue,
} from '../../../lib/auth';
import { createPlayer, getPlayer } from '../../../lib/game/db';

export const prerender = false;

interface SignupBody {
  email?: string;
  password?: string;
  company_name?: string;
  city?: string | null;
}

export async function POST(context: APIContext): Promise<Response> {
  const pdb = getPromnetDB(context);
  if (!pdb) return jerr(500, 'PROMNET_DB nincs konfigurálva.');
  const db = getDB(context);
  if (!db) return jerr(500, 'DB nincs konfigurálva.');

  let body: SignupBody;
  try {
    body = await context.request.json() as SignupBody;
  } catch {
    return jerr(400, 'Érvénytelen JSON.');
  }

  const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const companyName = (typeof body.company_name === 'string' ? body.company_name : '').trim();
  const cityRaw = typeof body.city === 'string' ? body.city.trim() : '';
  const city = cityRaw.length > 0 ? cityRaw.slice(0, 80) : null;

  if (!isValidEmail(email)) return jerr(400, 'Érvénytelen email-cím.');
  const pwIssue = passwordIssue(password);
  if (pwIssue) return jerr(400, pwIssue);
  const cnIssue = companyNameIssue(companyName);
  if (cnIssue) return jerr(400, cnIssue);

  try {
    if (await isEmailTaken(pdb, email)) {
      return jerr(409, 'Ezzel az email-címmel már regisztráltak.');
    }

    // 1) PromNET user (display_name = company_name első verzióban)
    const user = await createPromnetUser(pdb, email, password, companyName);

    // 2) PromNET session
    const ip = context.request.headers.get('cf-connecting-ip') ?? undefined;
    const ua = context.request.headers.get('user-agent') ?? undefined;
    const token = await createPromnetSession(pdb, user.id, ip, ua);

    // 3) Hyperscaler player — best-effort (ha duplikátum, ne dobjunk hibát)
    try {
      const existing = await getPlayer(db, user.id);
      if (!existing) {
        await createPlayer(db, {
          user_id: user.id,
          company_name: companyName,
          city,
        });
      }
    } catch (e) {
      // A user létrejött; player később a /play first-hit-en pótlódhat
      console.warn('signup: createPlayer hiba (best-effort):', (e as Error).message);
    }

    // 4) Cookie + return
    setSessionCookie(context, token);
    return new Response(
      JSON.stringify({ ok: true, redirect: '/play' }),
      { status: 200, headers: { 'Content-Type': 'application/json',
                                'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    const msg = (e as Error).message ?? 'Ismeretlen hiba.';
    return jerr(500, `Regisztráció sikertelen: ${msg}`);
  }
}

function jerr(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
