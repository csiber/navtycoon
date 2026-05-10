// src/lib/game/customer-spawn.ts
// Plan 1 placeholder: spawn customers with simple seeded ticket-text.
// Plan 2 replaces this with Workers AI prompt-driven generation.
import type { PlanTier, PersonaArchetype } from './types';
import { pickPersona, generateCustomerName, PERSONAS } from './persona-pool';

const PLACEHOLDER_TICKETS: Record<PersonaArchetype, string[]> = {
  newbie: [
    'Where is the FTP? I need it for my homepage thing.',
    'My WordPress is showing PHP errors. Is that bad?',
    'I cannot find the login button.',
  ],
  pro: [
    '504 timeout under load. fastcgi_buffer_size at 16k, expected.',
    'Slow query log shows 2.3s on a JOIN. I need a covering index.',
    'TLS handshake failing on Android 11 — old cipher suites?',
  ],
  cheapskate: [
    'The site was down for 4 minutes yesterday. I want a refund.',
    'My neighbor pays half what I pay. Match the price?',
    'Disk usage is 51%. You said unlimited.',
  ],
  karen: [
    'THIS IS UNACCEPTABLE. My customers cannot reach the site.',
    'I have been ON HOLD for 8 minutes. WHO IS YOUR MANAGER.',
    'You will hear from my lawyer if this is not fixed in 1 hour.',
  ],
  loyalist: [
    'Hi! Just letting you know the new dashboard is great. ❤️',
    'Renewed for 2 years today. Keep up the good work.',
    'Quick question: can you recommend a good backup strategy?',
  ],
  ghost: [
    'Hi.',
    'still there?',
    '...',
  ],
  drama: [
    'I just posted on Twitter about your service. Reply count is climbing.',
    'My therapist says I need to switch hosts. This is taking years off me.',
    'A blog post is being drafted. You have one chance.',
  ],
  crypto: [
    'gm. Need 10x the bandwidth, big drop coming. WAGMI.',
    'Server keeps getting flagged. It is just a hashing experiment ser.',
    'Would you accept payment in $TYCOON? I can get you a discount.',
  ],
};

export interface SpawnedCustomer {
  name: string;
  persona_archetype: PersonaArchetype;
  plan_tier: PlanTier;
  starting_satisfaction: number;
  initial_ticket_text: string;
}

export function spawnCustomer(plan_tier: PlanTier = 'hobby'): SpawnedCustomer {
  const persona = pickPersona();
  const tickets = PLACEHOLDER_TICKETS[persona.archetype];
  const initial = tickets[Math.floor(Math.random() * tickets.length)];
  return {
    name: generateCustomerName(),
    persona_archetype: persona.archetype,
    plan_tier,
    starting_satisfaction: persona.starting_satisfaction,
    initial_ticket_text: initial,
  };
}

export function getPlaceholderTicketForPersona(archetype: PersonaArchetype): string {
  const tickets = PLACEHOLDER_TICKETS[archetype];
  return tickets[Math.floor(Math.random() * tickets.length)];
}
