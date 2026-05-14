// src/lib/forum/npc-seeds.ts
// Hand-written NPC threads + replies for the forum's initial population.
// Picked to match each NPC's archetype voice — Quantum Pulse is unhinged,
// Aurora Data is glacial, Riverside is folksy, etc.
//
// No LLM. Zero token cost. Phase 2 will add LLM-generated NPC replies
// triggered by real-player posts, gated by a global daily cap.

export interface SeedThread {
  author_id: string;            // FK → players.user_id (must be is_npc=1)
  title: string;
  body: string;
  replies: SeedReply[];         // ordered
}

export interface SeedReply {
  author_id: string;
  body: string;
  minutes_after_thread: number; // for created_at ordering
}

export const NPC_SEED_THREADS: readonly SeedThread[] = [
  {
    author_id: 'npc-quantum-pulse',
    title: 'still bullish on $TYCOON nfa not financial advice',
    body: "look. i hosted a guy's NFT marketplace through the 2024 winter and we both ate it. but the new $TYCOON utility (governance + cold storage fee discounts) is going to be IT. who else is taking on-chain payments at the rack? if you're not stacking you're sleeping.",
    replies: [
      {
        author_id: 'npc-aurora-data',
        body: "We do not accept tokens. Our procurement runs on invoices. This is the second time this week I've said this in this forum.",
        minutes_after_thread: 47,
      },
      {
        author_id: 'npc-blackbox',
        body: "+1 to Aurora. I will not be installing a stripe alternative that needs a hardware wallet on my colo cabinet.",
        minutes_after_thread: 92,
      },
    ],
  },
  {
    author_id: 'npc-riverside',
    title: 'tape drive making a weird grinding noise, anyone else?',
    body: "hey y'all. our daily backup tape drive started making this kind of slow grinding when the LTO-5 cartridge is loading. customers haven't noticed yet but it's keeping me up. anyone seen this on similar gear? thinking of just buying a refurb spare but the wife is asking why we have three of them.",
    replies: [
      {
        author_id: 'npc-pirostech',
        body: "Tisztítókazettát próbáltad már? Nálunk minden harmadik hónapban azzal lehet csillapítani. Ha az se segít, akkor a fej lehet, ami már megette a magáét.",
        minutes_after_thread: 18,
      },
      {
        author_id: 'npc-blackbox',
        body: "Page 23 of my SOP covers exactly this. The grinding is the load arm bearing, not the head. Replace the whole drive — repairs cost more than refurb.",
        minutes_after_thread: 134,
      },
    ],
  },
  {
    author_id: 'npc-pixelforge',
    title: 'who else is shipping to APAC and what are you paying for transit',
    body: 'about to sign a year-long peering deal with a tier-1 in singapore. quoted $0.012/GB egress with 95th percentile billing. that feels high but every other competitor in the region quoted similar. is anyone getting better than this? helix i\'m looking at you 👀',
    replies: [
      {
        author_id: 'npc-helix-edge',
        body: "we're at 0.0094 but we committed 50TB/mo for 18 months. the moment your APAC MRR can support that commit, your rates fall off a cliff. happy to intro you to our peering contact, we're not in the same vertical.",
        minutes_after_thread: 26,
      },
      {
        author_id: 'npc-tempest-edge',
        body: "we pivoted away from APAC last quarter (focus shift to agentic infra for retail) but when we were there we did 0.011 with a smaller provider, slightly worse routing in JKT. ymmv.",
        minutes_after_thread: 88,
      },
    ],
  },
  {
    author_id: 'npc-belvedere',
    title: 'thinking very carefully about hiring a second sysadmin',
    body: "Runway is at 9 months. MRR has been growing 6% MoM for the last quarter. The temptation to hire is strong but my last business (not in this industry) failed because I hired ahead of revenue. Would love to hear how others timed their first hire.",
    replies: [
      {
        author_id: 'npc-riverside',
        body: "We waited too long. Husband-and-wife ops for 7 years before we hired #3, by then we'd already lost 2 customers to slow ticket response. If you have the runway and the growth, do it. Don't be us.",
        minutes_after_thread: 41,
      },
      {
        author_id: 'npc-maelstrom',
        body: 'hire a contractor first. lock-in a 3-month engagement, see if they fit the rhythm. that\'s how we did it during the Q2 pivot.',
        minutes_after_thread: 110,
      },
    ],
  },
  {
    author_id: 'npc-maelstrom',
    title: 'we just rebranded to "agentic infra for retail" — feedback wanted',
    body: 'so we shipped a new landing page yesterday. the pitch is: we host the agent runtime + the merchant\'s product catalog + the order pipeline, all in one stack. the early signups are bartenders, food trucks, etsy people. anyone seeing similar tailwinds in their pipeline? or is this another pivot that fizzles in 90 days lol',
    replies: [
      {
        author_id: 'npc-aurora-data',
        body: "That is the 4th pivot from your company this calendar year. I think you should consider that the problem may not be the pivots.",
        minutes_after_thread: 12,
      },
      {
        author_id: 'npc-quantum-pulse',
        body: 'hot take but agentic+retail is undervalued rn. if you add $TYCOON acceptance you double your TAM overnight. dm me about co-marketing.',
        minutes_after_thread: 33,
      },
      {
        author_id: 'npc-helix-edge',
        body: "Maelstrom, I'd genuinely watch your churn cohort closely. The bartender persona has high signup intent but low 60-day retention based on what we saw. Happy to share data if useful.",
        minutes_after_thread: 64,
      },
    ],
  },
] as const;
