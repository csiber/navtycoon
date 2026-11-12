// src/lib/game/staff.ts
// Hyperscales — a Csapat (munkatársak) szabályai EGY helyen (2026-11-12, csapat-kör).
//
// A tick (tick.ts), az API (api/game/staff.ts), a felület (play/staff-page.ts) és a szimulátor (economy-sim.ts)
// mind ezeket a tiszta függvényeket hívja. A számok az economy.ts STAFF_RULE_V3-ban vannak.
//
// Mi került be, és miért (a brief ötletei közül):
//  - Három szerepkör, mindegyik a játékmag egy meglévő gondjára válasz:
//      · ügyfélszolgálatos (support): félnaponta megold néhány ticketet (napi 4/6/8 szintenként), de
//        gyengébben, mint a játékos műszakja (+4 elégedettség a te ~+8-adhoz képest), a morcos (30 alatti)
//        ügyfelet és a nagy ügyfelet rád hagyja. Ez a 2. korszak fő szűk keresztmetszete: a napi egy műszak
//        10 ticketje 100+ ügyfélnél kevés, a ki nem szolgált ticket 48 óra után ügyfelet visz.
//      · SRE: kevesebb incidens (−10/−15/−20% ticket), és a hardver- és hálózati események egy része elmarad.
//      · értékesítő (sales): +15/25/35% új ügyfél — de csak ha van hova tenni (teli flottánál kidobott pénz).
//    A könyvelő kimaradt: a 2. korszak havidíjai ($100–$300/hó) mellett egy 10%-os díjcsökkentés kevesebbet
//    hozna, mint bármilyen értelmes bér — csapda lenne. A kifutás-előrejelzést a Pénzügy lap ingyen is mutatja.
//  - Szint (1–3): a munkában töltött napokkal nő (14. és 42. nap; „gyorsan tanuló": fele), a szintlépés
//    többet ér, de emelést is hoz (×1,35, ×1,7) — ebből jön a bérspirál, ha valaki mindenkit megtart.
//  - Hangulat (0–100): félnaponta romlik túlterhelésnél, tartozásnál, kevés pénznél; különben lassan javul.
//    40 alatt gyengébben dolgozik, 35 alatt szól (csapatdráma valódi döntéssel), 20 alatt felmond.
//  - Jellem (4 féle, kicsi hatással): nyugodt (fele annyit romlik a hangulata), gyorsan tanuló, szerény
//    (15%-kal kisebb bér), maximalista (15%-kal jobb, de a túlterhelést rosszabbul viseli).
//  - Felvétel: naponta 3 jelölt, MI nélkül, sablonból (név, szerep, szint, jellem) — a játékos azonosítójából
//    és a napból determinisztikusan, így nem kell jelölt-tábla és az MI-keretet sem terheli.
//  - Korlát: a 2. korszakban 3, a 3.-tól 6 fő. Felvételi díj: fél havi bér (toborzás).
//  - Tartozásnál előbb a legkevésbé hasznos ember megy (pickLeastUseful), csak utána a gép.

import {
  type StaffRule, type StaffRole, type StaffTrait, STAFF_ROLES, STAFF_TRAITS, LOW_CASH_WARN_CENTS,
} from './economy';
import type { UpgradeEffects } from './upgrade-effects';

export interface StaffMember {
  id: number;
  role: StaffRole;
  name: string;
  trait: StaffTrait;
  level_start: number;
  /** Az 1. szintű havi bér (a jellemmel), cent. */
  base_salary_cents: number;
  /** A csapatdrámában adott emelések összege (%). */
  raise_pct: number;
  morale: number;
  hired_at: number;
  /** 1 = négynapos hét (a csapatdrámában kérte): jobb hangulat, kevesebb munka. */
  four_day: number;
}

export interface StaffCandidate {
  /** „nap.hely" — a felvétel ezzel kéri (a szerver újraszámolja, nem bízik a kliensben). */
  key: string;
  role: StaffRole;
  name: string;
  trait: StaffTrait;
  level_start: number;
  base_salary_cents: number;
}

