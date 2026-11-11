// Kezdő játékállás egy új (vagy nullázott) játékosnak: player-sor + 1 ingyenes kezdő szerver +
// 3 hobby-ügyfél egy-egy nyitott tickettel + kezdő MRR.
//
// 2026-11-11: eddig ez csak a signup-ban élt. A „Mentés törlése" (POST /api/game/reset) a players-sort
// törli, a /play pedig player nélkül a /signup-ra irányított, a /signup viszont belépett usert vissza a
// /play-re → végtelen átirányítás, a fiók használhatatlan lett (a beállítások/fióktörlés sem nyílt meg).
// Most a /play maga hozza létre újra a kezdőállást (ensurePlayer).

import type { Player } from './types';
import { createPlayer, getPlayer, type D1Like } from './db';
import { spawnCustomer } from './customer-spawn';
import { SERVER_SPECS } from './server-types';

export type StarterLang = 'en' | 'hu' | 'de';

export interface StarterInput {
  user_id: string;
  company_name: string;
  city: string | null;
  lang?: StarterLang;
}

/** Új player + kezdőcsomag. A hívó felel azért, hogy még ne legyen player-sora. */
export async function bootstrapStarterPlayer(db: D1Like, input: StarterInput): Promise<Player> {
  await createPlayer(db, { user_id: input.user_id, company_name: input.company_name, city: input.city });
  await db.prepare('UPDATE players SET preferred_lang = ? WHERE user_id = ?')
    .bind(input.lang ?? 'en', input.user_id).run();

  const userId = input.user_id;
  const now = Math.floor(Date.now() / 1000);
  const starter = SERVER_SPECS.lamp_box;

  // 1× kezdő szerver ingyen, havidíj nélkül, hogy a kezdő ne fogyjon ki azonnal.
  await db.prepare(
    'INSERT INTO servers (player_id, era, type, capacity, current_load, ' +
    'monthly_cost_cents, purchased_at) VALUES (?, 1, \'lamp_box\', ?, 0, 0, ?)',
  ).bind(userId, starter.capacity, now).run();

  // 3× hobby-ügyfél, mindegyiknek 1 nyitott ticket. A kezdő ticketek a persona-sablonszöveget kapják:
  // itt szándékosan nem fogyasztjuk a napi LLM-keretet (az az első műszakra kell).
  for (let i = 0; i < 3; i++) {
    const sc = spawnCustomer('hobby');
    const cRes = await db.prepare(
      'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, ' +
      'joined_at, satisfaction, churn_risk) ' +
      'VALUES (?, ?, ?, \'hobby\', ?, ?, 0) RETURNING id',
    ).bind(userId, sc.name, sc.persona_archetype, now, sc.starting_satisfaction)
      .first<{ id: number }>();
    if (!cRes) continue;
    await db.prepare(
      'INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) ' +
      'VALUES (?, ?, ?, ?, \'open\', ?)',
    ).bind(cRes.id, userId, sc.initial_ticket_text.slice(0, 80), sc.initial_ticket_text, now).run();
  }

  // Kezdő MRR: 3 × $5 hobby = $15
  await db.prepare('UPDATE players SET mrr_usd_cents = 1500 WHERE user_id = ?').bind(userId).run();

  const p = await getPlayer(db, userId);
  if (!p) throw new Error('bootstrapStarterPlayer: player missing after insert');
  return p;
}

/** A user játékosa; ha nincs (új fiók, nullázott mentés, félbemaradt signup), létrehozza a kezdőállást. */
export async function ensurePlayer(
  db: D1Like,
  user: { id: string; display_name: string | null; email: string },
  lang?: StarterLang,
): Promise<Player> {
  const existing = await getPlayer(db, user.id);
  if (existing) return existing;
  const name = (user.display_name ?? '').trim().slice(0, 80);
  return bootstrapStarterPlayer(db, {
    user_id: user.id,
    company_name: name.length >= 2 ? name : 'My Hosting Co.',
    city: null,
    lang,
  });
}
