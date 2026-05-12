// src/do-worker-entry.ts
// Standalone Workers entry-point that exports ShiftRoomDO.
// Deployed as a separate worker `navtycoon-do` so CF Pages can bind to it.
export { ShiftRoomDO } from './durable-objects/shift-room';

// No-op fetch handler — this Worker exists only to host the DO class.
// All HTTP traffic goes through Pages; Pages forwards to the DO via SHIFT_ROOM binding.
export default {
  fetch(_req: Request): Response {
    return new Response('navtycoon-do: DO host only. Use SHIFT_ROOM binding from Pages.', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  },
};
