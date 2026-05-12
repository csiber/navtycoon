// PATCH /api/game/settings — update player-profile fields (company_name, city).
// Per-user scope (uses user.id from session). Validates length/types.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { updatePlayer } from '../../../lib/game/db';

export const prerender = false;

function jerr(s: number, e: string): Response {
  return new Response(JSON.stringify({ ok: false, error: e }), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

const PATCHABLE_FIELDS = ['company_name', 'city'] as const;
type PatchableField = (typeof PATCHABLE_FIELDS)[number];

export const PATCH = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  let body: Record<string, unknown> = {};
  try {
    body = (await c.request.json()) as Record<string, unknown>;
  } catch {
    return jerr(400, 'bad JSON');
  }

  const patch: Record<PatchableField, string | null> = {} as Record<
    PatchableField,
    string | null
  >;
  let hasUpdate = false;
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] === undefined) continue;
    const v = body[field];
    if (v === null) {
      // company_name is required, can't be nulled
      if (field === 'company_name') {
        return jerr(400, 'company_name cannot be null');
      }
      patch[field] = null;
      hasUpdate = true;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (field === 'company_name') {
        if (trimmed.length < 2 || trimmed.length > 60) {
          return jerr(400, 'company_name 2-60 chars');
        }
        patch[field] = trimmed;
        hasUpdate = true;
      } else if (field === 'city') {
        if (trimmed.length > 60) return jerr(400, 'city too long');
        patch[field] = trimmed || null;
        hasUpdate = true;
      }
    } else {
      return jerr(400, `${field} must be string or null`);
    }
  }
  if (!hasUpdate) return jerr(400, 'nothing to update');

  await updatePlayer(db, user.id, patch);
  return new Response(JSON.stringify({ ok: true, updated: patch }), {
    headers: { 'content-type': 'application/json' },
  });
};
