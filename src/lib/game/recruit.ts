// src/lib/game/recruit.ts
// Hyperscales — a „tehetséges rendszergazda jelentkezett" esemény (recruit_ad) valódi munkatársat ad
// (2026-11-12, csapat-utókör; Csaba döntése).
//
//  - A 2. korszaktól (a Csapat élő szabályaival) a tick a spawnkor kisorsol egy jelöltet (staff.recruitCandidate:
//    mindig SRE, 2. szintről indul, a jelleme véletlen), és a data_json-ba teszi ({ recruit: {...} }).
//  - Két döntés: „hire" — felveszi, FELVÉTELI DÍJ NÉLKÜL (máskor fél havi bér), a szokásos bérrel; „pass" — semmi.
//    A létszámkorlát a szokásos (2. korszak 3, 3. korszak 6 fő): ha tele a csapat, a „hire" gomb tiltott, a
//    felirat megmondja, miért, és a szerver is elutasítja (staff_full).
//  - Az 1. korszakban a RÉGI viselkedés marad (egyszeri, a cég méretével skálázott díj, +2 hírnév, +2 elégedettség):
//    a szimulátorban (40 seed, 90 nap) az esemény kivétele az 1. korszakból az alkalmi játékos 2. korszakát
//    24 → 33 napra tolta (medián), és a 3. korszakig jutók aránya 25/40 → 18/40-re esett — az esemény ott a ritka
//    olcsó hírnév-források egyike (a többi esemény költséges), a helyét drága események vették volna át.
//    A felirata viszont a valódi hatást mondja (a régi „−50% incidens 30 napig" nem létezett).
//  - A régi, adat nélküli recruit_ad sorok (a kör előtt keletkezettek) a régi szabállyal zárulnak le.

import type { StaffRule, StaffTrait } from './economy';
import type { StaffCandidate, StaffMember } from './staff';
import { candidateSalaryCents, hireFeeCents, maxStaff } from './staff';
import { pt, type PlayKey, type PlayLocale } from '../play/strings';

export interface RecruitData { recruit: StaffCandidate }

export function recruitData(json: string | null | undefined): RecruitData | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json) as { recruit?: Partial<StaffCandidate> };
    const c = d?.recruit;
    if (!c || typeof c.name !== 'string' || !c.name || c.role !== 'sre') return null;
    const base = Number(c.base_salary_cents);
    if (!Number.isFinite(base) || base <= 0) return null;
    return {
      recruit: {
        key: 'recruit', role: 'sre', name: c.name, trait: (c.trait ?? 'steady') as StaffTrait,
        level_start: Math.max(1, Math.min(3, Number(c.level_start) || 1)), base_salary_cents: base,
      },
    };
  } catch { return null; }
}

const usd = (c: number) => '$' + Math.round(c / 100).toLocaleString('en-US');

export interface RecruitOption { id: string; label: string; description: string; cost_cents: number; disabled?: boolean }

/** Felvehető-e most: van szabad hely ebben a korszakban (és nincs már ilyen nevű munkatárs). */
export function recruitCanHire(rule: StaffRule, era: number, staff: Pick<StaffMember, 'name'>[], d: RecruitData): boolean {
  return staff.length < maxStaff(rule, era) && !staff.some((m) => m.name === d.recruit.name);
}

/** A felület szövegei (cím, leírás, két döntés) a jelölt adataival; teli csapatnál a „hire" tiltott. */
export function recruitView(
  rule: StaffRule, loc: PlayLocale, d: RecruitData, era: number, staff: Pick<StaffMember, 'name'>[],
): { title: string; narrative: string; options: RecruitOption[] } {
  const c = d.recruit;
  const max = maxStaff(rule, era);
  const p = {
    name: c.name, trait: loc === 'de' ? pt(loc, `tm.trait.${c.trait}` as PlayKey) : pt(loc, `tm.trait.${c.trait}` as PlayKey).toLowerCase(), lvl: c.level_start,
    salary: usd(candidateSalaryCents(rule, c)), fee: usd(hireFeeCents(rule, c)), n: staff.length, max,
  };
  const can = recruitCanHire(rule, era, staff, d);
  const hire: RecruitOption = can
    ? { id: 'hire', label: pt(loc, 'rc.hire.label', p), description: pt(loc, 'rc.hire.desc', p), cost_cents: 0 }
    : { id: 'hire', label: pt(loc, 'rc.hire.full_label', p), description: pt(loc, 'rc.hire.full_desc', p), cost_cents: 0, disabled: true };
  return {
    title: pt(loc, 'rc.title', p),
    narrative: pt(loc, 'rc.narrative', p),
    options: [hire, { id: 'pass', label: pt(loc, 'rc.pass.label', p), description: pt(loc, 'rc.pass.desc', p), cost_cents: 0 }],
  };
}

export function recruitMessage(loc: PlayLocale, optionId: 'hire' | 'pass', name: string): string {
  return pt(loc, optionId === 'hire' ? 'rc.hire.msg' : 'rc.pass.msg', { name });
}
