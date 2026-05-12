// POST /api/game/events/:id/resolve { option_id }
// Resolve a pending event with the player's chosen option:
//   1. ownership-check (player_id + resolved_at IS NULL)
//   2. apply EventOptionResult (cash, reputation, all-customer satisfaction)
//   3. mark event resolved (resolved_at + outcome)
//   4. (best-effort) unlock narrative achievement on first ddos resolve

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../../../lib/auth';
import { getEventDefinition } from '../../../../../lib/game/event-options';
import { unlockAchievement } from '../../../../../lib/game/achievements';
import type { EventType } from '../../../../../lib/game/types';

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

  const eventId = Number(c.params.id);
  if (!Number.isFinite(eventId)) return jerr(400, 'bad event id');

  let body: { option_id?: string } = {};
  try {
    body = (await c.request.json()) as { option_id?: string };
  } catch {
    return jerr(400, 'bad JSON');
  }
  const optionId = body.option_id;
  if (!optionId || typeof optionId !== 'string') {
    return jerr(400, 'option_id required');
  }

  // Load + ownership-check
  const event = await db
    .prepare(
      'SELECT id, event_type, resolved_at FROM events WHERE id = ? AND player_id = ?',
    )
    .bind(eventId, user.id)
    .first<{ id: number; event_type: string; resolved_at: number | null }>();
  if (!event) return jerr(404, 'event not found');
  if (event.resolved_at !== null) return jerr(409, 'already resolved');

  const def = getEventDefinition(event.event_type as EventType);
  if (!def) return jerr(500, 'unknown event type');
  const opt = def.options.find((o) => o.id === optionId);
  if (!opt) return jerr(400, 'unknown option');

  const result = opt.apply();
  const now = Math.floor(Date.now() / 1000);

  // Apply: cash, reputation, all-customer satisfaction
  if (result.cash_delta_cents !== 0) {
    await db
      .prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?')
      .bind(result.cash_delta_cents, user.id)
      .run();
  }
  if (result.reputation_delta !== 0) {
    await db
      .prepare(
        'UPDATE players SET reputation = MAX(-100, MIN(100, reputation + ?)) WHERE user_id = ?',
      )
      .bind(result.reputation_delta, user.id)
      .run();
  }
  if (result.satisfaction_delta_global !== 0) {
    await db
      .prepare(
        'UPDATE customers SET satisfaction = MAX(-100, MIN(100, satisfaction + ?)) WHERE player_id = ? AND is_active = 1',
      )
      .bind(result.satisfaction_delta_global, user.id)
      .run();
  }

  await db
    .prepare('UPDATE events SET resolved_at = ?, outcome = ? WHERE id = ?')
    .bind(now, result.outcome, eventId)
    .run();

  // Narrative-driven achievement (best-effort, idempotent)
  let narrativeUnlocked: string | null = null;
  if (event.event_type === 'ddos_attempt') {
    const wasUnlocked = await unlockAchievement(
      db as unknown as import('@cloudflare/workers-types/experimental').D1Database,
      user.id,
      'survived_first_ddos',
    );
    if (wasUnlocked) narrativeUnlocked = 'survived_first_ddos';
  }

  return new Response(
    JSON.stringify({
      ok: true,
      outcome: result.outcome,
      message: result.message,
      cash_delta_cents: result.cash_delta_cents,
      reputation_delta: result.reputation_delta,
      satisfaction_delta: result.satisfaction_delta_global,
      newly_unlocked_achievement: narrativeUnlocked,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
};
