// src/do-worker-entry.ts
// Standalone Workers entry — hosts ShiftRoomDO + runs the game-tick cron.
//
// CF Pages cannot host a Durable Object class OR a [triggers] cron block,
// so both responsibilities live on this dedicated Worker (`navtycoon-do`).
// The Pages app binds to the DO via `script_name = "navtycoon-do"`, while
// the cron schedule (every 5 min) is wired in `wrangler.do.toml`.

export { ShiftRoomDO } from './durable-objects/shift-room';

import { tickAllActivePlayers } from './lib/game/tick';
import type { WorkersAIBinding } from './lib/ai/workers-ai';
import type { VectorizeBinding } from './lib/ai/vectorize';

interface DoWorkerEnv {
  DB: D1Database;
  AI?: WorkersAIBinding;
  VECTORIZE?: VectorizeBinding;
  SHIFT_ROOM?: DurableObjectNamespace;
}

export default {
  // No-op fetch handler — all HTTP traffic goes through Pages; this Worker is
  // reached only via the SHIFT_ROOM binding + scheduled triggers.
  async fetch(_req: Request): Promise<Response> {
    return new Response(
      'navtycoon-do: DO host + cron-runner. Triggered by schedule, not HTTP.',
      { status: 200, headers: { 'content-type': 'text/plain' } },
    );
  },

  // Scheduled handler — runs every 5 minutes per wrangler.do.toml [triggers].
  // Calls the shared tick logic directly (DB + AI + Vectorize bindings are
  // available on this Worker).
  async scheduled(
    event: ScheduledEvent,
    env: DoWorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    ctx.waitUntil(
      tickAllActivePlayers(env.DB, now, {
        ai: env.AI,
        vectorize: env.VECTORIZE,
      })
        .then((results) => {
          const totals = results.reduce(
            (acc, r) => ({
              tickets: acc.tickets + r.tickets_spawned,
              ai_tickets: acc.ai_tickets + r.ai_tickets,
              placeholder_tickets: acc.placeholder_tickets + r.placeholder_tickets,
              money_cents: acc.money_cents + r.money_added_cents,
              churned: acc.churned + r.churned,
              events: acc.events + r.events_spawned,
            }),
            {
              tickets: 0,
              ai_tickets: 0,
              placeholder_tickets: 0,
              money_cents: 0,
              churned: 0,
              events: 0,
            },
          );
          console.log('cron-tick', {
            scheduledTime: event.scheduledTime,
            players: results.length,
            ...totals,
          });
        })
        .catch((e) => {
          console.error('cron-tick error', e);
        }),
    );
  },
};
