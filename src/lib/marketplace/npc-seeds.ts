// src/lib/marketplace/npc-seeds.ts
// Initial population of the marketplace by the 10 NPC competitor companies.
// Each character posts 1-2 listings that match their archetype voice
// (Quantum Pulse takes $TYCOON, Aurora Data sells enterprise SOC 2,
// Riverside rents a single 1U bay, etc.). Hand-written; no LLM cost.
//
// Used by /api/admin/seed-marketplace once, after migration 0009.

import type { ListingCategory, PriceUnit } from './db';

export interface MarketplaceSeed {
  author_id: string;             // FK to players.user_id (must be is_npc=1)
  category: ListingCategory;
  title: string;
  body: string;
  price_cents: number;
  price_unit: PriceUnit;
  hours_ago: number;             // for staggered posted_at
}

export const MARKETPLACE_SEEDS: readonly MarketplaceSeed[] = [
  {
    author_id: 'npc-pixelforge', category: 'peering',
    title: 'APAC peering — SIN ↔ FRA, $0.0094/GB',
    body: 'We committed 50TB/mo with our SIN tier-1. Excess capacity available on a re-seller basis. 95th percentile billing, 24h turn-up, BGP if you have an AS. DM, not paying $0.012 like everyone else.',
    price_cents: 94, price_unit: 'per_gb', hours_ago: 3,
  },
  {
    author_id: 'npc-pixelforge', category: 'leads',
    title: 'Need 1U+GPU in TYO by Monday',
    body: "Got a Mira Sato-shaped customer asking for Tokyo. We're not there yet. If anyone has spare GPU capacity in TYO at <$1.2k/mo, finder's fee 10% of first 6mo.",
    price_cents: 120000, price_unit: 'monthly', hours_ago: 18,
  },
  {
    author_id: 'npc-aurora-data', category: 'service',
    title: 'SOC 2 Type 2 evidence pack — ready-to-audit',
    body: "Bill from Aurora. We have a clean, current Type 2 evidence pack our auditor signed off last quarter. Comes with the playbook + 4h consultation. Yes, the auditor's real. Yes, you can use it. No, we don't accept tokens.",
    price_cents: 350000, price_unit: 'one_time', hours_ago: 9,
  },
  {
    author_id: 'npc-aurora-data', category: 'service',
    title: 'Managed PostgreSQL — enterprise tier',
    body: 'White-glove pg14 cluster mgmt for accounts at $5k+ MRR. Quarterly backups, point-in-time recovery, on-call rotation included. We are slow but we are stable. Two-year minimum.',
    price_cents: 220000, price_unit: 'monthly', hours_ago: 32,
  },
  {
    author_id: 'npc-riverside', category: 'hardware',
    title: '1U bay in our garage (Burlington VT)',
    body: "We've got exactly one open 1U bay in the rack next to ours. Power is cheap, AC works, my wife brings cookies on the third Wednesday of every month. Limit 1 client. We will judge you before we say yes.",
    price_cents: 12000, price_unit: 'monthly', hours_ago: 14,
  },
  {
    author_id: 'npc-quantum-pulse', category: 'service',
    title: '🚀 $TYCOON-native hosting (10% off first 3mo if u pay in token)',
    body: 'web4 ready, edge-deployed, no kyc. accept TYCOON / HYPER / RACK. listen, we both know which one of us is doing the right thing here. dm for the discount code. nfa.',
    price_cents: 4900, price_unit: 'monthly', hours_ago: 1,
  },
  {
    author_id: 'npc-quantum-pulse', category: 'leads',
    title: 'WTB: yield-bearing hardware (e.g. GPUs for mining/inference)',
    body: 'Liquidating an NFT venture. Have 47K USDC ready to deploy on hardware that pays for itself in <9mo. Older A100s OK. Will negotiate, will pivot if needed.',
    price_cents: 4700000, price_unit: 'one_time', hours_ago: 26,
  },
  {
    author_id: 'npc-belvedere', category: 'hardware',
    title: 'Two used Dell R610s, recently retired',
    body: 'Conservative numbers: 17,000 hours each. SMART logs are clean. PSU stickers intact. Selling because we are upgrading on the back of a small but stable cash position. Price is firm, will not split the pair.',
    price_cents: 65000, price_unit: 'one_time', hours_ago: 41,
  },
  {
    author_id: 'npc-blackbox', category: 'service',
    title: 'Runbook authoring — your incident response, written down',
    body: 'I have a 47-page SOP for my own shop. I will write yours. 3-week engagement, plain Markdown deliverable, German-engineered. No emojis. No "vibes". The runbook is the product.',
    price_cents: 180000, price_unit: 'one_time', hours_ago: 11,
  },
  {
    author_id: 'npc-helix-edge', category: 'peering',
    title: 'APAC transit — undercutting the tier-1s',
    body: 'We have surplus on our SIN ↔ JKT ↔ TYO triangle. Pixel Forge is at 94, we are at 89. Commit 100TB/mo and we will drop to 81. Real SLAs, not vibes. We will not undercut by 1 cent forever; lock in this quarter.',
    price_cents: 89, price_unit: 'per_gb', hours_ago: 5,
  },
  {
    author_id: 'npc-pirostech', category: 'service',
    title: 'Magyar/CEE SMB support — saját anyanyelvi szinten',
    body: 'Két magyar-amerikai testvér. Magyar nyelvű ügyfélkommunikáció, NAV-kompatibilis számlázás, GDPR-compliant, mindenkivel jól kijövünk. Ár havidíjas, 3 hónap minimum, lemondás bármikor.',
    price_cents: 18000, price_unit: 'monthly', hours_ago: 22,
  },
  {
    author_id: 'npc-tempest-edge', category: 'service',
    title: 'Edge agentic infra (formerly: gaming hosting / retail AI)',
    body: 'We pivoted again. This time it sticks. Agent runtime + merchant catalog + order pipeline, all colocated. Early signups: bartenders, food trucks, etsy people. We will hard-launch in 3 weeks. Will iterate based on what breaks.',
    price_cents: 14900, price_unit: 'monthly', hours_ago: 4,
  },
  {
    author_id: 'npc-maelstrom', category: 'leads',
    title: 'Acquiring failed/quitting hosts — we will assume your customers',
    body: 'If you are burning out and want a soft landing, we will take over your account list at 0.6× ARR. No drama, fast close, your customers get migration support. We have done this 3 times. Yes, we will pivot again. They will be fine.',
    price_cents: 0, price_unit: 'one_time', hours_ago: 49,
  },
] as const;
