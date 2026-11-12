// src/lib/game/economy-sim.ts
// Hyperscales — determinisztikus gazdaság-szimulátor (2026-11-12, egyensúly-kör; bővítve a játékmag-körben).
//
// A valódi tick (tick.ts) lépéseit követi ugyanabban a sorrendben, ugyanazokkal a képletekkel (economy.ts),
// ugyanazokkal az eseményekkel (event-options.ts), szerverárakkal, fejlesztés-hatásokkal (upgrade-effects.ts)
// és korszak-feltételekkel — csak D1 helyett memóriában, és Math.random helyett magolt (seedelt)
// véletlenszámmal, így két futás bitre azonos.
//
// Játékos-profilok:
//  - idle:      belép és otthagyja (soha nem nyúl semmihez),
//  - casual:    naponta 1 műszak (mindent lezár, a morcosakat előbb megnézi), az eseményeknél a legolcsóbbat
//               választja. v3: szervert akkor vesz, amikor a vezérlő szól („a flotta 85%-on"), és bőven van rá
//               pénz; fejlesztést nem vesz. (v2/legacy: ~kéthetente vett egy szervert, ha bőven volt pénze.)
//  - active:    naponta 1 műszak jó válaszokkal, az eseményeknél a hírnévre játszik, ha belefér, felviszi az
//               árakat, erősebb PPC-mixet használ. v3: időben vesz szervert (80%-nál), és a hasznos
//               fejlesztéseket veszi előbb (ACTIVE_UPGRADE_ORDER), tartalékot hagyva.
//  - never_buy: mint az active, de soha nem vesz se szervert, se fejlesztést (rossz döntés #1).
//  - overbuy:   mint az active, de minden nap vesz egy gépet, ha kifizeti (max 12), és minden fejlesztést
//               megvesz, amint kifizeti — tartalék nélkül (rossz döntés #2).
//  - dedicated: mint az active, de már az 1. korszaktól egy dedikált gépre spórol (addig nem vesz fejlesztést),
//               a 2. korszakban megveszi, és a nagy ügyfél ticketjeit rendesen megválaszolja (2026-11-12, dedikált-kör).
//  - dedicated_neglect: ugyanígy megveszi a dedikált gépet, de a nagy ügyfél ticketjeit csak lezárja, nem
//               beszélget vele (rossz döntés #3: „megvettem, majd lesz valahogy").
//
// 2026-11-12 (csapat- és hálózat-kör):
//  - active (és a dedicated-profilok) = a jó csapatépítő: a 2. korszakban ügyfélszolgálatost vesz fel, ha a műszak
//               után is marad ticket, SRE-t és értékesítőt, ha az MRR elbírja (a bérek legfeljebb az MRR negyede),
//               a csapatdrámában akkor ad emelést, ha belefér. A hálózatot időben bővíti (85%-nál), 1 Gbiten
//               peeringet köt, $400 MRR fölött DDoS-védelmet vesz.
//  - no_staff:  mint az active, de soha nem vesz fel senkit (a csapat hasznának méréséhez).
//  - overhire_staff: mint az active, de minden szabad helyre azonnal felvesz valakit (bármilyen szerepre), soha
//               nem bocsát el, és minden emelést megad (rossz döntés #4: bérspirál).
//  - casual:    egy ügyfélszolgálatost vesz fel, ha a ticketek kifutnak a műszakból; a hálózatot akkor bővíti,
//               amikor a vezérlő szól (lassulás).
//  - idle, never_buy: senkit, semmit. overbuy: hálózatot az active módján, csapatot nem.
//
// Egyszerűsítések (tudatosan): a műszak egy pillanat alatt lezajlik; a chat AI-értékelését a profil átlagos
// értékével közelítjük; a Pro-előfizetést és a piacteret nem modellezzük.

import {
  type EconomyRules, TICKS_PER_DAY, TICK_MINUTES, ppcSpendPerTick, acquisitionProb, ticketSpawnProb, churnProb,
  bridgeDue, applyCashDelta, scaleEventCash, isEngaged, serverFeeForTick, effectiveMonthlyFees, applyServerFee,
  pickServerToSell, overloadTicketFactor, overloadRatio, fleetUtilPct,
} from './economy';
import {
  isDedicatedServer, dedicatedArrivalProb, dedicatedBoxes, dedicatedCloseDelta, dedicatedReplyDelta, feeSteps,
} from './dedicated';
import { assignFleetLoad } from './capacity';
import { EVENT_DEFINITIONS } from './event-options';
import { PERSONAS } from './persona-pool';
import { meetsNextEra } from './era-progress';
import { SERVER_SPECS, serverCapacity } from './server-types';
import { UPGRADE_SPECS } from './upgrade-tree';
import { effectsOf, eventAvoidProb, NO_EFFECTS, type UpgradeEffects } from './upgrade-effects';
import type { EventType, EraId, ServerType } from './types';
import { eventPoolForEra } from './event-pool';
import { combineEffects } from './upgrade-effects';
import {
  type StaffMember, maxStaff, generateCandidates, hireFeeCents, candidateSalaryCents, staffSalaryCents, totalSalaryCents,
  staffEffects, supportShare, supportPerDay, supportResolveSat, moraleStep, pickLeastUseful,
} from './staff';
import {
  type NetworkState, networkActive, bandwidthUnits, trafficUnits, networkMonthlyCents, slowdownRatio, slowdownTicketFactor,
  networkEffects,
} from './network';

export type ProfileId = 'idle' | 'casual' | 'active' | 'never_buy' | 'overbuy' | 'dedicated' | 'dedicated_neglect'
  | 'no_staff' | 'overhire_staff';
export const ALL_PROFILES: readonly ProfileId[] = ['idle', 'casual', 'active', 'never_buy', 'overbuy', 'dedicated', 'dedicated_neglect', 'no_staff', 'overhire_staff'];

