// Hyperscaler — event-options definíciók tesztelése.
// Garantálja, hogy minden EventType-hez van legalább 2 választható opció,
// és minden opció érvényes EventOptionResult-ot ad vissza.

import { describe, it, expect } from 'vitest';
import { EVENT_DEFINITIONS, getEventDefinition } from '../event-options';
import type { EventType } from '../types';

describe('EVENT_DEFINITIONS', () => {
  const ALL_TYPES: EventType[] = [
    'ddos_attempt',
    'viral_blog',
    'electricity_spike',
    'recruit_ad',
    'intern_incident',
    'dmca',
    'cooling_failure',
    'security_breach',
  ];

  it('all 8 event-types have definitions with >= 2 options', () => {
    for (const t of ALL_TYPES) {
      const def = EVENT_DEFINITIONS[t];
      expect(def, `missing definition for ${t}`).toBeDefined();
      expect(def.options.length).toBeGreaterThanOrEqual(2);
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.narrative.length).toBeGreaterThan(10);
    }
  });

  it('every option returns a valid EventOptionResult', () => {
    for (const def of Object.values(EVENT_DEFINITIONS)) {
      for (const opt of def.options) {
        expect(opt.id).toMatch(/^[a-z_]+$/);
        expect(opt.label.length).toBeGreaterThan(0);
        expect(opt.description.length).toBeGreaterThan(0);
        const r = opt.apply();
        expect(['positive', 'neutral', 'negative']).toContain(r.outcome);
        expect(typeof r.cash_delta_cents).toBe('number');
        expect(typeof r.satisfaction_delta_global).toBe('number');
        expect(typeof r.reputation_delta).toBe('number');
        expect(r.message.length).toBeGreaterThan(5);
      }
    }
  });

  it('option-ids are unique within each event', () => {
    for (const def of Object.values(EVENT_DEFINITIONS)) {
      const ids = def.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('getEventDefinition returns the definition for known types', () => {
    expect(getEventDefinition('ddos_attempt')?.event_type).toBe('ddos_attempt');
    expect(getEventDefinition('viral_blog')?.event_type).toBe('viral_blog');
  });

  it('getEventDefinition returns null for unknown', () => {
    expect(getEventDefinition('nonexistent' as EventType)).toBeNull();
  });
});
