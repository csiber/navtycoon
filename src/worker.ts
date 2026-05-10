// src/worker.ts
// Custom Cloudflare Worker entrypoint for Astro CF adapter.
//
// Astro's CF adapter calls `createExports(manifest, args)` from this module
// and uses its return value to construct the worker's exports. We re-export
// `createExports` from the default adapter entrypoint AND add Durable Object
// classes to its return value so they end up in the deployed worker bundle
// (CF Pages cannot bind to a DO class that isn't part of the worker bundle).
import { createExports as defaultCreateExports } from '@astrojs/cloudflare/entrypoints/server.js';
import { ShiftRoomDO } from './durable-objects/shift-room';

export function createExports(manifest: Parameters<typeof defaultCreateExports>[0]) {
  const base = defaultCreateExports(manifest);
  return {
    ...base,
    ShiftRoomDO,
  };
}