/** A jó döntéshozó (active) fejlesztési sorrendje: ami most a legtöbbet hozza, az előbb. */
export const ACTIVE_UPGRADE_ORDER = [
  'cpanel_license', 'mod_pagespeed', 'backup_script', 'ram_bump', 'cdn_bind', 'postgres_addon', 'webmin_license',
  'ssl_wildcard', 'hardware_raid', 'docker_enabled', 'nagios', 'cdn_global',
];

export interface SimDay {
  day: number;
  cash_cents: number;
  mrr_cents: number;
  customers: number;
  reputation: number;
  era: number;
  open_tickets: number;
  ppc_spent_cents: number;
  bridge_used: boolean;
  /** v3: a gépek száma és az összes ügyfélhely a nap végén. */
  servers: number;
  capacity: number;
  /** v3: az aznap levont szerver-havidíj (cent). */
  fees_cents: number;
  /** v3: eddig összesen ennyi új ügyfél maradt el helyhiány miatt. */
  lost_total: number;
  /** Dedikált ügyfelek a nap végén, és az ő havidíjuk (az MRR része). */
  dedicated_customers: number;
  dedicated_mrr_cents: number;
  /** Csapat-kör: munkatársak és a havi bérük a nap végén; a hálózat (csomag, forgalom, sávszélesség). */
  staff: number;
  salary_monthly_cents: number;
  avg_morale: number;
  net_tier: number;
  traffic: number;
  bandwidth: number;
}

export interface SimResult {
  rules: EconomyRules['id'];
  profile: ProfileId;
  seed: number;
  days: SimDay[];
  /** A legkisebb pénz, amit a futás során (bármelyik tick után) látott. */
  min_cash_cents: number;
  /** Az első nap, amikor a pénz a tartozás-határ alá esett volna (v3), illetve $1 alá (v2/legacy); null = soha. */
  broke_day: number | null;
  churned_total: number;
  acquired_total: number;
  bridge_day: number | null;
  /** v3: helyhiány miatt elmaradt új ügyfelek. */
  lost_total: number;
  /** v3: tartozás miatt automatikusan eladott gépek. */
  sold_total: number;
  /** Az összes szerver- és fejlesztésvásárlásra költött pénz. */
  invested_cents: number;
  /** Az összes levont havidíj. */
  fees_total_cents: number;
  /** Dedikált-kör: ennyi nagy ügyfél jött / ment el, és ennyi bevételt hoztak összesen (cent). */
  dedicated_signed: number;
  dedicated_lost: number;
  dedicated_income_cents: number;
  /** Az első dedikált gép vásárlásának napja (null = nem vett). */
  dedicated_bought_day: number | null;
  /** Csapat-kör: felvett, felmondott, tartozás miatt elküldött munkatársak; az összes kifizetett bér és hálózati díj;
   *  ennyi ticketet oldott meg az ügyfélszolgálat; a lassulásban töltött félnapok. */
  staff_hired: number;
  staff_quit: number;
  staff_cut_debt: number;
  salaries_total_cents: number;
  network_fees_total_cents: number;
  support_resolved: number;
  slow_halfdays: number;
}

interface SimCustomer {
  sat: number;
  tier: 'hobby' | 'business' | 'dedicated';
  /** Dedikált ügyfél havidíja (cent). */
  fee?: number;
  active: boolean;
  tickets: number[]; // a nyitott ticketek létrehozási ideje
}

interface SimServer { type: ServerType; monthly: number; price: number }

/** mulberry32 — kicsi, gyors, determinisztikus. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPersonaSat(r: () => number): number {
  const total = PERSONAS.reduce((s, p) => s + p.spawn_weight, 0);
  let x = r() * total;
  for (const p of PERSONAS) {
    if ((x -= p.spawn_weight) <= 0) return p.starting_satisfaction;
  }
  return PERSONAS[0].starting_satisfaction;
}

const clampSat = (v: number) => Math.max(-100, Math.min(100, v));
const PROFILE_SALT: Record<ProfileId, number> = { idle: 1, casual: 2, active: 3, never_buy: 4, overbuy: 5, dedicated: 6, dedicated_neglect: 7, no_staff: 8, overhire_staff: 9 };

export interface SimOptions {
  days?: number;
  seed?: number;
  /** false = az active/overbuy profil nem vesz fejlesztést (a fejlesztések hasznának méréséhez). */
  buy_upgrades?: boolean;
  /** false = a profil soha nem bővíti a hálózatot (a sávszélesség hasznának méréséhez). */
  buy_network?: boolean;
}

