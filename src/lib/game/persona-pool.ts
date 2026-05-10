// src/lib/game/persona-pool.ts
import type { PersonaArchetype } from './types';

export interface PersonaSpec {
  archetype: PersonaArchetype;
  display_name: string;
  spawn_weight: number;
  starting_satisfaction: number;
  flavor: string;
}

export const PERSONAS: PersonaSpec[] = [
  { archetype: 'newbie', display_name: 'The Newbie', spawn_weight: 8, starting_satisfaction: 60,
    flavor: 'Confused about what a "domain" actually is.' },
  { archetype: 'pro', display_name: 'The Pro', spawn_weight: 5, starting_satisfaction: 50,
    flavor: 'Will quote RFCs at you.' },
  { archetype: 'cheapskate', display_name: 'The Cheapskate', spawn_weight: 7, starting_satisfaction: 40,
    flavor: 'Asks for refund on principle.' },
  { archetype: 'karen', display_name: 'The Karen', spawn_weight: 4, starting_satisfaction: 30,
    flavor: 'Will email your mom.' },
  { archetype: 'loyalist', display_name: 'The Loyalist', spawn_weight: 3, starting_satisfaction: 80,
    flavor: 'Genuinely happy. Suspiciously so.' },
  { archetype: 'ghost', display_name: 'The Ghost', spawn_weight: 4, starting_satisfaction: 50,
    flavor: 'You forgot they exist. They are leaving anyway.' },
  { archetype: 'drama', display_name: 'The Drama Queen', spawn_weight: 3, starting_satisfaction: 35,
    flavor: 'Twitter is a weapon.' },
  { archetype: 'crypto', display_name: 'The Crypto-bro', spawn_weight: 2, starting_satisfaction: 55,
    flavor: 'Probably mining XMR. Says it is "for science".' },
];

const TOTAL_WEIGHT = PERSONAS.reduce((s, p) => s + p.spawn_weight, 0);

export function pickPersona(): PersonaSpec {
  const r = Math.random() * TOTAL_WEIGHT;
  let acc = 0;
  for (const p of PERSONAS) {
    acc += p.spawn_weight;
    if (r < acc) return p;
  }
  return PERSONAS[0];
}

const FIRST_NAMES = ['Alex', 'Sam', 'Chris', 'Jamie', 'Morgan', 'Taylor', 'Casey', 'Jordan',
                     'Robin', 'Quinn', 'Avery', 'Cameron', 'Drew', 'Emerson', 'Finley'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Anderson', 'Thomas'];
const COMPANY_SUFFIX = ['LLC', 'Inc.', 'Studios', 'Co.', 'Group', 'Labs', 'Ventures', 'Partners'];

export function generateCustomerName(): string {
  const useCompany = Math.random() < 0.35;
  if (useCompany) {
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const suffix = COMPANY_SUFFIX[Math.floor(Math.random() * COMPANY_SUFFIX.length)];
    return `${last} ${suffix}`;
  }
  return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
}
