// src/lib/game/pro-sync.ts
// Hyperscales — Pro-status auto-sync from PromNET subscriptions.
//
// Source of truth: PromNET-D1 `subscriptions` table.
//   - status='active' AND plan_id NOT IN ('free','none') AND current_period_end > now
//     → grants Pro until min(subscription.current_period_end, default-cap).
//   - Otherwise: unset Pro (is_pro=0, pro_until=null) if previously set.
//
// Called on dashboard-load (cheap, periodic). Atomic UPDATE — multiple
// concurrent loads converge to same state.

import type { D1Database } from '@cloudflare/workers-types/experimental';

const FREE_PLAN_IDS = new Set(['free', 'none', '', 'trial']);

interface SubRow {
  plan_id: string;
  status: string;
  current_period_end: number | null;
}

export async function syncProStatus(
  navDB: D1Database,
  promnetDB: D1Database | undefined,
  userId: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ is_pro: 0 | 1; pro_until: number | null }> {
  // Default state if PromNET DB is not bound (local dev / test).
  if (!promnetDB) {
    return { is_pro: 0, pro_until: null };
  }

  const sub = await promnetDB.prepare(
    "SELECT plan_id, status, current_period_end FROM subscriptions " +
    "WHERE user_id = ? AND status = 'active' " +
    "ORDER BY COALESCE(current_period_end, 0) DESC LIMIT 1",
  ).bind(userId).first<SubRow>();

  let isPro: 0 | 1 = 0;
  let proUntil: number | null = null;
  if (sub && !FREE_PLAN_IDS.has(sub.plan_id) && sub.current_period_end && sub.current_period_end > now) {
    isPro = 1;
    proUntil = sub.current_period_end;
  }

  // Write through only when state changes (avoid pointless UPDATEs).
  const current = await navDB.prepare(
    'SELECT is_pro, pro_until FROM players WHERE user_id = ?',
  ).bind(userId).first<{ is_pro: number; pro_until: number | null }>();
  if (current && (current.is_pro !== isPro || current.pro_until !== proUntil)) {
    await navDB.prepare(
      'UPDATE players SET is_pro = ?, pro_until = ? WHERE user_id = ?',
    ).bind(isPro, proUntil, userId).run();
  }
  return { is_pro: isPro, pro_until: proUntil };
}