export function simulate(rules: EconomyRules, profile: ProfileId, opts: SimOptions = {}): SimResult {
  const days = opts.days ?? 60;
  const seed = opts.seed ?? 1;
  // A rossz döntéshozók ugyanazt a véletlen-sorozatot kapják, mint az active: a különbség csak a döntés.
  const salt = profile === 'never_buy' || profile === 'overbuy' || profile === 'dedicated' || profile === 'dedicated_neglect'
    || profile === 'no_staff' || profile === 'overhire_staff'
    ? PROFILE_SALT.active : PROFILE_SALT[profile];
  const r = makeRng(seed * 7919 + salt);
  const v3 = rules.capacity_limit || rules.server_fees || rules.upgrade_effects;
  const plays = profile !== 'idle';
  const buysDedicated = profile === 'dedicated' || profile === 'dedicated_neglect';
  const activeLike = profile === 'active' || profile === 'never_buy' || profile === 'overbuy' || buysDedicated
    || profile === 'no_staff' || profile === 'overhire_staff';
  const ded = rules.dedicated;
  const SR = rules.staff;
  const NR = rules.network;
  // Csapat-politika: ki vesz fel embert, és hogyan.
  const staffPolicy: 'team' | 'casual' | 'overhire' | 'none' =
    !SR ? 'none'
      : profile === 'active' || buysDedicated ? 'team'
        : profile === 'casual' ? 'casual'
          : profile === 'overhire_staff' ? 'overhire' : 'none';
  const netPolicy: 'good' | 'casual' | 'none' =
    !NR || opts.buy_network === false ? 'none' : profile === 'casual' ? 'casual' : profile === 'idle' || profile === 'never_buy' ? 'none' : 'good';

  // Kezdőállás = bootstrap.ts: $1000, 3 hobby-ügyfél egy-egy nyitott tickettel, 1 ingyenes szerver, $15 MRR.
  const p = {
    cash: 100000,
    mrr: 1500,
    rep: 50,
    era: 1 as EraId,
    seo: 33, ppc: 33, ref: 34,
    hobby: 500, business: 1500,
    servers: [{ type: 'lamp_box', monthly: 0, price: 0 }] as SimServer[],
    upgrades: new Set<string>(),
    eff: NO_EFFECTS as UpgradeEffects,
    shiftsToday: 0,
    bridgeUsed: false,
  };
  const customers: SimCustomer[] = [];
  for (let i = 0; i < 3; i++) customers.push({ sat: pickPersonaSat(r), tier: 'hobby', active: true, tickets: [0] });
  const pending: EventType[] = [];
  const staff: StaffMember[] = [];
  let nextStaffId = 1;
  const net: NetworkState = { transit_tier: 0, peering: 0, ddos: 0 };
  /** Csapatdráma-jelzések (munkatárs-azonosítók), amelyekre a játékos a következő belépéskor dönt. */
  const dramaQueue: number[] = [];
  let staffHired = 0, staffQuit = 0, staffCutDebt = 0, salariesTotal = 0, netFeesTotal = 0, supportResolved = 0, slowHalfDays = 0;
  /** A műszak után ennyi ticket maradt (a felvételi döntéshez). */
  let leftoverAfterShift = 0;

  const out: SimDay[] = [];
  let minCash = p.cash;
  let brokeDay: number | null = null;
  let churnedTotal = 0;
  let acquiredTotal = 0;
  let lostTotal = 0;
  let soldTotal = 0;
  let invested = 0;
  let feesTotal = 0;
  let bridgeDay: number | null = null;
  let ppcToday = 0;
  let feesToday = 0;
  let lastActive = 0;
  let dedSigned = 0;
  let dedLost = 0;
  let dedIncome = 0;
  let dedBoughtDay: number | null = null;
  let dedLastLost: number | null = null;
  let nowSec = 0;

  const upEff = (): UpgradeEffects => (rules.upgrade_effects ? p.eff : NO_EFFECTS);
  // A fejlesztések + a csapat + a hálózat hatása (a csapaté szinttől és hangulattól függ, ezért mindig frissen).
  // Tickenként egyszer számoljuk (a ticket-ciklus ügyfelenként kéri); változáskor (felvétel, fejlesztés…) érvénytelenítjük.
  let effAt = -1;
  let effVal: UpgradeEffects = NO_EFFECTS;
  const eff = (): UpgradeEffects => {
    if (effAt !== nowSec) {
      effVal = combineEffects(upEff(), staffEffects(SR, staff, nowSec), networkActive(NR, p.era) ? networkEffects(NR, net) : {});
      effAt = nowSec;
    }
    return effVal;
  };
  const dirtyEff = (): void => { effAt = -1; };
  const capacity = (): number => p.servers.reduce((s, sv) => s + serverCapacity(sv.type, 0, eff().capacity_pct), 0);
  const activeN = (): number => customers.reduce((s, c) => s + (c.active ? 1 : 0), 0);
  // A sima ügyfelek (a kapacitás csak rájuk vonatkozik) és a dedikáltak.
  const dedN = (): number => customers.reduce((s, c) => s + (c.active && c.tier === 'dedicated' ? 1 : 0), 0);
  const generalN = (): number => activeN() - dedN();
  const dedMrr = (): number => customers.reduce((s, c) => s + (c.active && c.tier === 'dedicated' ? (c.fee ?? 0) : 0), 0);
  const loseDedicated = (c: SimCustomer): void => {
    c.active = false;
    c.tickets = [];
    dedLost++;
    dedLastLost = nowSec;
    if (ded) p.rep = Math.max(0, p.rep - ded.leave_rep);
  };
  const listedFees = (): number => p.servers.reduce((s, sv) => s + sv.monthly, 0);
  const tierCounts = () => {
    let hobby = 0, business = 0, dedicated = 0;
    for (const c of customers) if (c.active) { if (c.tier === 'dedicated') dedicated++; else if (c.tier === 'business') business++; else hobby++; }
    return { hobby, business, dedicated };
  };
  const netOn = (): boolean => networkActive(NR, p.era);
  const traffic = (): number => (NR ? trafficUnits(NR, tierCounts()) : 0);
  const bandwidth = (): number => (NR ? bandwidthUnits(NR, net) : 0);
  const slowRatio = (): number => (netOn() ? slowdownRatio(traffic(), bandwidth()) : 0);
  const netMonthly = (): number => (netOn() ? networkMonthlyCents(NR, net) : 0);
  const removeStaff = (i: number): StaffMember => { dirtyEff(); return staff.splice(i, 1)[0]; };

  // A profil napi döntésének ideje (a nap hányadik tickje).
  const actTick = activeLike ? 12 * 12 : 19 * 12;

  if (activeLike) {
    p.seo = 25; p.ppc = 50; p.ref = 25;
    p.hobby = 700; p.business = 2000; // a régi szabályokkal a max ár ($10/$30) lenne ingyen pénz — lásd price_elasticity
  }

  const totalTicks = days * TICKS_PER_DAY;
  for (let t = 1; t <= totalTicks; t++) {
    const now = t * TICK_MINUTES * 60;
    nowSec = now;
    const dayIdx = Math.floor(now / 86400);
    const tickOfDay = t % TICKS_PER_DAY;

    // 0. napi műszak-keret nullázás (UTC éjfél)
    if (tickOfDay === 0) p.shiftsToday = 0;

    // Játékos-döntések (a tick előtt, ahogy egy oldalbetöltés a lazy-ticket is megelőzi).
    if (plays && tickOfDay === actTick) { act(now); lastActive = now; }

    // 0.5 csendes elégedettség (félnaponta) + túlterhelés-büntetés (v3)
    const engaged = isEngaged(rules, now, lastActive);
    const halfDay = tickOfDay === 0 || tickOfDay === TICKS_PER_DAY / 2;
    if (rules.quiet_satisfaction && engaged && halfDay) {
      const q = rules.quiet_satisfaction;
      for (const c of customers) if (c.active && c.tickets.length === 0 && c.sat < q.cap) c.sat = Math.min(q.cap, c.sat + q.step);
    }
    if (rules.capacity_limit && rules.overload && halfDay && overloadRatio(generalN(), capacity()) > 0) {
      for (const c of customers) if (c.active && c.tier !== 'dedicated') c.sat = clampSat(c.sat - rules.overload.sat_step);
    }
    // Hálózat (félnaponta): kevés sávszélesség → lassulás → −elégedettség a sima ügyfeleknek.
    if (NR && halfDay && slowRatio() > 0) {
      slowHalfDays++;
      for (const c of customers) if (c.active && c.tier !== 'dedicated') c.sat = clampSat(c.sat - NR.slowdown.sat_step);
    }
    // Csapat (félnaponta): az ügyfélszolgálat megold néhány ticketet, aztán mindenki hangulata (túlterhelés,
    // pénz), a túl rosszkedvű felmond, a 35 alatti szól (csapatdráma).
    if (SR && halfDay && staff.length > 0) staffHalfDay(now);
    // Dedikált ügyfél (félnaponta): megszegett SLA → −elégedettség, −hírnév; túl elégedetlen → felmond.
    if (ded && halfDay) {
      const slaCut = now - ded.sla_hours * 3600;
      for (const c of customers) {
        if (!c.active || c.tier !== 'dedicated') continue;
        if (c.tickets.some((ts) => ts < slaCut)) {
          c.sat = clampSat(c.sat - ded.sla_sat);
          p.rep = Math.max(0, p.rep - ded.sla_rep);
        }
        if (c.sat < ded.leave_below_sat) loseDedicated(c);
      }
    }

    // 1. MRR-csordogálás
    if (p.mrr > 0) {
      p.cash += Math.round(p.mrr * (TICK_MINUTES / (60 * 24 * 30)));
      const dm = dedMrr();
      if (dm > 0) dedIncome += Math.round(dm * (TICK_MINUTES / (60 * 24 * 30)));
    }

    // 1.5 szerver-havidíj (v3) + tartozás-határnál automatikus eladás
    if (rules.server_fees) {
      // Csapat- és hálózat-kör: a bér és a hálózat havidíja ugyanígy, időarányosan (tick.ts 2.5. lépés).
      const feeSrv = serverFeeForTick(effectiveMonthlyFees(listedFees(), eff().fee_pct), now);
      const feeSal = serverFeeForTick(totalSalaryCents(SR, staff, now), now);
      const feeNet = serverFeeForTick(netMonthly(), now);
      const fee = feeSrv + feeSal + feeNet;
      if (fee > 0) {
        const res = applyServerFee(rules, p.cash, fee);
        const paid = p.cash - res.cash;
        // A szerver-havidíj (fees_*) külön marad a bértől és a hálózattól (a régi mutatók jelentése nem változik).
        const paidSal = Math.round((paid * feeSal) / fee);
        const paidNet = Math.round((paid * feeNet) / fee);
        feesToday += paid - paidSal - paidNet;
        feesTotal += paid - paidSal - paidNet;
        salariesTotal += paidSal;
        netFeesTotal += paidNet;
        p.cash = res.cash;
        if (res.over_limit) {
          if (brokeDay === null) brokeDay = dayIdx;
          cutOne();
        }
      }
    }

    // 3. ticketek
    {
      const ovl = overloadTicketFactor(rules, generalN(), capacity()) * (NR && slowRatio() > 0 ? slowdownTicketFactor(NR, slowRatio()) : 1);
      for (const c of customers) {
        if (!c.active) continue;
        // A dedikált ügyfél saját gépen ül (nincs túlterhelés), de ticket_factor-szor annyi ticketet hoz.
        const prob = c.tier === 'dedicated' && ded
          ? ticketSpawnProb(rules, c.sat, eff().ticket_pct, 1) * ded.ticket_factor
          : ticketSpawnProb(rules, c.sat, eff().ticket_pct, ovl);
        if (r() < prob) c.tickets.push(now);
      }
    }

    // 4. lemorzsolódás
    {
      let act = activeN();
      const cutoff = now - rules.churn_hours * 3600;
      for (const c of customers) {
        if (!c.active || !c.tickets.some((ts) => ts < cutoff)) continue;
        if (act <= rules.churn_floor_customers) break;
        if (r() < churnProb(rules, c.sat, false, eff().churn_pct)) {
          if (c.tier === 'dedicated') loseDedicated(c);
          c.active = false;
          act--;
          churnedTotal++;
          // v2: a lemorzsolódott ügyfél ticketjei lezárulnak (nem foglalnak helyet a műszakban).
          if (rules.close_tickets_on_churn) c.tickets = [];
        }
      }
    }

    // 5. MRR újraszámolás (v3: × mrr_pct)
    {
      const base = customers.reduce((s, c) => s + (c.active && c.tier !== 'dedicated' ? (c.tier === 'business' ? p.business : p.hobby) : 0), 0);
      // A dedikált ügyfél szerződéses díja fix (a fejlesztések mrr_pct-je nem emeli).
      p.mrr = Math.round(base * (1 + eff().mrr_pct / 100)) + dedMrr();
    }

    // 6. marketing + beszerzés (v3: csak szabad helyre)
    {
      const spend = ppcSpendPerTick(rules, { ppc_pct: p.ppc, cash_cents: p.cash, mrr_cents: p.mrr });
      const prob = acquisitionProb(rules, {
        seo_pct: p.seo, ppc_effective_pct: spend.effective_pct, referral_pct: p.ref,
        reputation: p.rep, era: p.era, is_pro: false, age_days: now / 86400,
        pricing_hobby_cents: p.hobby, pricing_business_cents: p.business, acq_pct: eff().acq_pct,
      });
      if (prob > 0) {
        if (r() < prob) {
          const tier = r() < p.rep / 200 ? 'business' : 'hobby';
          const sat = pickPersonaSat(r);
          if (rules.capacity_limit && generalN() >= capacity()) {
            lostTotal++;
          } else {
            customers.push({ sat, tier, active: true, tickets: [] });
            acquiredTotal++;
          }
        }
        if (spend.cost_cents > 0) {
          p.cash = Math.max(Math.min(p.cash, 0), p.cash - spend.cost_cents);
          ppcToday += spend.cost_cents;
        }
      }
    }

    // 6.2 dedikált ügyfél jelentkezése (szabad dedikált gépre). Csak akkor dob, ha van esély (a régi
    //     profilok véletlen-sorozata így változatlan).
    if (ded) {
      const prob = dedicatedArrivalProb(rules, { free_boxes: dedicatedBoxes(p.servers, dedN()).free, reputation: p.rep, now, last_lost_at: dedLastLost });
      if (prob > 0 && r() < prob) {
        const fee = ded.fee_min_cents + Math.floor(r() * feeSteps(ded)) * ded.fee_step_cents;
        customers.push({ sat: ded.start_sat, tier: 'dedicated', fee, active: true, tickets: [] });
        dedSigned++;
      }
    }

    // 6.5 áthidaló befektető (v2+)
    if (bridgeDue(rules, { cash_cents: p.cash, age_days: now / 86400, already_used: p.bridgeUsed })) {
      p.cash += rules.bridge!.grant_cents;
      p.bridgeUsed = true;
      bridgeDay = dayIdx;
    }

    // 7. véletlen esemény (v3: a fejlesztések egy részét kivédik)
    if (r() < rules.random_event_prob_per_tick) {
      const pool = eventPoolForEra(p.era, SR ? { has_staff: staff.length > 0 } : {});
      const ev = pool[Math.floor(r() * pool.length)];
      const avoid = rules.upgrade_effects ? eventAvoidProb(ev, eff()) : 0;
      if (!(avoid > 0 && r() < avoid)) pending.push(ev);
    }

    // 7.5 passzív hírnév-sodródás
    {
      const act = customers.filter((c) => c.active);
      if (act.length >= 3) {
        const avg = act.reduce((s, c) => s + c.sat, 0) / act.length;
        const roll = r();
        const cutoff = now - rules.churn_hours * 3600;
        const staleOk = !rules.rep_drift_requires_no_stale_tickets
          || !act.some((c) => c.tickets.some((ts) => ts < cutoff));
        if (avg >= 70 && staleOk && engaged && roll < 0.02) p.rep = Math.min(100, p.rep + 1);
        else if (avg < 30 && roll < 0.02) p.rep = Math.max(0, p.rep - 1);
      }
      const rec = rules.rep_recovery;
      if (rec && p.rep < rec.below && r() < rec.prob_per_tick) p.rep = Math.min(rec.below, p.rep + 1);
    }

    // 8. korszak-lépés
    const target = meetsNextEra({
      // A nagy ügyfél díja nem számít a korszakhoz (era-progress.eraMrrCents).
      current_era: p.era, mrr_usd_cents: p.mrr - dedMrr(), server_count: p.servers.length,
      days_alive: Math.floor(now / 86400), reputation: p.rep,
    });
    if (target) { p.era = target.era; dirtyEff(); }

    minCash = Math.min(minCash, p.cash);
    if (!rules.server_fees && brokeDay === null && p.cash < 100) brokeDay = dayIdx;

    if (tickOfDay === 0) {
      out.push({
        day: dayIdx,
        cash_cents: p.cash,
        mrr_cents: p.mrr,
        customers: activeN(),
        reputation: p.rep,
        era: p.era,
        open_tickets: customers.reduce((s, c) => s + c.tickets.length, 0),
        ppc_spent_cents: ppcToday,
        bridge_used: p.bridgeUsed,
        servers: p.servers.length,
        capacity: capacity(),
        fees_cents: feesToday,
        lost_total: lostTotal,
        dedicated_customers: dedN(),
        dedicated_mrr_cents: dedMrr(),
        staff: staff.length,
        salary_monthly_cents: totalSalaryCents(SR, staff, now),
        avg_morale: staff.length ? Math.round(staff.reduce((a, m) => a + m.morale, 0) / staff.length) : 0,
        net_tier: net.transit_tier,
        traffic: traffic(),
        bandwidth: netOn() ? bandwidth() : 0,
      });
      ppcToday = 0;
      feesToday = 0;
    }
  }

  return {
    rules: rules.id, profile, seed, days: out,
    min_cash_cents: minCash, broke_day: brokeDay,
    churned_total: churnedTotal, acquired_total: acquiredTotal, bridge_day: bridgeDay,
    lost_total: lostTotal, sold_total: soldTotal, invested_cents: invested, fees_total_cents: feesTotal,
    dedicated_signed: dedSigned, dedicated_lost: dedLost, dedicated_income_cents: dedIncome, dedicated_bought_day: dedBoughtDay,
    staff_hired: staffHired, staff_quit: staffQuit, staff_cut_debt: staffCutDebt, salaries_total_cents: salariesTotal,
    network_fees_total_cents: netFeesTotal, support_resolved: supportResolved, slow_halfdays: slowHalfDays,
  };

  // ——— csapat ———
  function staffHalfDay(now: number): void {
    const rule = SR!;
    // 1. ügyfélszolgálat: a legrégebbi ticketek a nem morcos, nem nagy ügyfelektől
    const queue: Array<{ c: SimCustomer; ts: number }> = [];
    for (const c of customers) {
      if (!c.active || c.tier === 'dedicated' || c.sat < rule.support_min_sat) continue;
      for (const ts of c.tickets) queue.push({ c, ts });
    }
    queue.sort((a, b) => a.ts - b.ts);
    const queueBefore = queue.length;
    const cap = staff.reduce((a, m) => a + supportShare(rule, m, now), 0);
    for (const { c, ts } of queue.slice(0, cap)) {
      c.sat = supportResolveSat(rule, c.sat);
      const i = c.tickets.indexOf(ts);
      if (i >= 0) c.tickets.splice(i, 1);
      supportResolved++;
    }
    // 2. hangulat
    const perDay = supportPerDay(rule, staff, now);
    const supportOver = queueBefore > rule.morale.overwork_queue_factor * Math.max(1, perDay);
    const sreOver = overloadRatio(generalN(), capacity()) > 0 || slowRatio() > 0;
    const salesOver = fleetUtilPct(generalN(), capacity()) >= 95;
    for (let i = staff.length - 1; i >= 0; i--) {
      const m = staff[i];
      const over = m.role === 'support' ? supportOver : m.role === 'sre' ? sreOver : salesOver;
      m.morale = moraleStep(rule, m, { overworked: over, cash_cents: p.cash });
      if (m.morale < rule.morale.quit_below) { removeStaff(i); staffQuit++; continue; }
      if (m.morale < rule.morale.drama_below && !dramaQueue.includes(m.id)) dramaQueue.push(m.id);
    }
    dirtyEff();
  }

  /** Tartozás-határ: előbb a legkevésbé hasznos ember, aztán a DDoS-védelem, csak utána a gép. */
  function cutOne(): void {
    if (SR && staff.length > 0) {
      const i = pickLeastUseful(SR, staff, nowSec, { fleet_full: fleetUtilPct(generalN(), capacity()) >= 95 });
      if (i >= 0) { removeStaff(i); staffCutDebt++; for (const m of staff) m.morale = Math.max(0, m.morale - SR.morale.fire_hit); return; }
    }
    if (net.ddos) { net.ddos = 0; dirtyEff(); return; }
    sellOne();
  }

  function hire(c: ReturnType<typeof generateCandidates>[number]): boolean {
    const rule = SR!;
    const fee = hireFeeCents(rule, c);
    if (p.cash < fee) return false;
    p.cash -= fee;
    invested += fee;
    staff.push({
      id: nextStaffId++, role: c.role, name: c.name, trait: c.trait, level_start: c.level_start,
      base_salary_cents: c.base_salary_cents, raise_pct: 0, morale: rule.morale.start, hired_at: nowSec, four_day: 0,
    });
    staffHired++;
    dirtyEff();
    return true;
  }

  function staffDecisions(day: number): void {
    const rule = SR;
    if (!rule || staffPolicy === 'none') return;
    // Csapatdráma: a játékos dönt (emelés / négynapos hét / elengedi).
    while (dramaQueue.length > 0) {
      const id = dramaQueue.shift()!;
      const i = staff.findIndex((m) => m.id === id);
      if (i < 0) continue;
      resolveDrama(i);
    }
    const slots = maxStaff(rule, p.era) - staff.length;
    if (slots <= 0) return;
    const cands = generateCandidates(rule, `sim-${seed}`, day).filter((c) => !staff.some((m) => m.name === c.name));
    if (cands.length === 0) return;
    const salaries = totalSalaryCents(rule, staff, nowSec);
    const has = (r: string) => staff.filter((m) => m.role === r).length;
    if (staffPolicy === 'overhire') {
      for (const c of cands.slice(0, slots)) hire(c);
      return;
    }
    if (staffPolicy === 'casual') {
      if (has('support') > 0 || leftoverAfterShift <= 5) return;
      const c = cands.find((x) => x.role === 'support');
      if (c && salaries + candidateSalaryCents(rule, c) <= 0.3 * p.mrr && p.cash >= hireFeeCents(rule, c) + 20000) hire(c);
      return;
    }
    // team: amire most szükség van, és amit az MRR elbír (a bérek legfeljebb az MRR negyede)
    const want: string[] = [];
    if (leftoverAfterShift > 3 && has('support') < 2) want.push('support');
    if (p.mrr >= 40000 && has('sre') < 1) want.push('sre');
    if (p.mrr >= 50000 && has('sales') < 1 && fleetUtilPct(generalN(), capacity()) < 70) want.push('sales');
    for (const role of want) {
      const c = cands.filter((x) => x.role === role).sort((a, b) => candidateSalaryCents(rule, a) - candidateSalaryCents(rule, b))[0];
      if (!c) continue;
      const after = totalSalaryCents(rule, staff, nowSec) + candidateSalaryCents(rule, c);
      if (after <= 0.25 * p.mrr && p.cash >= hireFeeCents(rule, c) + 30000) { hire(c); break; }
    }
  }

  function resolveDrama(i: number): void {
    const rule = SR!;
    const m = staff[i];
    const raiseCost = Math.round(staffSalaryCents(rule, m, nowSec) * rule.drama.raise_pct / 100);
    const salaries = totalSalaryCents(rule, staff, nowSec);
    dirtyEff();
    const raise = () => { m.raise_pct += rule.drama.raise_pct; m.morale = Math.max(m.morale, rule.drama.raise_morale); };
    const fourDay = () => { m.four_day = 1; m.morale = Math.min(100, m.morale + rule.drama.four_day_morale); };
    if (staffPolicy === 'overhire') { raise(); return; }
    if (staffPolicy === 'casual') { if (!m.four_day) fourDay(); else raise(); return; }
    if (salaries + raiseCost <= 0.3 * p.mrr) raise();
    else if (!m.four_day) fourDay();
    else { removeStaff(i); p.rep = Math.max(0, p.rep - rule.drama.leave_rep); }
  }

  function networkDecisions(): void {
    if (!NR || netPolicy === 'none' || !netOn()) return;
    dirtyEff();
    const tr = traffic();
    const bw = bandwidth();
    const nextTier = net.transit_tier + 1;
    if (nextTier < NR.tiers.length && NR.tiers[nextTier].min_era <= p.era) {
      const trigger = netPolicy === 'good' ? tr >= 0.85 * bw : tr > bw;
      const cost = NR.tiers[nextTier].monthly_cents;
      if (trigger && p.cash >= cost + 20000) net.transit_tier = nextTier;
    }
    if (netPolicy !== 'good') return;
    if (!net.peering && net.transit_tier >= 2 && p.cash >= NR.peering.setup_cents + 30000) {
      p.cash -= NR.peering.setup_cents; invested += NR.peering.setup_cents; net.peering = 1;
    }
    if (!net.ddos && p.mrr >= 40000) net.ddos = 1;
  }

  // ——— segédek ———
  function sellOne(): void {
    // A gépek terhelése vásárlási sorrendben töltve (capacity.assignFleetLoad), ahogy a tick is számolja.
    const fl = assignFleetLoad(
      p.servers.map((sv, id) => ({ id, type: sv.type, capacity: serverCapacity(sv.type, 0, eff().capacity_pct) })),
      generalN(), dedN(),
    );
    const loads = fl.servers.map((x, i) => ({ monthly_cost_cents: p.servers[i].monthly, load: x.load }));
    const i = pickServerToSell(loads);
    if (i < 0) return;
    if (isDedicatedServer(p.servers[i].type) && loads[i].load > 0) {
      // A gépével együtt a nagy ügyfél is elmegy.
      const c = customers.find((x) => x.active && x.tier === 'dedicated');
      if (c) loseDedicated(c);
    }
    const sv = p.servers.splice(i, 1)[0];
    p.cash += Math.round((sv.price * rules.auto_sell_refund_pct) / 100);
    soldTotal++;
  }

  function buyServer(type: ServerType): boolean {
    const spec = SERVER_SPECS[type];
    if (p.cash < spec.purchase_cost_cents) return false;
    p.cash -= spec.purchase_cost_cents;
    invested += spec.purchase_cost_cents;
    p.servers.push({ type, monthly: spec.monthly_cost_cents, price: spec.purchase_cost_cents });
    return true;
  }

  function buyUpgrade(id: string): boolean {
    const u = UPGRADE_SPECS.find((x) => x.id === id);
    if (!u || p.upgrades.has(id) || u.era > p.era || (u.prereq && !p.upgrades.has(u.prereq)) || p.cash < u.cost_usd_cents) return false;
    p.cash -= u.cost_usd_cents;
    invested += u.cost_usd_cents;
    p.upgrades.add(id);
    p.eff = effectsOf(p.upgrades);
    dirtyEff();
    return true;
  }

  // ——— a profilok napi döntései ———
  function act(now: number): void {
    // Műszak: a legrégebbi nyitott ticketek (a régi start.ts a lemorzsolódott ügyfelekét is behúzta).
    if (p.shiftsToday < 1) {
      const queue: Array<{ c: SimCustomer; ts: number }> = [];
      for (const c of customers) {
        if (rules.close_tickets_on_churn && !c.active) continue;
        for (const ts of c.tickets) queue.push({ c, ts });
      }
      // A dedikált ügyfél ticketjei előre kerülnek (api/shift/start.ts is így válogat).
      queue.sort((a, b) => ((b.c.tier === 'dedicated' ? 1 : 0) - (a.c.tier === 'dedicated' ? 1 : 0)) || a.ts - b.ts);
      const limit = rules.shift_ticket_limit + (rules.upgrade_effects ? p.eff.shift_slots : 0);
      const batch = queue.slice(0, limit);
      leftoverAfterShift = Math.max(0, queue.length - batch.length);
      if (batch.length > 0) {
        p.shiftsToday++;
        for (const { c, ts } of batch) {
          if (c.tier === 'dedicated' && ded) {
            if (profile !== 'dedicated_neglect') {
              c.sat = clampSat(c.sat + dedicatedReplyDelta(ded, 8)); // ugyanaz a jó válasz, kevesebbet ér
              // Ha nagyon morcos: eszkaláció a senior mérnökhöz ($50, +15), nem a havidíja visszatérítése.
              if (c.sat < 30) { c.sat = clampSat(c.sat + 15); p.cash = applyCashDelta(rules, p.cash, -5000); }
            }
            c.sat = clampSat(c.sat + dedicatedCloseDelta(ded, c.sat));
            const di = c.tickets.indexOf(ts);
            if (di >= 0) c.tickets.splice(di, 1);
            continue;
          }
          if (activeLike) {
            c.sat = clampSat(c.sat + 8); // egy-két értelmes válasz a chatben (AI-értékelés átlaga)
            if (c.sat < 30) { c.sat = clampSat(c.sat + 20); p.cash = applyCashDelta(rules, p.cash, -250); } // 50% visszatérítés
          } else if (c.sat < 50) {
            c.sat = clampSat(c.sat + 5); // „megnézem a logokat"
          }
          // lezárás (action-handler.applyCloseAction)
          c.sat = clampSat(c.sat + (c.sat >= 50 ? 5 : c.sat >= 30 ? 0 : -30));
          const i = c.tickets.indexOf(ts);
          if (i >= 0) c.tickets.splice(i, 1);
        }
      }
    }

    // Események
    while (pending.length > 0) {
      const ev = pending.shift()!;
      // Élő szabályokkal a csapatdráma egy valódi munkatársról szól: a legrosszabb kedvűről.
      if (ev === 'staff_drama' && SR) {
        if (staff.length > 0) {
          let w = 0;
          staff.forEach((m, i) => { if (m.morale < staff[w].morale) w = i; });
          if (!dramaQueue.includes(staff[w].id)) dramaQueue.push(staff[w].id);
        }
        continue;
      }
      const opts = EVENT_DEFINITIONS[ev].options
        .filter((o) => o.id !== 'counter_offer') // véletlen kimenetű: kihagyjuk a determinizmus kedvéért
        .map((o) => {
          const res = o.apply();
          return { id: o.id, res: { ...res, cash_delta_cents: scaleEventCash(rules, res.cash_delta_cents, p.mrr) } };
        });
      let pick = opts[0];
      if (profile === 'casual') {
        // a legolcsóbb, holtversenyben a jobb hírnevű
        pick = opts.reduce((b, o) => (o.res.cash_delta_cents > b.res.cash_delta_cents
          || (o.res.cash_delta_cents === b.res.cash_delta_cents && o.res.reputation_delta > b.res.reputation_delta) ? o : b));
      } else {
        const score = (o: typeof pick) => o.res.reputation_delta * 3 + o.res.satisfaction_delta_global + o.res.cash_delta_cents / 5000;
        // v3: ha a flotta szorít, a következő gép árát is tartalékolja (nem költi el egy eseményre).
        const keep = 20000 + (v3 && profile !== 'never_buy' && fleetUtilPct(generalN(), capacity()) >= 70 ? SERVER_SPECS.lamp_box.purchase_cost_cents : 0);
        const affordable = opts.filter((o) => p.cash + o.res.cash_delta_cents >= keep);
        const pool = affordable.length > 0 ? affordable : opts;
        pick = (affordable.length > 0 ? pool.reduce((b, o) => (score(o) > score(b) ? o : b)) :
          pool.reduce((b, o) => (o.res.cash_delta_cents > b.res.cash_delta_cents ? o : b)));
      }
      p.cash = applyCashDelta(rules, p.cash, pick.res.cash_delta_cents);
      p.rep = Math.max(-100, Math.min(100, p.rep + pick.res.reputation_delta));
      if (pick.res.satisfaction_delta_global !== 0) {
        for (const c of customers) if (c.active) c.sat = clampSat(c.sat + pick.res.satisfaction_delta_global);
      }
    }

    // Vásárlás
    const day = Math.floor(now / 86400);
    // Csapat- és hálózat-kör: a csapat és a hálózat döntései (a szerver- és fejlesztésvásárlás előtt).
    staffDecisions(day);
    networkDecisions();
    const lamp = SERVER_SPECS.lamp_box.purchase_cost_cents;
    if (!v3) {
      // v2/legacy: a régi profil-viselkedés (az „előtte" görbékhez és a régi regressziós tesztekhez).
      if (profile === 'never_buy') return;
      if (profile === 'casual') {
        if (day > 0 && day % 14 === 0 && p.cash >= lamp + 20000) buyServer('lamp_box');
      } else if (profile === 'overbuy') {
        if (p.servers.length < 12) buyServer('lamp_box');
        for (const u of UPGRADE_SPECS) buyUpgrade(u.id);
      } else {
        if (p.servers.length < 3 && p.cash >= lamp + 30000) buyServer('lamp_box');
        const up = UPGRADE_SPECS
          .filter((u) => u.era <= p.era && !p.upgrades.has(u.id) && (!u.prereq || p.upgrades.has(u.prereq)))
          .sort((a, b) => a.cost_usd_cents - b.cost_usd_cents)[0];
        if (up && p.cash - up.cost_usd_cents >= 50000) buyUpgrade(up.id);
      }
      return;
    }

    const util = fleetUtilPct(generalN(), capacity());
    // Dedikált: a 2. korszakban (és elég hírnévvel) megveszi a dedikált gépet, ha marad $100 tartalék.
    const dedPrice = SERVER_SPECS.dedicated_box.purchase_cost_cents;
    const hasBox = p.servers.some((sv) => isDedicatedServer(sv.type));
    // Már az 1. korszakban spórol rá (addig nem vesz fejlesztést), hogy a 2. korszak
    // elején meg tudja venni — a sima gépeket közben ugyanúgy veszi (azok nélkül elmaradnak az ügyfelek).
    const savingForBox = buysDedicated && ded !== null && !hasBox;
    if (savingForBox && p.era >= 2 && p.rep >= ded!.min_reputation && p.cash >= dedPrice + 10000) {
      buyServer('dedicated_box');
      if (dedBoughtDay === null) dedBoughtDay = day;
    }
    if (profile === 'casual') {
      // A vezérlő 85%-nál szól; az alkalmi játékos akkor vesz, ha marad $200 tartalék.
      if (util >= 85 && p.cash >= lamp + 20000) buyServer('lamp_box');
    } else if (profile === 'active' || profile === 'overbuy' || buysDedicated || profile === 'no_staff' || profile === 'overhire_staff') {
      if (profile !== 'overbuy') {
        // Nem hirdet, amíg nincs hova tenni az ügyfelet (teli flottánál a PPC kidobott pénz).
        if (util >= 90) { p.seo = 50; p.ppc = 0; p.ref = 50; } else { p.seo = 25; p.ppc = 50; p.ref = 25; }
        // Időben (80%-nál) vesz gépet, $200 tartalékkal — a kapacitás előbb van, mint a fejlesztés.
        if (util >= 80 && p.cash >= lamp + 20000) buyServer('lamp_box');
      } else {
        // Túl sokat vesz: minden nap egy gépet, ha kifizeti (max 12), akár üresen is.
        if (p.servers.length < 12) buyServer('lamp_box');
      }
      // Fejlesztés (mindkettőnél ugyanaz, hogy a különbség a szerver-döntés legyen): a haszon sorrendjében,
      // naponta legfeljebb egy, $300 tartalékkal, és csak ha a flotta nem szorít.
      // Aki dedikált gépre spórol, az addig nem vesz fejlesztést.
      const stillSaving = savingForBox && !p.servers.some((sv) => isDedicatedServer(sv.type));
      if (opts.buy_upgrades !== false && !stillSaving && fleetUtilPct(generalN(), capacity()) < 80) {
        const reserve = 30000;
        for (const id of ACTIVE_UPGRADE_ORDER) {
          const u = UPGRADE_SPECS.find((x) => x.id === id)!;
          if (p.upgrades.has(id) || u.era > p.era || (u.prereq && !p.upgrades.has(u.prereq))) continue;
          if (id === 'ram_bump' && p.servers.length < 2) continue; // a kapacitás-fejlesztés több gépen ér többet
          if (p.cash - u.cost_usd_cents >= reserve) buyUpgrade(id);
          break;
        }
      }
    }
    // never_buy: semmit
  }
}
