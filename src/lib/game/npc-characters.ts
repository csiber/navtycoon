// src/lib/game/npc-characters.ts
// The 10 NPC competitor companies. These are not LLM-generated — they're
// hand-written so they have actual personality (and the free-tier Workers
// AI budget stays untouched for player-facing features).
//
// Archetypes drive the rule-based tick logic in npc-tick.ts:
//   - aggressive_scaler  → buys servers fast, takes risks, sometimes
//                          overextends and burns cash
//   - cautious_founder   → only spends when runway > 60 days, slow growth
//                          but rarely fails
//   - crypto_bro         → spikes marketing in bursts, high churn, sometimes
//                          gets rich, often crashes
//   - enterprise_giant   → stable mid-tier MRR, glacial growth, low churn
//   - mom_and_pop        → tiny but loyal customer base, almost never grows
//                          past Era 2, almost never fails
//   - pivot_addict       → ~10%/week chance of full reset (lore: pivoted to
//                          a new business model, came back from zero)
//
// All names are fictional. Real-world hosting brands are in the signup
// blacklist (hosting-blacklist.ts) for the opposite reason — players
// can't impersonate them.

export type NpcArchetype =
  | 'aggressive_scaler'
  | 'cautious_founder'
  | 'crypto_bro'
  | 'enterprise_giant'
  | 'mom_and_pop'
  | 'pivot_addict';

export interface NpcCharacter {
  user_id: string;            // stable id, becomes players.user_id
  company_name: string;
  city: string;
  archetype: NpcArchetype;
  persona_bio: string;        // shown in leaderboard hover / profile
  // initial state (otherwise seed-day-1 = real founders)
  initial_cash_cents: number;
  initial_mrr_cents: number;
  initial_reputation: number;
  initial_era: number;
}

export const NPC_CHARACTERS: readonly NpcCharacter[] = [
  {
    user_id: 'npc-belvedere',
    company_name: 'Belvedere Hosting',
    city: 'Vienna',
    archetype: 'cautious_founder',
    persona_bio:
      'Ex-private-banker who left Erste in 2019 to "do something real." Runs a single rack in a Vienna data centre. Will not buy a second server until cash exceeds six months of burn.',
    initial_cash_cents: 240000,   // $2,400
    initial_mrr_cents: 4500,      // $45/mo
    initial_reputation: 58,
    initial_era: 1,
  },
  {
    user_id: 'npc-pixelforge',
    company_name: 'Pixel Forge Labs',
    city: 'San Francisco',
    archetype: 'aggressive_scaler',
    persona_bio:
      'Stanford dropout, $2M seed round, three racks online before her first 50 customers. Burns cash like a startup is supposed to. Probably wins or implodes by Era 3.',
    initial_cash_cents: 850000,   // $8,500
    initial_mrr_cents: 12000,     // $120/mo
    initial_reputation: 62,
    initial_era: 1,
  },
  {
    user_id: 'npc-maelstrom',
    company_name: 'Maelstrom Cloud',
    city: 'Miami',
    archetype: 'pivot_addict',
    persona_bio:
      'Was an NFT marketplace in Q1, a creator-economy SaaS in Q2, and now sells "hosting for AI agents." Will pivot again. Has pivoted before. Will pivot soon.',
    initial_cash_cents: 320000,
    initial_mrr_cents: 6800,
    initial_reputation: 41,
    initial_era: 1,
  },
  {
    user_id: 'npc-aurora-data',
    company_name: 'Aurora Data Group',
    city: 'Chicago',
    archetype: 'enterprise_giant',
    persona_bio:
      'Bill, ex-Oracle CIO, escaped in 2018 and brought four enterprise contracts with him. Glacial growth, low churn, hates everything built after 2010. Replies to tickets in 4 hours sharp.',
    initial_cash_cents: 1450000,  // $14,500
    initial_mrr_cents: 22000,     // $220/mo — biggest starting MRR
    initial_reputation: 71,
    initial_era: 1,
  },
  {
    user_id: 'npc-riverside',
    company_name: 'Riverside Compute',
    city: 'Burlington, VT',
    archetype: 'mom_and_pop',
    persona_bio:
      'Husband-and-wife shop running one Dell tower out of a converted garage next to the actual river. Customers have been with them for 9 years. Will never reach Era 4.',
    initial_cash_cents: 150000,
    initial_mrr_cents: 3800,
    initial_reputation: 79,       // very loyal customer base = high rep
    initial_era: 1,
  },
  {
    user_id: 'npc-quantum-pulse',
    company_name: 'Quantum Pulse',
    city: 'Dubai',
    archetype: 'crypto_bro',
    persona_bio:
      'Says "web4" unironically. Accepts $TYCOON, $HYPER and $RACK tokens. Spikes marketing budget the first Monday of every month. Churn is biblical but his Lambo is paid off.',
    initial_cash_cents: 720000,
    initial_mrr_cents: 9500,
    initial_reputation: 33,       // low rep, controversial
    initial_era: 1,
  },
  {
    user_id: 'npc-blackbox',
    company_name: 'Blackbox Servers',
    city: 'Stuttgart',
    archetype: 'cautious_founder',
    persona_bio:
      'Ex-sysadmin from a German automotive supplier. Has a 47-page runbook. Refuses to do anything not in it. SLA: 99.99%. Refund policy: nicht möglich.',
    initial_cash_cents: 290000,
    initial_mrr_cents: 5200,
    initial_reputation: 67,
    initial_era: 1,
  },
  {
    user_id: 'npc-helix-edge',
    company_name: 'Helix Edge Networks',
    city: 'Singapore',
    archetype: 'aggressive_scaler',
    persona_bio:
      'Singapore-based, three founders, all ex-Grab infra. Aggressive APAC expansion, will undercut your prices, will hire your SRE. Currently the one to catch.',
    initial_cash_cents: 1100000,
    initial_mrr_cents: 18000,
    initial_reputation: 64,
    initial_era: 1,
  },
  {
    user_id: 'npc-pirostech',
    company_name: 'Pirostech Kft.',
    city: 'Budapest',
    archetype: 'mom_and_pop',
    persona_bio:
      'Two Hungarian-American brothers, Debian everywhere, no Kubernetes, no Slack. Loyal SMB customer base across CEE. Replies to tickets in Hungarian if your name sounds Hungarian.',
    initial_cash_cents: 180000,
    initial_mrr_cents: 4200,
    initial_reputation: 74,
    initial_era: 1,
  },
  {
    user_id: 'npc-tempest-edge',
    company_name: 'Tempest Edge',
    city: 'Austin',
    archetype: 'pivot_addict',
    persona_bio:
      'Started as a gaming server hostess in 2021. Pivoted to "edge AI for retail" last summer. Pivoting again to "agentic infra" next quarter. The pitch deck has 41 versions.',
    initial_cash_cents: 410000,
    initial_mrr_cents: 7600,
    initial_reputation: 49,
    initial_era: 1,
  },
];

// Sanity check — fail loudly if the list drifts away from 10
if (NPC_CHARACTERS.length !== 10) {
  throw new Error(`Expected exactly 10 NPC characters, got ${NPC_CHARACTERS.length}`);
}
