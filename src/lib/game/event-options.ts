// Hyperscales — event-option definíciók a cron-tick által spawnolt
// events táblához. Minden EventType-hez 2-3 választható "döntés" tartozik,
// mindegyik visszaad egy EventOptionResult-ot (cash/satisfaction/reputation delta + szöveg).
//
// A cron-tick csak SPAWN-ol; a resolve-flow a player kezében van
// (lásd src/pages/api/game/events/[id]/resolve.ts).

import type { EventType } from './types';

export interface EventOptionResult {
  outcome: 'positive' | 'neutral' | 'negative';
  cash_delta_cents: number;
  /** Applied to ALL active customers of the player. */
  satisfaction_delta_global: number;
  reputation_delta: number;
  /** Shown to the player after they pick this option. */
  message: string;
}

export interface EventOption {
  id: string;
  label: string;
  description: string;
  apply(): EventOptionResult;
}

export interface EventDefinition {
  event_type: EventType;
  title: string;
  narrative: string;
  options: EventOption[];
}

export const EVENT_DEFINITIONS: Record<EventType, EventDefinition> = {
  ddos_attempt: {
    event_type: 'ddos_attempt',
    title: '🚨 DDoS attack incoming',
    narrative:
      'Some script-kiddie is hitting your edge with 500k req/s. Your servers are sweating.',
    options: [
      {
        id: 'mitigate_paid',
        label: 'Pay $300 for Cloudflare mitigation',
        description: 'Quick, expensive, makes the problem vanish.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: -30000,
          satisfaction_delta_global: 0,
          reputation_delta: 2,
          message: 'Mitigated. Customers noticed nothing.',
        }),
      },
      {
        id: 'tough_it_out',
        label: 'Tough it out',
        description: 'Free, but everyone notices the slowdown.',
        apply: () => ({
          outcome: 'negative',
          cash_delta_cents: 0,
          satisfaction_delta_global: -8,
          reputation_delta: -3,
          message: '47% packet loss for 2 hours. Customers furious.',
        }),
      },
      {
        id: 'call_the_isp',
        label: 'Call the ISP',
        description: 'Cheap, slow, half-measure.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: -5000,
          satisfaction_delta_global: -3,
          reputation_delta: 0,
          message: 'ISP filtered after 40 minutes. Some collateral damage.',
        }),
      },
    ],
  },

  viral_blog: {
    event_type: 'viral_blog',
    title: '🔥 A customer hit HN front page',
    narrative:
      'One of your customers built a side project that just hit Hacker News #1. Traffic is up 3000%.',
    options: [
      {
        id: 'autoscale',
        label: 'Autoscale ($150)',
        description: 'Spin up extra capacity, ride the wave.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: -15000,
          satisfaction_delta_global: 5,
          reputation_delta: 5,
          message: 'Surfed the spike. Customer loved you. +5 satisfaction across the board.',
        }),
      },
      {
        id: 'rate_limit',
        label: 'Rate-limit the customer',
        description: 'Cheap, but THE customer hates you.',
        apply: () => ({
          outcome: 'negative',
          cash_delta_cents: 0,
          satisfaction_delta_global: -2,
          reputation_delta: -1,
          message: 'Customer publicly shamed you on Twitter. Brand damage.',
        }),
      },
    ],
  },

  electricity_spike: {
    event_type: 'electricity_spike',
    title: '⚡ Electricity bill spike',
    narrative:
      'Your power bill came in. 40% above normal. AC has been running 24/7 during a heatwave.',
    options: [
      {
        id: 'pay_in_full',
        label: 'Pay $500',
        description: 'Just pay it and move on.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: -50000,
          satisfaction_delta_global: 0,
          reputation_delta: 0,
          message: 'Paid. Painful but done.',
        }),
      },
      {
        id: 'negotiate',
        label: 'Negotiate a payment plan',
        description: 'Split it over 3 months. Tiny rep hit.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: -20000,
          satisfaction_delta_global: 0,
          reputation_delta: -1,
          message: 'Negotiated 60% of it now. Vendor frowned.',
        }),
      },
    ],
  },

  recruit_ad: {
    event_type: 'recruit_ad',
    title: '👥 Recruitment opportunity',
    narrative:
      'A talented sysadmin DMed you on LinkedIn. They want $400/month but would speed up incident response.',
    options: [
      {
        id: 'hire',
        label: 'Hire ($400 one-time signing bonus)',
        description: 'Boost: -50% incident impact for 30 days.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: -40000,
          satisfaction_delta_global: 2,
          reputation_delta: 2,
          message: 'They started Monday. Already saved your bacon once.',
        }),
      },
      {
        id: 'pass',
        label: 'Pass',
        description: 'No cost.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: 0,
          satisfaction_delta_global: 0,
          reputation_delta: 0,
          message: 'They joined a competitor.',
        }),
      },
    ],
  },

  intern_incident: {
    event_type: 'intern_incident',
    title: '💥 Intern incident',
    narrative:
      'Your intern ran `rm -rf /` on a customer DB. They thought it was a test environment.',
    options: [
      {
        id: 'restore_from_backup',
        label: 'Restore from backup ($200 + 4h downtime)',
        description: 'Best you can do.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: -20000,
          satisfaction_delta_global: -5,
          reputation_delta: -2,
          message: 'Restored, but the customer noticed.',
        }),
      },
      {
        id: 'firing_pizza',
        label: 'Fire intern, expense the pizza',
        description: 'No restore option (backups failed). Pure damage control.',
        apply: () => ({
          outcome: 'negative',
          cash_delta_cents: -3000,
          satisfaction_delta_global: -15,
          reputation_delta: -8,
          message: 'Lost data. Customer left a 1-star review.',
        }),
      },
    ],
  },

  dmca: {
    event_type: 'dmca',
    title: '⚖️ DMCA takedown notice',
    narrative: 'A customer is hosting copyrighted material. Legal letter arrived.',
    options: [
      {
        id: 'remove_content',
        label: 'Remove content + notify customer',
        description: 'Comply, lose 1 customer.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: 0,
          satisfaction_delta_global: 0,
          reputation_delta: 1,
          message: 'Complied. Customer left in a huff.',
        }),
      },
      {
        id: 'fight_it',
        label: 'Fight it ($800 in legal fees)',
        description: 'You think it might be fair-use.',
        apply: () => ({
          outcome: 'negative',
          cash_delta_cents: -80000,
          satisfaction_delta_global: 0,
          reputation_delta: 3,
          message: 'Lost the case. Now you have legal bills AND no customer.',
        }),
      },
    ],
  },

  cooling_failure: {
    event_type: 'cooling_failure',
    title: '🌡️ Datacenter cooling failure',
    narrative: 'AC unit died. Temps rising. Servers throttling.',
    options: [
      {
        id: 'emergency_repair',
        label: 'Emergency repair ($600)',
        description: 'Fastest fix.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: -60000,
          satisfaction_delta_global: -2,
          reputation_delta: -1,
          message: 'Fixed in 90 minutes. Brief slowdown.',
        }),
      },
      {
        id: 'portable_units',
        label: 'Portable AC units from the hardware store',
        description: 'Cheaper but degraded performance for a week.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: -8000,
          satisfaction_delta_global: -6,
          reputation_delta: -2,
          message: 'Customers noticed. Will recover.',
        }),
      },
    ],
  },

  compliance_audit: {
    event_type: 'compliance_audit',
    title: '📋 SOC 2 audit request',
    narrative:
      'A prospective enterprise customer asks: "Do you have SOC 2 Type II?" This is the deal that could change the year. Or kill the quarter.',
    options: [
      {
        id: 'hire_auditor',
        label: 'Hire a Big 4 auditor ($1,200)',
        description: 'Expensive but real. 6 weeks of paperwork. Unlocks enterprise tier.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: -120000,
          satisfaction_delta_global: 2,
          reputation_delta: 8,
          message: 'You passed. The customer signed a $4k/mo contract. Word is spreading.',
        }),
      },
      {
        id: 'diy_evidence',
        label: 'DIY evidence pack ($200)',
        description: 'Cheap, time-consuming, may or may not satisfy the customer.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: -20000,
          satisfaction_delta_global: 0,
          reputation_delta: 2,
          message: 'Customer said "good enough for now". You bought a smaller deal.',
        }),
      },
      {
        id: 'decline_audit',
        label: "Tell them you don't do SOC 2",
        description: 'Free. Customer walks. Other prospects may follow.',
        apply: () => ({
          outcome: 'negative',
          cash_delta_cents: 0,
          satisfaction_delta_global: 0,
          reputation_delta: -3,
          message: 'They tweeted about it. Two more prospects ghosted the same week.',
        }),
      },
    ],
  },

  competitor_buyout: {
    event_type: 'competitor_buyout',
    title: '💼 Acquisition offer on the table',
    narrative:
      'BigCloudCo wants to acquire you. Lowball but real money. Your customers would migrate. Your founder-mode would end.',
    options: [
      {
        id: 'take_the_money',
        label: 'Sell for $25,000',
        description: 'Wallet bump. Game continues. Reputation drops (you sold out).',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: 2500000,
          satisfaction_delta_global: -8,
          reputation_delta: -10,
          message: 'You sold. Cash in the bank. Devon unsubscribed in protest.',
        }),
      },
      {
        id: 'counter_offer',
        label: 'Counter at $80k',
        description: 'Coin flip — they might pay, or might walk.',
        apply: () => {
          const won = Math.random() < 0.4;
          return {
            outcome: won ? ('positive' as const) : ('negative' as const),
            cash_delta_cents: won ? 8000000 : 0,
            satisfaction_delta_global: 0,
            reputation_delta: won ? -5 : 3,
            message: won
              ? 'They paid $80k. Holy crap. The runway is real now.'
              : 'They walked. Indie cred intact, but the deal is dead.',
          };
        },
      },
      {
        id: 'reject',
        label: 'Decline politely',
        description: 'Indie founder vibes. Customers love it.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: 0,
          satisfaction_delta_global: 4,
          reputation_delta: 6,
          message: 'Word got out. Three Twitter threads, all positive. Trial signups +18% this week.',
        }),
      },
    ],
  },

  staff_drama: {
    event_type: 'staff_drama',
    title: '🎭 Staff drama — your SRE is threatening to quit',
    narrative:
      "Lin is pacing the slack DMs. Three on-call pages this week. She wants a raise OR Fridays off OR she's walking.",
    options: [
      {
        id: 'give_raise',
        label: 'Give the raise (-$800)',
        description: 'She stays. Cash drains. Other staff hear about it.',
        apply: () => ({
          outcome: 'neutral',
          cash_delta_cents: -80000,
          satisfaction_delta_global: 1,
          reputation_delta: 1,
          message: 'Lin stays. Devon noticed and asked about a raise too.',
        }),
      },
      {
        id: 'fridays_off',
        label: 'Fridays off (free)',
        description: 'No extra cost, but Friday on-call is now you.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: 0,
          satisfaction_delta_global: 0,
          reputation_delta: 2,
          message: 'Lin is grateful. You handle Friday pages personally. R.I.P. your weekends.',
        }),
      },
      {
        id: 'let_her_walk',
        label: 'Wish her luck',
        description: "You're back to solo ops. New hires take ~4 weeks to ramp.",
        apply: () => ({
          outcome: 'negative',
          cash_delta_cents: 0,
          satisfaction_delta_global: -10,
          reputation_delta: -4,
          message: 'Lin left. Two P1s within 48h. Customer-mood took a hit.',
        }),
      },
    ],
  },

  security_breach: {
    event_type: 'security_breach',
    title: '🔓 Suspected security breach',
    narrative:
      'Logs show unusual auth-attempts. Might be a real attack, might be a script-kid.',
    options: [
      {
        id: 'full_audit',
        label: 'Full security audit ($500)',
        description: 'Thorough, expensive, peace of mind.',
        apply: () => ({
          outcome: 'positive',
          cash_delta_cents: -50000,
          satisfaction_delta_global: 0,
          reputation_delta: 4,
          message: 'No breach found. Reputation grew from the transparency.',
        }),
      },
      {
        id: 'monitor',
        label: 'Just monitor it',
        description: 'Free, but risky.',
        apply: () => ({
          outcome: 'negative',
          cash_delta_cents: 0,
          satisfaction_delta_global: -3,
          reputation_delta: -5,
          message: 'They DID get in. Two customer databases leaked. PR disaster.',
        }),
      },
    ],
  },
};

export function getEventDefinition(type: EventType): EventDefinition | null {
  return EVENT_DEFINITIONS[type] ?? null;
}
