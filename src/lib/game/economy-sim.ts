// src/lib/game/economy-sim.ts
// Hyperscales — determinisztikus gazdaság-szimulátor (2026-11-12, egyensúly-kör).
//
// A valódi tick (tick.ts) lépéseit követi ugyanabban a sorrendben, ugyanazokkal a képletekkel (economy.ts),
// ugyanazokkal az eseményekkel (event-options.ts), szerverárakkal és korszak-feltételekkel — csak D1 helyett
// memóriában, és Math.random helyett magolt (seedelt) véletlenszámmal, így két futás bitre azonos.
//
// Három játékos-profil:
//  - idle:   belép és otthagyja (soha nem nyúl semmihez),
//  - casual: naponta 1 műszak (mindent lezár, a morcosakat előbb megnézi), az eseményeknél a legolcsóbbat
//            választja, ~kéthetente vesz egy szervert, ha bőven van rá pénz,
//  - active: naponta 1 műszak jó válaszokkal, az eseményeknél a hírnévre játszik, ha belefér, felviszi az
//            árakat, erősebb PPC-mixet használ, szervert és fejlesztést vesz, ha a tartalék megmarad.
//
// Egyszerűsítések (tudatosan): a műszak egy pillanat alatt lezajlik; a chat AI-értékelését a profil átlagos
// értékével közelítjük; a Pro-előfizetést és a piacteret nem modellezzük (a piactéri lead $80–$400 egy
// $5–15/hó ügyfélért — a 60 napos ablakban egyik profilnak sem éri meg).

import { type EconomyRules, TICKS_PER_DAY, TICK_MINUTES, ppcSpendPerTick, acquisitionProb, ticketSpawnProb, churnProb, bridgeDue, applyCashDelta, scaleEventCash, isEngaged } from './economy';
import { EVENT_DEFINITIONS } from './event-options';
import { PERSONAS } from './persona-pool';
import { meetsNextEra } from './era-progress';
import { SERVER_SPECS } from './server-types';
import { UPGRADE_SPECS } from './upgrade-tree';
import type { EventType, EraId } from './types';
import { eventPoolForEra } from './event-pool';

export type ProfileId = 'idle' | 'casual' | 'active';

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
}

export interface SimResult {
  rules: EconomyRules['id'];
  profile: ProfileId;
  seed: number;
  days: SimDay[];
  /** A legkisebb pénz, amit a futás során (bármelyik tick után) látott. */
  min_cash_cents: number;
  /** Az első nap, amikor a pénz $1 alá esett (null = soha). */
  broke_day: number | null;
  churned_total: number;
  acquired_total: number;
  bridge_day: number | null;
}

interface SimCustomer {
  sat: number;
  tier: 'hobby' | 'business';
  active: boolean;
  tickets: number[]; // a nyitott ticketek létrehozási ideje
}

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

export interface SimOptions {
  days?: number;
  seed?: number;
}

