// src/lib/game/staff-drama.ts
// Hyperscales — a csapatdráma (staff_drama) egy VALÓDI munkatársról (2026-11-12, csapat-kör).
//
// Korábban a staff_drama csapat nélkül is jött, egy kitalált „Lin"-ről, és a döntésnek nem volt tétje a csapatra.
// Most csak akkor jön, ha van csapat (event-pool has_staff), vagy ha valakinek 35 alá esik a hangulata (tick.ts
// 2.4.); a data_json-ban ott a munkatárs (staff_id, name, role, why). A három döntés valódi:
//  - give_raise: +20% bér (végleg), a hangulata 75-re ugrik — a bérspirál innen is jöhet;
//  - fridays_off: négynapos hét — ingyen, +25 hangulat, de 20%-kal kevesebbet dolgozik (végleg);
//  - let_her_walk: elmegy — −2 hírnév, −3 elégedettség mindenkinél (átadás-kavarodás).
// A régi, munkatárs nélküli sorok (a migráció előtt keletkezett staff_drama) a régi szabállyal zárulnak le.

import type { StaffRule, StaffRole } from './economy';
import type { StaffMember } from './staff';
import { staffSalaryCents } from './staff';

type Loc = 'en' | 'hu' | 'de';

export interface DramaData { staff_id: number; name: string; role: StaffRole; why?: string }

export function dramaData(json: string | null | undefined): DramaData | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json) as Partial<DramaData>;
    if (!d || !Number(d.staff_id)) return null;
    return { staff_id: Number(d.staff_id), name: String(d.name ?? ''), role: (d.role ?? 'support') as StaffRole, why: d.why };
  } catch { return null; }
}

const ROLE: Record<Loc, Record<StaffRole, string>> = {
  en: { support: 'support agent', sre: 'SRE', sales: 'salesperson' },
  hu: { support: 'ügyfélszolgálatos', sre: 'SRE', sales: 'értékesítő' },
  de: { support: 'Support-Mitarbeiter', sre: 'SRE', sales: 'Vertriebler' },
};

