// src/pages/api/game/onboarding-complete.ts
// Hyperscaler — first-time-player onboarding completion endpoint.
//
// POST /api/game/onboarding-complete
// Idempotent: csak akkor frissít, ha az onboarding_completed_at még NULL.
// A dashboard a 4-5 slide-os welcome modal utolsó gombján hívja.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';

export const prerender = false;

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'auth' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const db = getDB(c);
  if (!db) {
    return new Response(JSON.stringify({ ok: false, error: 'no DB' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'UPDATE players SET onboarding_completed_at = ? WHERE user_id = ? AND onboarding_completed_at IS NULL',
  ).bind(now, user.id).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
};
