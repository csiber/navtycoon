import { describe, it, expect } from 'vitest';
import { spawnCustomer, getPlaceholderTicketForPersona } from '../customer-spawn';
import { PERSONAS } from '../persona-pool';

describe('spawnCustomer', () => {
  it('returns valid persona + ticket text', () => {
    const c = spawnCustomer();
    expect(c.name.length).toBeGreaterThan(2);
    expect(PERSONAS.find(p => p.archetype === c.persona_archetype)).toBeDefined();
    expect(c.initial_ticket_text.length).toBeGreaterThan(2);
  });

  it('100 spawns produce variety', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(spawnCustomer().persona_archetype);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('plan_tier defaults to hobby; explicit tier persists', () => {
    expect(spawnCustomer().plan_tier).toBe('hobby');
    expect(spawnCustomer('vps').plan_tier).toBe('vps');
  });
});

describe('getPlaceholderTicketForPersona', () => {
  it('all 8 personas have placeholder tickets', () => {
    for (const p of PERSONAS) {
      const t = getPlaceholderTicketForPersona(p.archetype);
      expect(t.length).toBeGreaterThan(2);
    }
  });
});