const DAY = 86400;
const isRole = (r: string): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r);
const isTrait = (t: string): t is StaffTrait => (STAFF_TRAITS as readonly string[]).includes(t);

/** Egy DB-sor → StaffMember (ismeretlen szerepkör/jellem esetén null: azt nem számoljuk). */
export function staffFromRow(r: Record<string, unknown>): StaffMember | null {
  const role = String(r.role ?? '');
  const trait = String(r.trait ?? '');
  if (!isRole(role)) return null;
  return {
    id: Number(r.id) || 0,
    role,
    name: String(r.name ?? ''),
    trait: isTrait(trait) ? trait : 'steady',
    level_start: Math.max(1, Math.min(3, Number(r.level_start) || 1)),
    base_salary_cents: Math.max(0, Number(r.base_salary_cents) || 0),
    raise_pct: Math.max(0, Number(r.raise_pct) || 0),
    morale: Math.max(0, Math.min(100, Number(r.morale ?? 70))),
    hired_at: Number(r.hired_at) || 0,
    four_day: Number(r.four_day) ? 1 : 0,
  };
}

/** Legfeljebb ennyi munkatárs lehet ebben a korszakban. */
export function maxStaff(rule: StaffRule | null, era: number): number {
  if (!rule || era < rule.min_era) return 0;
  return rule.max_by_era[era] ?? rule.max_by_era[Math.max(...Object.keys(rule.max_by_era).map(Number))] ?? 0;
}

/** A szint (1–3) a munkában töltött napokból. */
export function staffLevel(rule: StaffRule, m: Pick<StaffMember, 'level_start' | 'hired_at' | 'trait'>, now: number): number {
  const days = Math.max(0, (now - m.hired_at) / DAY);
  const div = m.trait === 'fast_learner' ? 2 : 1;
  const ups = (days >= rule.level_days[1] / div ? 2 : days >= rule.level_days[0] / div ? 1 : 0);
  return Math.max(1, Math.min(3, m.level_start + ups));
}

/** A következő szintlépésig hátralévő napok (null, ha már 3. szintű). */
export function daysToNextLevel(rule: StaffRule, m: Pick<StaffMember, 'level_start' | 'hired_at' | 'trait'>, now: number): number | null {
  const lvl = staffLevel(rule, m, now);
  if (lvl >= 3) return null;
  const div = m.trait === 'fast_learner' ? 2 : 1;
  const ups = lvl - m.level_start; // eddigi lépések
  const need = rule.level_days[Math.min(1, ups)] / div;
  return Math.max(0, Math.ceil(need - (now - m.hired_at) / DAY));
}

/** Havi bér most (cent, egész dollárra kerekítve): alapbér × szint-szorzó × (1 + emelések). */
export function staffSalaryCents(rule: StaffRule, m: StaffMember, now: number): number {
  const lvl = staffLevel(rule, m, now);
  const v = m.base_salary_cents * rule.level_salary[lvl - 1] * (1 + m.raise_pct / 100);
  return Math.round(v / 100) * 100;
}

/** Az összes havi bér (cent). */
export function totalSalaryCents(rule: StaffRule | null, members: StaffMember[], now: number): number {
  if (!rule) return 0;
  return members.reduce((a, m) => a + staffSalaryCents(rule, m, now), 0);
}

/** Mennyire dolgozik jól most (1 = teljes): rossz hangulat, négynapos hét, maximalista. */
export function staffOutput(rule: StaffRule, m: StaffMember): number {
  let f = 1;
  if (m.morale < rule.morale.slump_below) f *= rule.morale.slump_factor;
  if (m.four_day) f *= rule.drama.four_day_output;
  if (m.trait === 'perfectionist') f *= 1.15;
  return f;
}

/** A csapat hatása a meglévő hatás-kulcsokon (upgrade-effects.ts): az SRE és az értékesítő. */
export function staffEffects(rule: StaffRule | null, members: StaffMember[], now: number): Partial<UpgradeEffects> {
  const out: Partial<UpgradeEffects> = {};
  if (!rule) return out;
  const add = (k: keyof UpgradeEffects, v: number) => { out[k] = (out[k] ?? 0) + v; };
  for (const m of members) {
    const i = staffLevel(rule, m, now) - 1;
    const f = staffOutput(rule, m);
    if (m.role === 'sre') {
      add('ticket_pct', rule.sre_ticket_pct[i] * f);
      add('avoid_hardware', rule.sre_avoid_hardware[i] * f);
      add('avoid_network', rule.sre_avoid_network[i] * f);
    } else if (m.role === 'sales') {
      add('acq_pct', rule.sales_acq_pct[i] * f);
    }
  }
  return out;
}

