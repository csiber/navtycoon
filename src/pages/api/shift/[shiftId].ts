// src/pages/api/shift/[shiftId].ts
// WebSocket-upgrade relay → ShiftRoomDO.
import type { APIContext } from 'astro';
import { getCurrentUser } from '../../../lib/auth';

export const prerender = false;

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return new Response('auth', { status: 401 });

  const upgrade = c.request.headers.get('Upgrade');
  if (upgrade !== 'websocket') return new Response('expected WS', { status: 426 });

  const env = c.locals.runtime?.env as { SHIFT_ROOM?: DurableObjectNamespace };
  if (!env?.SHIFT_ROOM) return new Response('no DO', { status: 500 });

  const shiftId = String(c.params.shiftId ?? '');
  if (!shiftId) return new Response('no shift', { status: 400 });

  const id = env.SHIFT_ROOM.idFromName(shiftId);
  const stub = env.SHIFT_ROOM.get(id);
  return stub.fetch('https://room/ws', c.request);
};
