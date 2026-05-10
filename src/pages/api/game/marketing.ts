// POST /api/game/marketing — marketing-mix beállítása.
// Auth → tetszőleges seo/ppc/referral súlyok → normalizeMix (100% sum, balanced
// default ha mind 0) → updatePlayer. A normalize csendes: nincs 422, mindig ok.
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { updatePlayer } from '../../../lib/game/db';
import { normalizeMix } from '../../../lib/game/marketing';

export const prerender = false;

function jerr(s: number, e: string): Response {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  let body: { seo?: number; ppc?: number; referral?: number } = {};
  try {
    body = await c.request.json();
  } catch {
    return jerr(400, 'JSON');
  }

  const mix = normalizeMix(body);
  await updatePlayer(db, user.id, {
    marketing_seo_pct: mix.seo,
    marketing_ppc_pct: mix.ppc,
    marketing_referral_pct: mix.referral,
  });

  return new Response(JSON.stringify({ ok: true, mix }), {
    headers: { 'content-type': 'application/json' },
  });
};
