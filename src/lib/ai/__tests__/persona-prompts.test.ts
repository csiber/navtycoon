import { describe, it, expect } from 'vitest';
import { buildTicketPrompt, buildReplyPrompt, PERSONA_PROMPTS } from '../persona-prompts';
import type { PersonaArchetype } from '../../game/types';

describe('PERSONA_PROMPTS', () => {
  it('has all 8 archetypes', () => {
    const expected: PersonaArchetype[] = ['karen', 'newbie', 'pro', 'cheapskate', 'ghost', 'loyalist', 'drama', 'crypto'];
    for (const a of expected) {
      expect(PERSONA_PROMPTS[a]).toBeDefined();
      expect(PERSONA_PROMPTS[a].system_prompt.length).toBeGreaterThan(50);
    }
  });
});

describe('buildTicketPrompt', () => {
  it('includes persona + customer name + history', () => {
    const p = buildTicketPrompt({
      archetype: 'karen', customer_name: 'Anita Forbes', satisfaction: 30,
      past_summaries: ['Site went down for 2 hours last month — they refunded only 30%.'],
    });
    expect(p).toContain('Anita Forbes');
    expect(p).toContain('30');
    expect(p).toContain('refunded only 30');
  });

  it('handles empty history', () => {
    const p = buildTicketPrompt({ archetype: 'newbie', customer_name: 'Bob', satisfaction: 60, past_summaries: [] });
    expect(p).toContain('Bob');
    expect(p.length).toBeGreaterThan(100);
  });
});

describe('buildReplyPrompt', () => {
  it('includes player message + persona + sentiment', () => {
    const p = buildReplyPrompt({
      archetype: 'cheapskate', customer_name: 'Carl', satisfaction: 40,
      ticket_subject: 'Refund request',
      conversation: [
        { role: 'customer', text: 'I want a refund.' },
        { role: 'player', text: 'I checked the logs, no downtime occurred.' },
      ],
    });
    expect(p).toContain('Carl');
    expect(p).toContain('refund');
    expect(p).toContain('checked the logs');
  });
});