export function simulate(rules: EconomyRules, profile: ProfileId, opts: SimOptions = {}): SimResult {
  const days = opts.days ?? 60;
  const seed = opts.seed ?? 1;
  const r = makeRng(seed * 7919 + (profile === 'idle' ? 1 : profile === 'casual' ? 2 : 3));

  // Kezdőállás = bootstrap.ts: $1000, 3 hobby-ügyfél egy-egy nyitott tickettel, 1 ingyenes szerver, $15 MRR.
  const p = {
    cash: 100000,
    mrr: 1500,
    rep: 50,
    era: 1 as EraId,
    seo: 33, ppc: 33, ref: 34,
    hobby: 500, business: 1500,
    servers: 1,
    upgrades: new Set<string>(),
    shiftsToday: 0,
    bridgeUsed: false,
  };
  const customers: SimCustomer[] = [];
  for (let i = 0; i < 3; i++) customers.push({ sat: pickPersonaSat(r), tier: 'hobby', active: true, tickets: [0] });
  const pending: EventType[] = [];

  const out: SimDay[] = [];
  let minCash = p.cash;
  let brokeDay: number | null = null;
  let churnedTotal = 0;
  let acquiredTotal = 0;
  let bridgeDay: number | null = null;
  let ppcToday = 0;
  let lastActive = 0;

  // A profil napi döntésének ideje (a nap hányadik tickje).
  const actTick = profile === 'active' ? 12 * 12 : 19 * 12;

  if (profile === 'active') {
    p.seo = 25; p.ppc = 50; p.ref = 25;
    p.hobby = 700; p.business = 2000; // a régi szabályokkal a max ár ($10/$30) lenne ingyen pénz — lásd price_elasticity
  }

  const totalTicks = days * TICKS_PER_DAY;
  for (let t = 1; t <= totalTicks; t++) {
    const now = t * TICK_MINUTES * 60;
    const dayIdx = Math.floor(now / 86400);
    const tickOfDay = t % TICKS_PER_DAY;

    // 0. napi műszak-keret nullázás (UTC éjfél)
    if (tickOfDay === 0) p.shiftsToday = 0;

    // Játékos-döntések (a tick előtt, ahogy egy oldalbetöltés a lazy-ticket is megelőzi).
    if (profile !== 'idle' && tickOfDay === actTick) { act(profile, now); lastActive = now; }

    // 0.5 csendes elégedettség (félnaponta)
    const engaged = isEngaged(rules, now, lastActive);
    if (rules.quiet_satisfaction && engaged && (tickOfDay === 0 || tickOfDay === TICKS_PER_DAY / 2)) {
      const q = rules.quiet_satisfaction;
      for (const c of customers) if (c.active && c.tickets.length === 0 && c.sat < q.cap) c.sat = Math.min(q.cap, c.sat + q.step);
    }

    // 1. MRR-csordogálás
    if (p.mrr > 0) p.cash += Math.round(p.mrr * (TICK_MINUTES / (60 * 24 * 30)));

    // 3. ticketek
    for (const c of customers) {
      if (!c.active) continue;
      if (r() < ticketSpawnProb(rules, c.sat)) c.tickets.push(now);
    }

    // 4. lemorzsolódás
    {
      let activeN = customers.filter((c) => c.active).length;
      const cutoff = now - rules.churn_hours * 3600;
      for (const c of customers) {
        if (!c.active || !c.tickets.some((ts) => ts < cutoff)) continue;
        if (activeN <= rules.churn_floor_customers) break;
        if (r() < churnProb(rules, c.sat, false)) {
          c.active = false;
          activeN--;
          churnedTotal++;
          // v2: a lemorzsolódott ügyfél ticketjei lezárulnak (nem foglalnak helyet a műszakban).
          if (rules.close_tickets_on_churn) c.tickets = [];
        }
      }
    }

    // 5. MRR újraszámolás
    p.mrr = customers.reduce((s, c) => s + (c.active ? (c.tier === 'business' ? p.business : p.hobby) : 0), 0);

    // 6. marketing + beszerzés
    {
      const spend = ppcSpendPerTick(rules, { ppc_pct: p.ppc, cash_cents: p.cash, mrr_cents: p.mrr });
      const prob = acquisitionProb(rules, {
        seo_pct: p.seo, ppc_effective_pct: spend.effective_pct, referral_pct: p.ref,
        reputation: p.rep, era: p.era, is_pro: false, age_days: now / 86400,
        pricing_hobby_cents: p.hobby, pricing_business_cents: p.business,
      });
      if (prob > 0) {
        if (r() < prob) {
          const tier = r() < p.rep / 200 ? 'business' : 'hobby';
          customers.push({ sat: pickPersonaSat(r), tier, active: true, tickets: [] });
          acquiredTotal++;
        }
        if (spend.cost_cents > 0) {
          p.cash = Math.max(0, p.cash - spend.cost_cents);
          ppcToday += spend.cost_cents;
        }
      }
    }

    // 6.5 áthidaló befektető (v2)
    if (bridgeDue(rules, { cash_cents: p.cash, age_days: now / 86400, already_used: p.bridgeUsed })) {
      p.cash += rules.bridge!.grant_cents;
      p.bridgeUsed = true;
      bridgeDay = dayIdx;
    }

    // 7. véletlen esemény
    if (r() < rules.random_event_prob_per_tick) {
      const pool = eventPoolForEra(p.era);
      pending.push(pool[Math.floor(r() * pool.length)]);
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
      current_era: p.era, mrr_usd_cents: p.mrr, server_count: p.servers,
      days_alive: Math.floor(now / 86400), reputation: p.rep,
    });
    if (target) p.era = target.era;

    minCash = Math.min(minCash, p.cash);
    if (brokeDay === null && p.cash < 100) brokeDay = dayIdx;

    if (tickOfDay === 0) {
      out.push({
        day: dayIdx,
        cash_cents: p.cash,
        mrr_cents: p.mrr,
        customers: customers.filter((c) => c.active).length,
        reputation: p.rep,
        era: p.era,
        open_tickets: customers.reduce((s, c) => s + c.tickets.length, 0),
        ppc_spent_cents: ppcToday,
        bridge_used: p.bridgeUsed,
      });
      ppcToday = 0;
    }
  }

  return {
    rules: rules.id, profile, seed, days: out,
    min_cash_cents: minCash, broke_day: brokeDay,
    churned_total: churnedTotal, acquired_total: acquiredTotal, bridge_day: bridgeDay,
  };

  // ——— a profilok napi döntései ———
  function act(prof: ProfileId, now: number): void {
    // Műszak: a legrégebbi nyitott ticketek (a régi start.ts a lemorzsolódott ügyfelekét is behúzta).
    if (p.shiftsToday < 1) {
      const queue: Array<{ c: SimCustomer; ts: number }> = [];
      for (const c of customers) {
        if (rules.close_tickets_on_churn && !c.active) continue;
        for (const ts of c.tickets) queue.push({ c, ts });
      }
      queue.sort((a, b) => a.ts - b.ts);
      const batch = queue.slice(0, rules.shift_ticket_limit);
      if (batch.length > 0) {
        p.shiftsToday++;
        for (const { c, ts } of batch) {
          if (prof === 'active') {
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
      const opts = EVENT_DEFINITIONS[ev].options
        .filter((o) => o.id !== 'counter_offer') // véletlen kimenetű: kihagyjuk a determinizmus kedvéért
        .map((o) => {
          const res = o.apply();
          return { id: o.id, res: { ...res, cash_delta_cents: scaleEventCash(rules, res.cash_delta_cents, p.mrr) } };
        });
      let pick = opts[0];
      if (prof === 'casual') {
        // a legolcsóbb, holtversenyben a jobb hírnevű
        pick = opts.reduce((b, o) => (o.res.cash_delta_cents > b.res.cash_delta_cents
          || (o.res.cash_delta_cents === b.res.cash_delta_cents && o.res.reputation_delta > b.res.reputation_delta) ? o : b));
      } else {
        const score = (o: typeof pick) => o.res.reputation_delta * 3 + o.res.satisfaction_delta_global + o.res.cash_delta_cents / 5000;
        const affordable = opts.filter((o) => p.cash + o.res.cash_delta_cents >= 20000);
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
    const lamp = SERVER_SPECS.lamp_box.purchase_cost_cents;
    if (prof === 'casual') {
      if (day > 0 && day % 14 === 0 && p.cash >= lamp + 20000) { p.cash -= lamp; p.servers++; }
    } else {
      if (p.servers < 3 && p.cash >= lamp + 30000) { p.cash -= lamp; p.servers++; }
      const up = UPGRADE_SPECS
        .filter((u) => u.era <= p.era && !p.upgrades.has(u.id) && (!u.prereq || p.upgrades.has(u.prereq)))
        .sort((a, b) => a.cost_usd_cents - b.cost_usd_cents)[0];
      if (up && p.cash - up.cost_usd_cents >= 50000) { p.cash -= up.cost_usd_cents; p.upgrades.add(up.id); }
    }
  }
}
