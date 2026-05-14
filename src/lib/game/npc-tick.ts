// src/lib/game/npc-tick.ts
// Per-archetype behaviour engine for NPC competitor companies. Runs on
// the same cron-tick as real players (every ~5 game-minutes) but only
// MAKES A DECISION once per game-day per NPC, gated by npc_last_decision_at.
//
// No LLM calls on this path. All "intelligence" comes from archetype-
// specific weighted random choices over a fixed action menu (grow, hold,
// shrink, pivot). The result is that:
//   - Day-to-day each NPC's MRR drifts in a way that *looks* deliberate
//   - Each archetype has a recognizable trajectory over many days
//   - Some NPCs visibly fail (pivot_addict resets, crypto_bro can crash)
//
// This is enough for "the leaderboard is alive" without burning the
// Workers AI free tier. Phase 2 will sprinkle LLM-generated forum posts
// and acquisition-offer copy on top, with a global daily cap.

import type { D1Database } from '@cloudflare/workers-types/experimental';
import type { NpcArchetype } from './npc-characters';

interface NpcRow {
  user_id: string;
  company_name: string;
  cash_usd_cents: number;
  mrr_usd_cents: number;
  reputation: number;
  current_era: number;
  npc_archetype: NpcArchetype;
  npc_last_decision_at: number;
}

const ONE_DAY_SEC = 86_400;

// In-game day length isn't 1 real day — but the NPC-decision cadence
// being "once per real day" is fine for low-token, low-noise progression.
// Real players who fast-forward will pull ahead of NPCs and that's OK.
const NPC_DECISION_INTERVAL_SEC = ONE_DAY_SEC;

interface ActionWeights {
  grow_big: number;       // +large MRR, -big cash
  grow_small: number;     // +small MRR, -small cash
  hold: number;           // no change
  shrink: number;         // -small MRR, +small rep recovery (focus on existing)
  crash: number;          // -big MRR, -rep (rare bad outcome)
  pivot: number;          // reset MRR to ~30% of cash, +rep dent
}

const ARCHETYPE_WEIGHTS: Record<NpcArchetype, ActionWeights> = {
  // Buys aggressively, occasionally overextends
  aggressive_scaler: {
    grow_big: 35, grow_small: 30, hold: 15, shrink: 5, crash: 12, pivot: 3,
  },
  // Only grows when comfortable; rarely crashes
  cautious_founder: {
    grow_big: 5, grow_small: 35, hold: 50, shrink: 8, crash: 2, pivot: 0,
  },
  // Spikes and crashes
  crypto_bro: {
    grow_big: 30, grow_small: 15, hold: 10, shrink: 5, crash: 35, pivot: 5,
  },
  // Stable enterprise base, almost no movement
  enterprise_giant: {
    grow_big: 8, grow_small: 25, hold: 60, shrink: 4, crash: 2, pivot: 1,
  },
  // Tiny growth, very rarely crashes, never pivots
  mom_and_pop: {
    grow_big: 0, grow_small: 20, hold: 75, shrink: 4, crash: 1, pivot: 0,
  },
  // Resets often. The lore feature.
  pivot_addict: {
    grow_big: 15, grow_small: 20, hold: 30, shrink: 8, crash: 7, pivot: 20,
  },
};

function pickAction(weights: ActionWeights): keyof ActionWeights {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of Object.entries(weights) as [keyof ActionWeights, number][]) {
    if ((r -= w) <= 0) return key;
  }
  return 'hold';
}

interface NpcStep {
  user_id: string;
  action: keyof ActionWeights;
  cash_delta_cents: number;
  mrr_delta_cents: number;
  rep_delta: number;
}