/** Egy ügyfélszolgálatos ennyi ticketet old meg egy félnapban. */
export function supportShare(rule: StaffRule, m: StaffMember, now: number): number {
  if (m.role !== 'support') return 0;
  const perDay = rule.support_tickets_per_day[staffLevel(rule, m, now) - 1] * staffOutput(rule, m);
  return Math.max(0, Math.round(perDay / 2));
}

/** Az ügyfélszolgálat napi kerete (a felülethez). */
export function supportPerDay(rule: StaffRule | null, members: StaffMember[], now: number): number {
  if (!rule) return 0;
  return members.reduce((a, m) => a + supportShare(rule, m, now) * 2, 0);
}

/** Az ügyfélszolgálatos válasza egy ticketre: +reply, aztán a lezárás (action-handler szabálya). Új elégedettség. */
export function supportResolveSat(rule: StaffRule, sat: number): number {
  const s = Math.max(-100, Math.min(100, sat + rule.support_reply_sat));
  const close = s >= 50 ? 5 : s >= 30 ? 0 : -30;
  return Math.max(-100, Math.min(100, s + close));
}

export interface MoraleCtx {
  /** A szerepköre szerint túl van-e terhelve (support: hosszú sor; SRE: túlterhelt gépek/hálózat; sales: teli flotta). */
  overworked: boolean;
  cash_cents: number;
}

/** A hangulat félnaponként. */
export function moraleStep(rule: StaffRule, m: StaffMember, ctx: MoraleCtx): number {
  const mr = rule.morale;
  let loss = 0;
  if (ctx.overworked) loss += mr.overwork * (m.trait === 'perfectionist' ? 1.5 : 1);
  if (ctx.cash_cents < 0) loss += mr.debt;
  else if (ctx.cash_cents < LOW_CASH_WARN_CENTS) loss += mr.low_cash;
  if (m.trait === 'steady') loss *= 0.5;
  if (loss > 0) return Math.max(0, Math.round(m.morale - loss));
  return m.morale < mr.cap ? Math.min(mr.cap, m.morale + mr.drift) : m.morale;
}

/** Melyik munkatárs megy el először, ha nem tudod kifizetni (a legkevésbé hasznos): teli flottánál az
 *  értékesítő (a munkája kárba megy), különben a legkisebb szintű, azonos szintnél a legdrágább. Index vagy −1. */
