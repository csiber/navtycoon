// POST /api/game/reset — „Vállalat újraindítása": a cég állása nulláról indul, a fiók marad.
// A logika a src/lib/game/restart.ts-ben (tesztelt): megmarad a cégnév, a nyelv (és a régi is_pro mező), a mai
// műszak- és AI-keret (llm_usage) és a műszak-történet; ürül: ügyfelek, ticketek, szerverek, események,
// eredmények, fejlesztések. Utána azonnal van kezdőállás, a /play nem irányít sehova.

import { legacyError } from '../../../lib/i18n/api-errors';
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { restartCompany } from '../../../lib/game/restart';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  // Hibaüzenet a játékos nyelvén (src/lib/i18n/api-errors.ts legacyError).
  const jerr = (s: number, e: string): Response => legacyError(context.request, s, e);
  const user = await getCurrentUser(context);
  if (!user) return jerr(401, 'Be kell jelentkezned.');
  const db = getDB(context);
  if (!db) return jerr(500, 'No DB');

  try {
    const r = await restartCompany(db, user.id);
    // Nincs még cége (pl. félbemaradt regisztráció): a /play ensurePlayer-e úgyis létrehozza a kezdőállást.
    if (!r.ok && r.error === 'npc') return jerr(403, 'npc');
  } catch (e) {
    return jerr(500, 'Reset hiba: ' + (e as Error).message);
  }

  return new Response(
    JSON.stringify({ ok: true, redirect: '/play' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    },
  );
}

