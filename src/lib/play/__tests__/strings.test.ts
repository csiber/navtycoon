// Hyperscales — a /play keret szövegei mindhárom nyelven megvannak, és a paraméterek egyeznek.
import { describe, it, expect } from 'vitest';
import { PLAY_STRINGS, pt } from '../strings';
import { EVENT_STRINGS } from '../events';
import { CATALOG_TRANSLATIONS } from '../catalog';
import { SERVER_SPECS } from '../../game/server-types';
import { UPGRADE_SPECS } from '../../game/upgrade-tree';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('play strings', () => {
  it('every key exists in en/hu/de with the same {params}', () => {
    const keys = Object.keys(PLAY_STRINGS.en);
    for (const lang of ['hu', 'de'] as const) {
      expect(Object.keys(PLAY_STRINGS[lang]).sort()).toEqual([...keys].sort());
      for (const k of keys) {
        const a = (PLAY_STRINGS.en as Record<string, string>)[k];
        const b = (PLAY_STRINGS[lang] as Record<string, string>)[k];
        expect(b, `${lang}:${k}`).toBeTruthy();
        expect(params(b), `${lang}:${k}`).toBe(params(a));
      }
    }
  });
  it('event-feed strings are complete in all languages', () => {
    const keys = Object.keys(EVENT_STRINGS.en).sort();
    expect(Object.keys(EVENT_STRINGS.hu).sort()).toEqual(keys);
    expect(Object.keys(EVENT_STRINGS.de).sort()).toEqual(keys);
  });
  it('every server type and upgrade is translated to hu and de', () => {
    for (const lang of ['hu', 'de'] as const) {
      for (const t of Object.keys(SERVER_SPECS)) expect(CATALOG_TRANSLATIONS.SERVERS[lang][t], `${lang}:${t}`).toBeTruthy();
      for (const u of UPGRADE_SPECS) expect(CATALOG_TRANSLATIONS.UPGRADES[lang][u.id], `${lang}:${u.id}`).toBeTruthy();
    }
  });
  it('pt fills params and falls back to en', () => {
    expect(pt('hu', 'top.day', { n: 3 })).toBe('3. nap');
    expect(pt('de', 'runway.days', { n: 5 })).toBe('5 Tage');
  });
  it('no awkward Hungarian left in the shell strings', () => {
    const hu = Object.values(PLAY_STRINGS.hu).join('\n');
    for (const bad of ['Futamidő', 'refund-ol', 'Élt napok', 'Égési', 'dícsér']) expect(hu).not.toContain(bad);
  });
});

import { PLACEHOLDER_TICKET_TABLES, localizePlaceholderTicket, spawnCustomer } from '../../game/customer-spawn';
describe('starter / placeholder tickets follow the player language', () => {
  it('hu and de tables mirror the en table', () => {
    for (const lang of ['hu', 'de'] as const) {
      for (const [arch, lines] of Object.entries(PLACEHOLDER_TICKET_TABLES.en)) {
        expect((PLACEHOLDER_TICKET_TABLES[lang] as Record<string, string[]>)[arch].length, `${lang}:${arch}`).toBe(lines.length);
      }
    }
  });
  it('old English rows are translated on render, other text is untouched', () => {
    expect(localizePlaceholderTicket('Disk usage is 51%. You said unlimited.', 'hu')).toBe('A tárhely 51%-on áll. Azt mondták, korlátlan.');
    expect(localizePlaceholderTicket('An LLM-written ticket', 'hu')).toBe('An LLM-written ticket');
  });
  it('spawnCustomer writes the ticket in the requested language', () => {
    const all = Object.values(PLACEHOLDER_TICKET_TABLES.de).flat();
    expect(all).toContain(spawnCustomer('hobby', 'de').initial_ticket_text);
  });
});
