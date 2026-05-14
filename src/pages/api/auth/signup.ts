// POST /api/auth/signup — új Hyperscales-fiók (cross-brand: PromNET users-be).
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
import { spawnCustomer } from '../../../lib/game/customer-spawn';
import { checkHostingNameBlacklist } from '../../../lib/auth/hosting-blacklist';
import { SERVER_SPECS } from '../../../lib/game/server-types';
import { computeAchievementInput } from '../../../lib/game/achievements-helper';
import { checkAndUnlockAchievements } from '../../../lib/game/achievements';
import type { D1Database } from '@cloudflare/workers-types/experimental';

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
  const blackcheck = checkHostingNameBlacklist(companyName);
  if (blackcheck.blocked) return jerr(400, blackcheck.reason!);

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

    // 3) Hyperscales player + starter-bootstrap — best-effort.
    // Ha a player már létezik (pl. callback-bridge előbb futott), nem
    // bootstrappelünk újra; csak first-time signup-on rakjuk ki a kezdő
    // szervert / customer-eket / ticketeket.
    try {
      const existing = await getPlayer(db, user.id);
      if (!existing) {
        await createPlayer(db, {
          user_id: user.id,
          company_name: companyName,
          city,
        });

        // === Starter bootstrap ===
        const userId = user.id;
        const now = Math.floor(Date.now() / 1000);
        const starter = SERVER_SPECS.lamp_box;

        // 1× starter szerver (ingyen — purchase_cost_cents nem terhel,
        // monthly_cost_cents 0-ra állítva, hogy a kezdő ne fogyjon ki azonnal)
        await db.prepare(
          'INSERT INTO servers (player_id, era, type, capacity, current_load, ' +
          'monthly_cost_cents, purchased_at) VALUES (?, 1, \'lamp_box\', ?, 0, 0, ?)',
        ).bind(userId, starter.capacity, now).run();

        // 3× kezdő customer (hobby plan), mindegyiknek 1 nyitott ticket.
        // Starter-tickets ALWAYS use the persona-specific placeholder text —
        // we deliberately do NOT consume the daily LLM-cap here, otherwise
        // a fresh user would land on /play/shift with only 2/5 budget and
        // be locked out of their very first shift (need 5). The AI-flavour
        // kicks in on the next cron-tick + during shift-mode interactions.
        for (let i = 0; i < 3; i++) {
          const sc = spawnCustomer('hobby');
          const cRes = await db.prepare(
            'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, ' +
            'joined_at, satisfaction, churn_risk) ' +
            'VALUES (?, ?, ?, \'hobby\', ?, ?, 0) RETURNING id',
          ).bind(userId, sc.name, sc.persona_archetype, now, sc.starting_satisfaction)
            .first<{ id: number }>();
          if (!cRes) continue; // best-effort

          const summary = sc.initial_ticket_text.slice(0, 80);
          const fullText = sc.initial_ticket_text;

          await db.prepare(
            'INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) ' +
            'VALUES (?, ?, ?, ?, \'open\', ?)',
          ).bind(cRes.id, userId, summary, fullText, now).run();
        }

        // Initial MRR: 3 × $5 hobby = $15 = 1500 cents
        await db.prepare('UPDATE players SET mrr_usd_cents = 1500 WHERE user_id = ?')
          .bind(userId).run();
      }
    } catch (e) {
      // A user létrejött; player később a /play first-hit-en pótlódhat
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
