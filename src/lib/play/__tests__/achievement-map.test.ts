// Hyperscales — a /play toast-térkép (achievementMap) a rejtett, még meg nem szerzett achievementek nevét nem adja ki
// (2026-11-13); megszerzés után igen. A toast a frissen feloldott rejtett nevét a szerver válaszából veszi
// (GET /api/game/achievements `title_local`, achievementCell).
import { describe, it, expect } from 'vitest';
import { achievementMap, achievementCell, achievementTitle, HIDDEN_TITLE } from '../achievements-i18n';
import { ACHIEVEMENTS } from '../../game/achievements';

const HIDDEN = ACHIEVEMENTS.filter((a) => a.hidden);

describe('achievementMap (toast data)', () => {
  it('there are hidden achievements to protect', () => {
    expect(HIDDEN.length).toBeGreaterThanOrEqual(3);
  });

  for (const locale of ['en', 'hu', 'de'] as const) {
    it(`${locale}: hidden, not-yet-unlocked achievements are omitted — no name, no description in the payload`, () => {
      const map = achievementMap(locale);
      const json = JSON.stringify(map);
      for (const a of HIDDEN) {
        expect(map[a.id]).toBeUndefined();
        expect(json).not.toContain(achievementTitle(locale, a.id));
        expect(json).not.toContain(a.title);
      }
      // a nem rejtettek mind benne vannak
      for (const a of ACHIEVEMENTS.filter((x) => !x.hidden)) expect(map[a.id]?.title).toBe(achievementTitle(locale, a.id));
    });
  }

  it('an unlocked hidden achievement is included with its real (localized) name', () => {
    const map = achievementMap('hu', ['refund_king', 'first_shift']);
    expect(map.refund_king.title).toBe(achievementTitle('hu', 'refund_king'));
    expect(map.comeback_kid).toBeUndefined();
    expect(map.speedrun_hyperscaler).toBeUndefined();
  });

  it('the server cell (title_local) masks until unlocked, then gives the real name', () => {
    expect(achievementCell('de', 'speedrun_hyperscaler', false).title).toBe(HIDDEN_TITLE);
    expect(achievementCell('de', 'speedrun_hyperscaler', true).title).toBe(achievementTitle('de', 'speedrun_hyperscaler'));
  });
});
