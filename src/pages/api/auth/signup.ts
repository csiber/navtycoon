// POST /api/auth/signup — új Hyperscales-fiók (saját users tábla, 2026-10-05 óta független a PromNET-től).
//
// Body: { email, password, company_name, city? }
// 1. Validáció (email, password ≥8, company_name ≥2)
// 2. Email-foglaltság check a users táblában
// 3. createUser — mindig új user_id (a legacy_accounts-visszakötés 2026-11-11 óta csak kézi, lásd lent)
// 4. createSession
// 5. createPlayer, ha még nincs játékos-rekord
// 6. setSessionCookie + return { ok, redirect: '/play' }
import type { APIContext } from 'astro';
import {
  getDB, getAuthDB,
  isEmailTaken, createUser, createSession,
  setSessionCookie,
  isValidEmail, passwordIssue, companyNameIssue,
} from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';
import { bootstrapStarterPlayer } from '../../../lib/game/bootstrap';
import { checkHostingNameBlacklist } from '../../../lib/auth/hosting-blacklist';
import { computeAchievementInput } from '../../../lib/game/achievements-helper';
import { checkAndUnlockAchievements } from '../../../lib/game/achievements';
import type { D1Database } from '@cloudflare/workers-types/experimental';

export const prerender = false;

interface SignupBody {
  email?: string;
  password?: string;
  company_name?: string;
  city?: string | null;
  lang?: string;
}

export async function POST(context: APIContext): Promise<Response> {
  const pdb = getAuthDB(context);
  if (!pdb) return jerr(500, 'DB nincs konfigurálva.');
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
  const langRaw = typeof body.lang === 'string' ? body.lang.toLowerCase() : '';
  const preferredLang = (['en', 'hu', 'de'].includes(langRaw) ? langRaw : 'en') as 'en' | 'hu' | 'de';

  if (!isValidEmail(email)) return jerr(400, 'Érvénytelen email-cím.');
  const pwIssue = passwordIssue(password);
  if (pwIssue) return jerr(400, pwIssue);
  const cnIssue = companyNameIssue(companyName);
  if (cnIssue) return jerr(400, cnIssue);
  const blackcheck = checkHostingNameBlacklist(companyName);
  if (blackcheck.blocked) return jerr(400, blackcheck.reason!);

  try {
    if (await isEmailTaken(pdb, email)) {
      return jerr(409, 'Ezzel az email-címmel már regisztráltak.');
    }

    // 1) User (display_name = company_name). A PromNET-korszak régi játékállását (legacy_accounts) NEM
    // kötjük vissza automatikusan: e-mail-ellenőrzés nélkül bárki megszerezhetné más régi fiókját csak azzal,
    // hogy az ő e-mail-címével regisztrál (2026-11-11). Visszakötés csak kézzel, igazolt kérésre.
    const user = await createUser(pdb, email, password, companyName);

    // 2) Session
    const ip = context.request.headers.get('cf-connecting-ip') ?? undefined;
    const ua = context.request.headers.get('user-agent') ?? undefined;
    const token = await createSession(pdb, user.id, ip, ua);

    // 3) Hyperscales player + starter-bootstrap — best-effort.
    // Ha a player már létezik (pl. callback-bridge előbb futott), nem
    // bootstrappelünk újra; csak first-time signup-on rakjuk ki a kezdő
    // szervert / customer-eket / ticketeket.
    try {
      const existing = await getPlayer(db, user.id);
      if (!existing) {
        await bootstrapStarterPlayer(db, { user_id: user.id, company_name: companyName, city, lang: preferredLang });
      }
    } catch (e) {
      // A user létrejött; a kezdőállást a /play első betöltése pótolja (ensurePlayer).
      console.warn('signup: createPlayer/bootstrap hiba (best-effort):', (e as Error).message);
    }

    // Achievement-unlock check (best-effort, non-fatal): new signup with 3 customers
    // bootstrapped above will trigger `first_blood` here.
    let newly_unlocked: string[] = [];
    try {
      const input = await computeAchievementInput(db as unknown as D1Database, user.id);
      if (input) {
        newly_unlocked = await checkAndUnlockAchievements(
          db as unknown as D1Database, user.id, input,
        );
      }
    } catch { /* non-fatal */ }

    // 4) Cookie + return
    setSessionCookie(context, token);
    return new Response(
      JSON.stringify({ ok: true, redirect: '/play', newly_unlocked }),
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