function computeStep(npc: NpcRow): NpcStep {
  const w = ARCHETYPE_WEIGHTS[npc.npc_archetype];
  const action = pickAction(w);

  // Magnitudes scale with current MRR so big NPCs make bigger moves —
  // otherwise the leaderboard would compress over time.
  const mrr = npc.mrr_usd_cents;
  const cash = npc.cash_usd_cents;

  switch (action) {
    case 'grow_big': {
      const mrrUp = Math.max(200, Math.round(mrr * 0.18));   // +18%
      const cost = Math.max(15000, mrrUp * 10);
      return {
        user_id: npc.user_id, action,
        mrr_delta_cents: cash > cost ? mrrUp : 0,
        cash_delta_cents: cash > cost ? -cost : 0,
        rep_delta: cash > cost ? +2 : -1,                    // wasted try → -1 rep
      };
    }
    case 'grow_small': {
      const mrrUp = Math.max(50, Math.round(mrr * 0.05));
      const cost = Math.max(3000, mrrUp * 8);
      return {
        user_id: npc.user_id, action,
        mrr_delta_cents: cash > cost ? mrrUp : 0,
        cash_delta_cents: cash > cost ? -cost : 0,
        rep_delta: cash > cost ? +1 : 0,
      };
    }
    case 'hold':
      return { user_id: npc.user_id, action, mrr_delta_cents: 0, cash_delta_cents: 0, rep_delta: 0 };
    case 'shrink': {
      const mrrDown = Math.max(50, Math.round(mrr * 0.04));
      return {
        user_id: npc.user_id, action,
        mrr_delta_cents: -mrrDown,
        cash_delta_cents: Math.round(mrrDown * 2),           // freed-up capacity
        rep_delta: +1,                                       // happier remaining customers
      };
    }
    case 'crash': {
      const mrrDown = Math.max(300, Math.round(mrr * 0.22));
      return {
        user_id: npc.user_id, action,
        mrr_delta_cents: -mrrDown,
        cash_delta_cents: -Math.round(mrrDown * 3),          // outage costs
        rep_delta: -8,
      };
    }
    case 'pivot': {
      // Hard reset: keep 30% of cash, drop MRR to floor, rep hit
      return {
        user_id: npc.user_id, action,
        mrr_delta_cents: -mrr + 1500,                        // back to ~$15 MRR
        cash_delta_cents: -Math.round(cash * 0.7),
        rep_delta: -15,
      };
    }
  }
}

interface NpcTickResult {
  npcs_examined: number;
  npcs_decided: number;
  actions: Record<string, number>;
}

export async function tickAllNpcs(db: D1Database, now: number): Promise<NpcTickResult> {
  const cutoff = now - NPC_DECISION_INTERVAL_SEC;
  const rows = await db
    .prepare(
      'SELECT user_id, company_name, cash_usd_cents, mrr_usd_cents, reputation, ' +
      'current_era, npc_archetype, npc_last_decision_at ' +
      'FROM players WHERE is_npc = 1 AND npc_last_decision_at < ?',
    )
    .bind(cutoff)
    .all<NpcRow>();

  const npcs = rows.results ?? [];
  const actions: Record<string, number> = {};
  let decided = 0;

  for (const npc of npcs) {
    const step = computeStep(npc);
    actions[step.action] = (actions[step.action] ?? 0) + 1;

    // Clamp so MRR / cash / rep never go negative or absurd
    const newCash = Math.max(0, npc.cash_usd_cents + step.cash_delta_cents);
    const newMrr = Math.max(0, npc.mrr_usd_cents + step.mrr_delta_cents);
    const newRep = Math.max(0, Math.min(100, npc.reputation + step.rep_delta));

    await db
      .prepare(
        'UPDATE players SET cash_usd_cents = ?, mrr_usd_cents = ?, reputation = ?, ' +
        'npc_last_decision_at = ?, last_active_at = ? WHERE user_id = ?',
      )
      .bind(newCash, newMrr, newRep, now, now, npc.user_id)
      .run();

    decided++;
  }

  return { npcs_examined: npcs.length, npcs_decided: decided, actions };
}