const T: Record<Loc, Record<string, string>> = {
  en: {
    title: '🎭 Staff drama: {name} ({role}) is close to quitting',
    why_overwork: 'Too much work for too long — the queue never ends.',
    why_money: 'Payday felt shaky; the company is in debt.',
    why_mood: 'Morale has been sliding for a while.',
    why_random: 'A rough week, and it all came out in the 1:1.',
    narrative: '{why} {name} wants something to change, or they are out.',
    'give_raise.label': 'Give a {p}% raise (+{v}/mo)',
    'give_raise.desc': 'They stay and their mood jumps. The salary stays higher for good.',
    'give_raise.msg': '{name} stays — happier, and a bit more expensive.',
    'fridays_off.label': 'Four-day week (free)',
    'fridays_off.desc': 'No extra cost, mood +{m}, but they get {o}% less done from now on.',
    'fridays_off.msg': '{name} is grateful. Fridays are quieter now — for them.',
    'let_her_walk.label': 'Let them go',
    'let_her_walk.desc': 'No salary any more, but the handover hurts: reputation −{r}, satisfaction −{s} for everyone.',
    'let_her_walk.msg': '{name} left. The handover was messy.',
    gone: '{name} is no longer on the team.',
  },
  hu: {
    title: '🎭 Csapatdráma: {name} ({role}) a felmondás szélén',
    why_overwork: 'Túl sok munka, túl régóta — a sor sosem fogy el.',
    why_money: 'Bizonytalan volt a fizetés: a cég tartozásban van.',
    why_mood: 'A hangulata már egy ideje romlik.',
    why_random: 'Nehéz hét volt, és a négyszemközti beszélgetésen minden kijött.',
    narrative: '{why} {name} azt kéri, hogy változzon valami, különben megy.',
    'give_raise.label': 'Adj {p}% emelést (+{v}/hó)',
    'give_raise.desc': 'Marad, és sokkal jobb kedve lesz. A bére végleg magasabb marad.',
    'give_raise.msg': '{name} marad — jobb kedvvel, és kicsit drágábban.',
    'fridays_off.label': 'Négynapos hét (ingyen)',
    'fridays_off.desc': 'Nem kerül pénzbe, +{m} hangulat, de innentől {o}%-kal kevesebbet dolgozik.',
    'fridays_off.msg': '{name} hálás. A péntekek csendesebbek — neki.',
    'let_her_walk.label': 'Engedd el',
    'let_her_walk.desc': 'Nincs több bére, de az átadás fáj: hírnév −{r}, elégedettség −{s} mindenkinél.',
    'let_her_walk.msg': '{name} elment. Az átadás kaotikus volt.',
    gone: '{name} már nincs a csapatban.',
  },
  de: {
    title: '🎭 Team-Drama: {name} ({role}) steht kurz vor der Kündigung',
    why_overwork: 'Zu viel Arbeit, zu lange — die Warteschlange wird nie leer.',
    why_money: 'Das Gehalt war unsicher: die Firma ist verschuldet.',
    why_mood: 'Die Stimmung sinkt schon eine Weile.',
    why_random: 'Eine harte Woche, und im Einzelgespräch kam alles raus.',
    narrative: '{why} {name} will, dass sich etwas ändert — sonst ist Schluss.',
    'give_raise.label': '{p}% Gehaltserhöhung (+{v}/Monat)',
    'give_raise.desc': 'Bleibt, und die Stimmung steigt stark. Das Gehalt bleibt dauerhaft höher.',
    'give_raise.msg': '{name} bleibt — zufriedener und etwas teurer.',
    'fridays_off.label': 'Vier-Tage-Woche (kostenlos)',
    'fridays_off.desc': 'Kostet nichts, Stimmung +{m}, aber ab jetzt {o}% weniger Arbeit.',
    'fridays_off.msg': '{name} ist dankbar. Freitags ist es jetzt ruhiger — für {name}.',
    'let_her_walk.label': 'Gehen lassen',
    'let_her_walk.desc': 'Kein Gehalt mehr, aber die Übergabe schmerzt: Ruf −{r}, Zufriedenheit −{s} bei allen.',
    'let_her_walk.msg': '{name} ist gegangen. Die Übergabe war chaotisch.',
    gone: '{name} ist nicht mehr im Team.',
  },
};

export const STAFF_DRAMA_STRINGS = T;

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
const usd = (c: number) => '$' + Math.round(c / 100).toLocaleString('en-US');

/** A felület szövegei (cím, leírás, három döntés) a munkatárs adataival. */
export function dramaView(
  rule: StaffRule, loc: Loc, d: DramaData, member: StaffMember | null, now: number,
): { title: string; narrative: string; options: Array<{ id: string; label: string; description: string; cost_cents: number }> } {
  const t = T[loc] ?? T.en;
  const role = (ROLE[loc] ?? ROLE.en)[d.role] ?? d.role;
  const raise = member ? Math.round(staffSalaryCents(rule, member, now) * rule.drama.raise_pct / 100) : 0;
  const why = t[`why_${d.why ?? 'mood'}`] ?? t.why_mood;
  const p = {
    name: d.name, role, why, p: rule.drama.raise_pct, v: usd(raise), m: rule.drama.four_day_morale,
    o: Math.round((1 - rule.drama.four_day_output) * 100), r: rule.drama.leave_rep, s: rule.drama.leave_sat,
  };
  const opt = (id: string) => ({ id, label: fill(t[`${id}.label`], p), description: fill(t[`${id}.desc`], p), cost_cents: 0 });
  return {
    title: fill(t.title, p),
    narrative: fill(t.narrative, p),
    options: member && member.four_day ? [opt('give_raise'), opt('let_her_walk')] : [opt('give_raise'), opt('fridays_off'), opt('let_her_walk')],
  };
}

export function dramaMessage(loc: Loc, optionId: string, name: string): string {
  const t = T[loc] ?? T.en;
  return fill(t[`${optionId}.msg`] ?? t.gone, { name });
}

export function dramaGoneMessage(loc: Loc, name: string): string {
  return fill((T[loc] ?? T.en).gone, { name });
}
