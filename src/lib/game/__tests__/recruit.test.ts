// Csapat-utókör (2026-11-12): a toborzás (recruit_ad) a 2. korszaktól valódi munkatársat ad; a felvásárlás $6000;
// a piactéri peering kedvezményes havidíja (network.ts kódolás).
import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../economy';
import { recruitCandidate, maxStaff, candidateSalaryCents, hireFeeCents, STAFF_NAMES } from '../staff';
import { recruitData, recruitView, recruitCanHire, recruitMessage } from '../recruit';
import { eventPoolForEra } from '../event-pool';
import { EVENT_DEFINITIONS } from '../event-options';
import { localizeEvent } from '../event-i18n';
import { decodePeering, encodePeering, networkMonthlyCents } from '../network';
import { simulate } from '../economy-sim';

const SR = ECONOMY.staff!;
const NR = ECONOMY.network!;

describe('recruit_ad: valódi munkatárs a 2. korszaktól', () => {
  it('a jelölt determinisztikus, SRE, 2. szintről indul, és kerüli a meglévő neveket', () => {
    const a = recruitCandidate(SR, 'p1:1000');
    expect(recruitCandidate(SR, 'p1:1000')).toEqual(a);
    expect(a.role).toBe('sre');
    expect(a.level_start).toBe(2);
    expect(STAFF_NAMES).toContain(a.name);
    const b = recruitCandidate(SR, 'p1:1000', [a.name]);
    expect(b.name).not.toBe(a.name);
  });

  it('a data_json oda-vissza átmegy; hibás vagy régi (adat nélküli) sor → null (régi szabály)', () => {
    const c = recruitCandidate(SR, 'x:1');
    expect(recruitData(JSON.stringify({ recruit: c }))?.recruit).toEqual(c);
    expect(recruitData(null)).toBeNull();
    expect(recruitData('{"staff_id":3}')).toBeNull();
    expect(recruitData('nem json')).toBeNull();
    expect(recruitData(JSON.stringify({ recruit: { ...c, role: 'sales' } }))).toBeNull();
  });

  it('van hely → felvehető, díj nélkül, a feliratban a valódi bér; teli csapat → a felvétel tiltott, a felirat megmondja', () => {
    const d = { recruit: recruitCandidate(SR, 'y:2') };
    const salary = '$' + Math.round(candidateSalaryCents(SR, d.recruit) / 100);
    const v = recruitView(SR, 'hu', d, 2, []);
    expect(v.options.map((o) => o.id)).toEqual(['hire', 'pass']);
    expect(v.options[0].disabled).toBeFalsy();
    expect(v.options[0].label).toContain(salary);
    expect(v.options[0].cost_cents).toBe(0);
    expect(v.narrative).toContain('$' + Math.round(hireFeeCents(SR, d.recruit) / 100)); // „máskor $X" — a megspórolt díj
    expect(v.title).toContain(d.recruit.name);

    const full2 = Array.from({ length: maxStaff(SR, 2) }, (_, i) => ({ name: `N${i}` }));
    expect(full2).toHaveLength(3);
    const f = recruitView(SR, 'hu', d, 2, full2);
    expect(f.options[0].disabled).toBe(true);
    expect(f.options[0].description).toContain('3/3');
    expect(recruitCanHire(SR, 2, full2, d)).toBe(false);
    // a 3. korszakban 6 a korlát: ugyanaz a 3 fős csapat már bővíthető
    expect(recruitCanHire(SR, 3, full2, d)).toBe(true);
    const full3 = Array.from({ length: 6 }, (_, i) => ({ name: `N${i}` }));
    expect(recruitView(SR, 'en', d, 3, full3).options[0].disabled).toBe(true);
    // azonos nevű munkatárs már van → nem vehető fel még egyszer
    expect(recruitCanHire(SR, 2, [{ name: d.recruit.name }], d)).toBe(false);
  });

  it('mindhárom nyelven van szöveg (nem a kulcs)', () => {
    const d = { recruit: recruitCandidate(SR, 'z:3') };
    for (const L of ['en', 'hu', 'de'] as const) {
      const v = recruitView(SR, L, d, 2, []);
      for (const t of [v.title, v.narrative, ...v.options.flatMap((o) => [o.label, o.description])]) {
        expect(t, L).not.toMatch(/^rc\.|\{\w+\}/);
      }
      expect(recruitMessage(L, 'hire', 'Kiss Zsófia')).toContain('Kiss Zsófia');
      expect(recruitMessage(L, 'pass', 'Kiss Zsófia')).toContain('Kiss Zsófia');
    }
  });

  it('az 1. korszakban a régi esemény marad (a készletben van, a régi definícióval), a felirat a valódi hatást mondja', () => {
    expect(eventPoolForEra(1, { has_staff: false })).toContain('recruit_ad');
    const def = EVENT_DEFINITIONS.recruit_ad;
    const hire = def.options.find((o) => o.id === 'hire')!.apply();
    expect(hire.reputation_delta).toBe(2);
    expect(hire.satisfaction_delta_global).toBe(2);
    for (const L of ['en', 'hu', 'de'] as const) {
      expect(localizeEvent(def, L).options[0].description).not.toMatch(/50/);
    }
  });
});

