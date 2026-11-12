import { describe, it, expect } from 'vitest';
import { MARKETPLACE_SEEDS } from '../npc-seeds';
import { translateListing } from '../translations';
import { npcArchetypeLabel, LOCALES } from '../../i18n';
import { NPC_CHARACTERS } from '../../game/npc-characters';

describe('piactéri NPC-hirdetések fordítása', () => {
  it('minden seed-hirdetésnek van HU és DE változata', () => {
    for (const s of MARKETPLACE_SEEDS) {
      for (const lang of ['hu', 'de'] as const) {
        const tr = translateListing(lang, { title: s.title, body: s.body });
        expect(tr.body, `${lang}: ${s.title}`).not.toBe(s.body);
      }
    }
  });

  it('a HU szövegben nincsenek köznyelvi angol szavak (a szakmai rövidítések maradhatnak)', () => {
    const banned = /\b(Karen|side project|principal engineer|tier\b|Hobby\b|sat \d|setup|signup|engagement|deliverable|lock in|upgrade|staging|support|account|refund|audit-ready|white-glove|on-call|bay\b|WTB|fire-sale)/i;
    for (const s of MARKETPLACE_SEEDS) {
      const tr = translateListing('hu', { title: s.title, body: s.body });
      // a „tier-1" hálózati szakkifejezés (peering/tranzit) marad
      const text = (tr.title + ' ' + tr.body).replace(/tier-1/g, '');
      expect(text, s.title).not.toMatch(banned);
    }
  });
});

describe('NPC-archetípus jelvény', () => {
  it('minden NPC-archetípusnak van felirata mindhárom nyelven', () => {
    const archetypes = [...new Set(NPC_CHARACTERS.map((c) => c.archetype))];
    expect(archetypes.length).toBeGreaterThan(0);
    for (const a of archetypes) {
      for (const L of LOCALES) {
        const label = npcArchetypeLabel(L, a);
        expect(label, `${L}/${a}`).not.toContain('_');
      }
      expect(npcArchetypeLabel('hu', a)).not.toBe(npcArchetypeLabel('en', a));
    }
  });
  it('ismeretlen archetípusnál olvasható tartalék', () => {
    expect(npcArchetypeLabel('hu', 'brand_new_type')).toBe('brand new type');
  });
});
