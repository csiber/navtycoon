// src/pages/api/shift/start.ts
// Creates a new shift: gathers up to 10 open tickets, populates a ShiftRoomDO,
// returns the WS URL. Daily-shift cap: free=1, pro=5.
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';

export const prerender = false;

function jerr(s: number, e: string) {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s, headers: { 'content-type': 'application/json' },
  });
}

export const POST = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c); if (!user) return jerr(401, 'auth');
  const db = getDB(c); if (!db) return jerr(500, 'no DB');
  const player = await getPlayer(db, user.id);
  if (!player) return jerr(404, 'no player');

  // Daily shift cap
  const isPro = player.is_pro === 1;
  const cap = isPro ? 5 : 1;
  const todayUsed = player.free_shifts_today + player.paid_shifts_today;
  if (todayUsed >= cap) return jerr(429, `daily shift cap reached (${cap})`);

  // Up to 10 tickets with their customers.
  // We accept BOTH 'open' and 'in_progress' so abandoned shifts (the
  // player closed the modal mid-shift; tickets got bumped to
  // in_progress but never resolved) get picked up again. Without this
  // the dashboard CTA reads "9 open tickets" (state.ts counts both
  // statuses) but the shift screen sees 0 and shows "Inbox-empty",
  // which the user flagged as inconsistent.
  const tickets = await db.prepare(`
    SELECT t.id AS ticket_id, t.summary, t.full_text,
           c.id AS customer_id, c.name, c.persona_archetype, c.satisfaction
    FROM tickets t JOIN customers c ON t.customer_id = c.id
    WHERE t.player_id = ? AND t.status IN ('open', 'in_progress')
    ORDER BY t.created_at ASC LIMIT 10
  `).bind(user.id).all<{
    ticket_id: number; summary: string; full_text: string;
    customer_id: number; name: string; persona_archetype: string; satisfaction: number;
  }>();

  if (!tickets.results || tickets.results.length === 0) return jerr(400, 'no open tickets');

  const shiftId = crypto.randomUUID();
  for (const t of tickets.results) {
    await db.prepare(`UPDATE tickets SET status = 'in_progress' WHERE id = ?`).bind(t.ticket_id).run();
  }
  if (isPro) {
    await db.prepare('UPDATE players SET paid_shifts_today = paid_shifts_today + 1 WHERE user_id = ?').bind(user.id).run();
  } else {
    await db.prepare('UPDATE players SET free_shifts_today = free_shifts_today + 1 WHERE user_id = ?').bind(user.id).run();
  }

  const env = c.locals.runtime?.env as { SHIFT_ROOM?: DurableObjectNamespace };
  if (!env?.SHIFT_ROOM) return jerr(500, 'SHIFT_ROOM not bound');
  const id = env.SHIFT_ROOM.idFromName(shiftId);
  const stub = env.SHIFT_ROOM.get(id);
  await stub.fetch('https://room/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'init',
      player_id: user.id,
      is_pro: isPro,
      shift_id: shiftId,
      customers: tickets.results.map(t => ({
        ticket_id: t.ticket_id,
        customer_id: t.customer_id,
        customer_name: t.name,
        archetype: t.persona_archetype,
        current_satisfaction: t.satisfaction,
        ticket_subject: t.summary,
        ticket_first_message: t.full_text,
      })),
    }),
  });

  return new Response(JSON.stringify({ ok: true, shift_id: shiftId, ws_path: `/api/shift/${shiftId}` }), {
    headers: { 'content-type': 'application/json' },
  });
};