export function pickLeastUseful(rule: StaffRule, members: StaffMember[], now: number, ctx: { fleet_full: boolean }): number {
  let best = -1;
  let bestScore = Infinity;
  members.forEach((m, i) => {
    const wasted = m.role === 'sales' && ctx.fleet_full;
    const score = (wasted ? 0 : staffLevel(rule, m, now) * staffOutput(rule, m) * 10) - staffSalaryCents(rule, m, now) / 100000;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** A felvételi díj (cent): fél havi bér, egész dollárra. */
export function hireFeeCents(rule: StaffRule, c: Pick<StaffCandidate, 'base_salary_cents' | 'level_start'>): number {
  return Math.round((c.base_salary_cents * rule.level_salary[c.level_start - 1] * rule.hire_fee_months) / 100) * 100;
}

// ─── Jelöltek (MI nélkül, sablonból) ───

/** Nevek: magyar, angol és német (a játékos nyelvétől független — a cég nemzetközi). */
export const STAFF_NAMES: readonly string[] = [
  'Kovács Réka', 'Nagy Bence', 'Tóth Lili', 'Szabó Máté', 'Horváth Dóra', 'Varga Ádám', 'Kiss Zsófia', 'Molnár Levente',
  'Emma Walsh', 'Liam Carter', 'Olivia Brooks', 'Noah Bennett', 'Grace Turner', 'Ethan Hughes', 'Chloe Morgan', 'Ryan Foster',
  'Lena Fischer', 'Jonas Weber', 'Mia Schneider', 'Felix Wagner', 'Hannah Becker', 'Lukas Hoffmann', 'Sophie Krüger', 'Paul Neumann',
];

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A nap 3 jelöltje (determinisztikus: a játékos + a nap). Mindig legalább két különböző szerepkör. */
export function generateCandidates(rule: StaffRule, playerId: string, dayIdx: number): StaffCandidate[] {
  const r = rng(hash32(`${playerId}:${dayIdx}`));
  const roles: StaffRole[] = [...STAFF_ROLES];
  // keverés, aztán a 3. hely véletlen szerep
  for (let i = roles.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [roles[i], roles[j]] = [roles[j], roles[i]]; }
  const picked: StaffRole[] = [roles[0], roles[1], r() < 0.5 ? roles[2] : roles[Math.floor(r() * 2)]];
  const names = new Set<string>();
  return picked.map((role, slot) => {
    let name = STAFF_NAMES[Math.floor(r() * STAFF_NAMES.length)];
    while (names.has(name)) name = STAFF_NAMES[(STAFF_NAMES.indexOf(name) + 1) % STAFF_NAMES.length];
    names.add(name);
    const trait = STAFF_TRAITS[Math.floor(r() * STAFF_TRAITS.length)];
    const level_start = r() < 0.3 ? 2 : 1;
    const base = rule.base_salary_cents[role] * (trait === 'frugal' ? 0.85 : 1);
    return { key: `${dayIdx}.${slot}`, role, name, trait, level_start, base_salary_cents: Math.round(base / 100) * 100 };
  });
}

/**
 * A „tehetséges rendszergazda jelentkezett" esemény (recruit_ad, 2. korszaktól) jelöltje: mindig SRE, 2. szintről
 * indul (tapasztalt), a jelleme véletlen. Determinisztikus a kulcsból (a játékos + a spawn ideje), hogy a tick és a
 * szimulátor ugyanígy sorsolja. A már a csapatban lévő neveket kerüli. (2026-11-12, csapat-utókör)
 */
export function recruitCandidate(rule: StaffRule, seedKey: string, takenNames: readonly string[] = []): StaffCandidate {
  const r = rng(hash32(`recruit:${seedKey}`));
  const taken = new Set(takenNames);
  let i = Math.floor(r() * STAFF_NAMES.length);
  for (let n = 0; n < STAFF_NAMES.length && taken.has(STAFF_NAMES[i]); n++) i = (i + 1) % STAFF_NAMES.length;
  const trait = STAFF_TRAITS[Math.floor(r() * STAFF_TRAITS.length)];
  const base = rule.base_salary_cents.sre * (trait === 'frugal' ? 0.85 : 1);
  return { key: 'recruit', role: 'sre', name: STAFF_NAMES[i], trait, level_start: 2, base_salary_cents: Math.round(base / 100) * 100 };
}

/** Egy jelölt havi bére felvételkor (a kezdő szintjén). */
export function candidateSalaryCents(rule: StaffRule, c: StaffCandidate): number {
  return Math.round((c.base_salary_cents * rule.level_salary[c.level_start - 1]) / 100) * 100;
}

/** A csapat a DB-ből. Ha a tábla még nincs (a migráció előtt élesített kód), üres lista: csendes visszaesés. */
export async function loadStaff(
  db: { prepare(sql: string): { bind(...a: unknown[]): { all<T = unknown>(): Promise<{ results?: T[] }> } } },
  playerId: string,
): Promise<StaffMember[]> {
  try {
    const rows = (await db.prepare(
      'SELECT id, role, name, trait, level_start, base_salary_cents, raise_pct, morale, hired_at, four_day FROM staff WHERE player_id = ? ORDER BY hired_at ASC, id ASC',
    ).bind(playerId).all<Record<string, unknown>>()).results ?? [];
    return rows.map(staffFromRow).filter((m): m is StaffMember => m !== null);
  } catch {
    return [];
  }
}
