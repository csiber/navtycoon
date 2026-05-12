// GET /api/game/events — pending (unresolved) events of the current player.
// Joins the spawned events-row with the static EVENT_DEFINITIONS (title /
// narrative / options) so the frontend can render the resolve-UI directly.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getEventDefinition } from '../../../lib/game/event-options';
import type { EventType } from '../../../lib/game/types';

export const prerender = false;

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return new Response('auth', { status: 401 });
  const db = getDB(c);
  if (!db) return new Response('no DB', { status: 500 });

  const rows = (
    await db
      .prepare(
        `SELECT id, event_type, data_json, spawned_at
         FROM events
         WHERE player_id = ? AND resolved_at IS NULL
         ORDER BY spawned_at DESC
         LIMIT 20`,
      )
      .bind(user.id)
      .all<{
        id: number;
        event_type: string;
        data_json: string | null;
        spawned_at: number;
      }>()
  ).results ?? [];

  const events = rows.map((r) => {
    const def = getEventDefinition(r.event_type as EventType);
    return {
      id: r.id,
      event_type: r.event_type,
      spawned_at: r.spawned_at,
      title: def?.title ?? r.event_type,
      narrative: def?.narrative ?? '',
      options:
        def?.options.map((o) => ({
          id: o.id,
          label: o.label,
          description: o.description,
        })) ?? [],
    };
  });

  return new Response(JSON.stringify({ ok: true, events }), {
    headers: { 'content-type': 'application/json' },
  });
};
