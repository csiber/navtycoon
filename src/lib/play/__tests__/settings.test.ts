// Hyperscales — a beállítások gombjai data-action alapján kötődnek, nyelvtől függetlenül.
// (A régi kód felirat-regexszel kötött: németül a „Konto löschen" semmit sem csinált.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSettingsContent, SETTINGS_ACTIONS } from '../settings-page';
import { dailyCashFlow } from '../../game/runway';
import { NO_EFFECTS } from '../../game/upgrade-effects';
import type { ShellData } from '../shell';

const shell = (locale: 'en' | 'hu' | 'de'): ShellData => ({
  locale, company: 'Teszt Kft', initials: 'TK', displayName: 'Teszt', founded: 2026, era: 1, day: 1, nextDayAt: 0,
  cashCents: 100000, mrrCents: 1500, rep: 50, flow: dailyCashFlow({ cash_usd_cents: 0, mrr_usd_cents: 0, marketing_ppc_pct: 0 }),
  counts: { servers: 1, customers: 3, newCustomers24h: 0, openTickets: 0, upgradesOwned: 0, upgradesTotal: 20 }, era2: null,
  fleet: { capacity: 15, utilPct: 20, lost24h: 0, monthlyListedCents: 0 }, effects: { ...NO_EFFECTS },
});

describe('settings actions', () => {
  for (const locale of ['en', 'hu', 'de'] as const) {
    it(`every action button is present with data-action in ${locale}`, () => {
      const html = renderSettingsContent({
        shell: shell(locale), displayName: 'T', emailLabel: 't@example.com', city: null, preferredLang: locale,
        isPro: false, proUntil: null, llmUsed: 0, llmCap: 30, shiftsToday: 0, freeCap: 30, proCap: 100,
        aikahub: null, aikahubCsrf: 'x', aikahubError: null,
      });
      for (const a of SETTINGS_ACTIONS) expect(html).toContain(`data-action="${a}"`);
      expect(html).toMatch(/data-action="delete-account" data-confirm="[^"]+"/);
    });
  }
  it('the page script binds by data-action, not by button label', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../pages/play/settings.astro', import.meta.url)), 'utf8');
    expect(src).toContain("querySelectorAll('[data-action]')");
    expect(src).not.toMatch(/\/Delete account\|Fiók törlése\/\.test/);
    expect(src).not.toMatch(/\/Reset save\|Mentés törlése\/\.test/);
    for (const a of SETTINGS_ACTIONS) expect(src).toContain(`'${a}'`);
  });
});