describe('competitor_buyout: $25 000 → $6000', () => {
  it('a „take the money" $6000-t ad, és a felirat mindhárom nyelven ezt mondja', () => {
    const def = EVENT_DEFINITIONS.competitor_buyout;
    const take = def.options.find((o) => o.id === 'take_the_money')!;
    expect(take.apply().cash_delta_cents).toBe(600000);
    expect(localizeEvent(def, 'en').options[0].label).toContain('$6,000');
    expect(localizeEvent(def, 'hu').options[0].label).toContain('$6,000');
    expect(localizeEvent(def, 'de').options[0].label).toContain('$6,000');
  });

  it('a szimulátorban nincs többé $25 000-es pénzugrás (90 nap, active és casual)', () => {
    for (const profile of ['active', 'casual'] as const) {
      for (const seed of [1, 4, 5]) {
        const d = simulate(ECONOMY, profile, { days: 90, seed }).days;
        let jump = 0;
        for (let i = 1; i < d.length; i++) jump = Math.max(jump, d[i].cash_cents - d[i - 1].cash_cents);
        expect(jump, `${profile}/${seed}`).toBeLessThan(1300000); // legfeljebb két felvásárlás egy napon (~$12k), nem $25k
      }
    }
  });
});

describe('piactéri peering: kódolás a player_network.peering mezőben (migráció nélkül)', () => {
  it('0 = nincs, 1 = normál díj, ≥ 2 = a piactéri havidíj centben', () => {
    expect(decodePeering(0)).toEqual({ peering: 0, peering_monthly_cents: null });
    expect(decodePeering(1)).toEqual({ peering: 1, peering_monthly_cents: null });
    expect(decodePeering(900)).toEqual({ peering: 1, peering_monthly_cents: 900 });
    expect(decodePeering(null)).toEqual({ peering: 0, peering_monthly_cents: null });
    expect(encodePeering({ peering: 1, peering_monthly_cents: 900 })).toBe(900);
    expect(encodePeering({ peering: 1, peering_monthly_cents: null })).toBe(1);
    expect(encodePeering({ peering: 0, peering_monthly_cents: 900 })).toBe(0);
  });

  it('a havidíj a szerződés szerinti (a tranzit-kedvezmény ugyanúgy jár)', () => {
    const normal = networkMonthlyCents(NR, { transit_tier: 2, peering: 1, ddos: 0 });
    const deal = networkMonthlyCents(NR, { transit_tier: 2, peering: 1, ddos: 0, peering_monthly_cents: 900 });
    expect(normal - deal).toBe(NR.peering.monthly_cents - 900);
  });
});
