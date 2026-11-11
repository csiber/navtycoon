// Hyperscales — esemény-fordítások tesztje (hu/de teljesség, angol tartalék).

import { describe, it, expect } from 'vitest';
import { EVENT_DEFINITIONS } from '../event-options';
import { localizeEvent, localizeEventMessage } from '../event-i18n';

const LOCALES = ['hu', 'de'] as const;
const defs = Object.values(EVENT_DEFINITIONS);
const money = (s: string) => s.match(/\$[\d,]+k?/g) ?? [];

describe('event-i18n', () => {
  for (const loc of LOCALES) {
    it(`${loc}: every event/option is fully translated`, () => {
      for (const def of defs) {
        const l = localizeEvent(def, loc);
        expect(l.title.length).toBeGreaterThan(0);
        expect(l.title).not.toBe(def.title);
        expect(l.narrative).not.toBe(def.narrative);
        expect(l.narrative.length).toBeGreaterThan(0);
        expect(l.options).toHaveLength(def.options.length);
        for (const o of def.options) {
          const lo = l.options.find((x) => x.id === o.id)!;
          expect(lo.label.length).toBeGreaterThan(0);
          expect(lo.label).not.toBe(o.label);
          expect(lo.description).not.toBe(o.description);
          const msg = localizeEventMessage(def.event_type, o.id, loc, '__FALLBACK__');
          expect(msg).not.toBe('__FALLBACK__');
          expect(msg.length).toBeGreaterThan(0);
        }
      }
    });

    it(`${loc}: dollar amounts survive in labels`, () => {
      for (const def of defs) {
        const l = localizeEvent(def, loc);
        for (const o of def.options) {
          const lo = l.options.find((x) => x.id === o.id)!;
          for (const m of money(o.label)) expect(lo.label).toContain(m);
        }
      }
    });
  }

  it('en returns the English original', () => {
    const def = EVENT_DEFINITIONS.ddos_attempt;
    const l = localizeEvent(def, 'en');
    expect(l.title).toBe(def.title);
    expect(l.options[0].label).toBe(def.options[0].label);
  });

  it('unknown locale / key falls back to English', () => {
    const def = EVENT_DEFINITIONS.dmca;
    expect(localizeEvent(def, 'fr' as never).title).toBe(def.title);
    expect(localizeEventMessage('nope', 'nope', 'hu', 'EN msg')).toBe('EN msg');
    expect(localizeEventMessage('dmca', 'nope', 'de', 'EN msg')).toBe('EN msg');
  });
});
