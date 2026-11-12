// Hyperscales — a gazdaság regressziós tesztje a determinisztikus szimulátorral (economy-sim.ts).
// A szimulátor a valódi tick képleteit (economy.ts) használja; több seeden fut, hogy ne egy szerencsés dobás döntsön.
import { describe, it, expect } from 'vitest';
import { simulate, ALL_PROFILES, type ProfileId, type SimResult } from '../economy-sim';
import { BALANCE_V2_RULES as ECONOMY, LEGACY_RULES, ECONOMY as LIVE, DEFAULT_PRICING, type EconomyRules } from '../economy';

// A csapat- és hálózat-kör előtti élő szabályok (a 3. korszak „most" napjához: Csaba kérése, hogy ne jöjjön korábban).
const PRE_TEAM: EconomyRules = { ...LIVE, staff: null, network: null };

// A 90 napos futások drágák (~1 s): a blokkok közösen használják őket (ugyanaz a seed → bitre ugyanaz az eredmény).
const memo = new Map<string, SimResult>();
const sim90 = (rules: EconomyRules, profile: ProfileId, seed: number, buy_network?: boolean): SimResult => {
  const k = `${rules === PRE_TEAM ? 'pre' : rules.id}:${profile}:${seed}:${buy_network ?? ''}`;
  if (!memo.has(k)) memo.set(k, simulate(rules, profile, { days: 90, seed, buy_network }));
  return memo.get(k)!;
};
import { SERVER_SPECS, serverCapacity } from '../server-types';
import { dedicatedFeeCents, dedicatedFeeMid } from '../dedicated';

// 2026-11-12 (játékmag): az ECONOMY itt az előző egyensúly-kör (v2) szabályai — a régi tesztek változatlanul
// azt rögzítik. Az élő (v3) szabályok tesztjei lent, a „v3" blokkban (LIVE).

const SEEDS = [1, 2, 3, 4, 5];
const run = (rules: typeof ECONOMY, profile: ProfileId, days = 60, buy_upgrades = true): SimResult[] =>
  SEEDS.map((seed) => simulate(rules, profile, { days, seed, buy_upgrades }));
const at = (r: SimResult, day: number) => r.days.find((d) => d.day === day)!;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('economy simulator', () => {
  it('is deterministic: the same seed gives the same curve', () => {
    expect(simulate(ECONOMY, 'casual', { days: 20, seed: 7 })).toEqual(simulate(ECONOMY, 'casual', { days: 20, seed: 7 }));
  });

  it('reproduces the old death spiral (legacy rules): idle is broke by day ~10, the players who act go negative', () => {
    for (const r of run(LEGACY_RULES, 'idle', 30)) {
      expect(r.broke_day).not.toBeNull();
      expect(r.broke_day!).toBeLessThanOrEqual(12);
      expect(at(r, 30).cash_cents).toBeLessThan(100); // csak az MRR-csordogálás centjei
    }
    for (const r of [...run(LEGACY_RULES, 'casual', 30), ...run(LEGACY_RULES, 'active', 30)]) {
      expect(r.min_cash_cents).toBeLessThan(0);
    }
  });
});

describe('balance v2 (live rules)', () => {
  it('60 days idle: money never goes below the ad reserve, and the 3 core customers keep paying', () => {
    for (const r of run(ECONOMY, 'idle')) {
      expect(r.min_cash_cents).toBeGreaterThanOrEqual(ECONOMY.ppc_budget!.reserve_cents - 100);
      expect(r.broke_day).toBeNull();
      for (const d of r.days) expect(d.customers).toBeGreaterThanOrEqual(ECONOMY.churn_floor_customers);
      expect(at(r, 60).mrr_cents).toBeGreaterThanOrEqual(1500);
      expect(at(r, 60).era).toBe(1); // tétlenül nem jár korszak-lépés
    }
  });

  it('no profile ever goes negative or broke', () => {
    for (const profile of ['idle', 'casual', 'active'] as const) {
      for (const r of run(ECONOMY, profile)) {
        expect(r.min_cash_cents).toBeGreaterThanOrEqual(0);
        expect(r.broke_day).toBeNull();
      }
    }
  });

  it('casual player grows slowly but surely: MRR keeps rising and ends well above the start', () => {
    for (const r of run(ECONOMY, 'casual')) {
      expect(at(r, 14).mrr_cents).toBeGreaterThan(at(r, 3).mrr_cents);
      expect(at(r, 60).mrr_cents).toBeGreaterThan(at(r, 14).mrr_cents);
      expect(at(r, 60).mrr_cents).toBeGreaterThanOrEqual(15000); // ≥ $150 MRR 60 nap alatt (kezdés: $15)
    }
    // a medián a második hónapban is nő (nem áll be platóra)
    const casual = run(ECONOMY, 'casual');
    expect(median(casual.map((r) => at(r, 60).mrr_cents))).toBeGreaterThan(median(casual.map((r) => at(r, 30).mrr_cents)));
  });

  it('active player grows faster than casual, but not trivially (Era 2 earlier; Era 3 needs most of the 60 days)', () => {
    const casual = run(ECONOMY, 'casual');
    const active = run(ECONOMY, 'active');
    expect(median(active.map((r) => at(r, 60).mrr_cents))).toBeGreaterThan(1.3 * median(casual.map((r) => at(r, 60).mrr_cents)));
    const eraDay = (r: SimResult, era: number) => r.days.find((d) => d.era >= era)?.day ?? 999;
    for (const r of active) expect(eraDay(r, 2)).toBeGreaterThanOrEqual(7); // a 7 napos kapu előtt senki
    expect(median(active.map((r) => eraDay(r, 2)))).toBeLessThan(median(casual.map((r) => eraDay(r, 2))));
    expect(median(active.map((r) => eraDay(r, 3)))).toBeGreaterThanOrEqual(35);
    for (const r of casual) expect(at(r, 60).era).toBeLessThanOrEqual(2);
  });

  it('the bridge investor is the safety net, not a habit: idle and casual never need it, nobody gets it twice', () => {
    for (const profile of ['idle', 'casual'] as const) {
      for (const r of run(ECONOMY, profile)) expect(r.bridge_day).toBeNull();
    }
    // (kétszer nem is kaphatja: a simulate a bridgeUsed jelzőt, a tick az events-sort nézi)
  });
});

describe('v3 (live rules): server fees, capacity, upgrades with real effects', () => {
  const lastDay = (r: SimResult) => r.days[r.days.length - 1];
  const med = (rs: SimResult[], f: (r: SimResult) => number) => median(rs.map(f));

  it('idle: the free starter server costs nothing, nobody goes broke, the 3 core customers stay', () => {
    for (const r of run(LIVE, 'idle')) {
      expect(r.fees_total_cents).toBe(0);
      expect(r.broke_day).toBeNull();
      expect(r.min_cash_cents).toBeGreaterThanOrEqual(LIVE.ppc_budget!.reserve_cents - 100);
      for (const d of r.days) expect(d.customers).toBeGreaterThanOrEqual(LIVE.churn_floor_customers);
      expect(lastDay(r).mrr_cents).toBeGreaterThanOrEqual(1500);
      expect(r.bridge_day).toBeNull();
    }
  });

  it('nobody goes below the debt limit; idle, casual and active never reach it or lose a server', () => {
    for (const profile of ALL_PROFILES) {
      for (const r of run(LIVE, profile)) expect(r.min_cash_cents).toBeGreaterThanOrEqual(-LIVE.debt_limit_cents);
    }
    for (const profile of ['idle', 'casual', 'active'] as const) {
      for (const r of run(LIVE, profile)) {
        expect(r.broke_day).toBeNull();
        expect(r.sold_total).toBe(0);
        expect(r.min_cash_cents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('casual grows slowly, and there is a point where buying a server is worth it', () => {
    for (const r of run(LIVE, 'casual')) {
      expect(at(r, 14).mrr_cents).toBeGreaterThan(at(r, 3).mrr_cents);
      expect(at(r, 60).mrr_cents).toBeGreaterThan(at(r, 30).mrr_cents);
      expect(at(r, 60).mrr_cents).toBeGreaterThanOrEqual(15000);
      // a kezdőgép (15 hely) megtelik, és az alkalmi játékos vesz mellé
      const firstBuy = r.days.find((d) => d.servers > 1)?.day ?? 999;
      expect(firstBuy).toBeGreaterThanOrEqual(3);
      expect(firstBuy).toBeLessThanOrEqual(30);
      expect(lastDay(r).customers).toBeGreaterThan(SERVER_SPECS.lamp_box.capacity); // több, mint egy gépnyi
      expect(r.fees_total_cents).toBeGreaterThan(0);
    }
  });

  it('capacity really limits: without new servers the customer count is capped and customers are lost', () => {
    for (const r of run(LIVE, 'never_buy')) {
      for (const d of r.days) expect(d.customers).toBeLessThanOrEqual(d.capacity);
      expect(lastDay(r).capacity).toBe(SERVER_SPECS.lamp_box.capacity);
      expect(r.lost_total).toBeGreaterThanOrEqual(20);
    }
    // ugyanez a régi (v2) szabályokkal: semmi nem korlátoz
    for (const r of run(ECONOMY, 'never_buy')) expect(lastDay(r).customers).toBeGreaterThan(SERVER_SPECS.lamp_box.capacity * 2);
  });

  it('good decisions beat bad ones: timely servers beat never buying and overbuying', () => {
    const active = run(LIVE, 'active');
    const never = run(LIVE, 'never_buy');
    const over = run(LIVE, 'overbuy');
    const mrr60 = (r: SimResult) => lastDay(r).mrr_cents;
    const cash60 = (r: SimResult) => lastDay(r).cash_cents;
    expect(med(active, mrr60)).toBeGreaterThan(3 * med(never, mrr60));
    expect(med(active, mrr60)).toBeGreaterThan(1.3 * med(over, mrr60));
    expect(med(active, cash60)).toBeGreaterThan(med(over, cash60));
    // a túlvásárló üres gépekért fizet: több havidíj, és a tartozás-határig is eljut
    expect(med(over, (r) => r.fees_total_cents)).toBeGreaterThan(2 * med(active, (r) => r.fees_total_cents));
    expect(over.filter((r) => r.broke_day !== null || r.min_cash_cents < 0).length).toBeGreaterThanOrEqual(3);
    // seedenként is: az aktív játékos legalább ugyanannyit ér el, mint aki soha nem vesz gépet
    for (let i = 0; i < SEEDS.length; i++) expect(mrr60(active[i])).toBeGreaterThan(mrr60(never[i]));
  });

  // 2026-11-12 (csapat-utókör): 90 napon mérve. A 60. napon a fejlesztés még befektetés: 30 seeden már a kör előtt is
  // a fejlesztés nélküli játékos MRR-mediánja volt nagyobb ($1064 > $950), az 5 seedes 60 napos mérés csak 2%-kal,
  // szerencsésen teljesült, és a valódi toborzás (recruit_ad) apró eltolása megfordította. 90 napon a különbség
  // egyértelmű (5 seed: $2805 vs $1831; 30 seed: $1845 vs $1778, átlag $2122 vs $1779).
  it('good upgrades pay off: the same active player ends with more MRR when buying them (90 days)', () => {
    const withUp = SEEDS.map((seed) => simulate(LIVE, 'active', { days: 90, seed }));
    const without = SEEDS.map((seed) => simulate(LIVE, 'active', { days: 90, seed, buy_upgrades: false }));
    expect(med(withUp, (r) => lastDay(r).mrr_cents)).toBeGreaterThan(med(without, (r) => lastDay(r).mrr_cents));
  });

  it('the active player outgrows casual, and still needs most of the 60 days for Era 3', () => {
    const casual = run(LIVE, 'casual');
    const active = run(LIVE, 'active');
    expect(med(active, (r) => lastDay(r).mrr_cents)).toBeGreaterThan(med(casual, (r) => lastDay(r).mrr_cents));
    const eraDay = (r: SimResult, era: number) => r.days.find((d) => d.era >= era)?.day ?? 999;
    for (const r of active) expect(eraDay(r, 2)).toBeGreaterThanOrEqual(7);
    expect(med(active, (r) => eraDay(r, 3))).toBeGreaterThanOrEqual(35);
  });
});

describe('v3 dedicated box: one big business client (2026-11-12, dedikált-kör)', () => {
  // 10 seed, mert a dedikált ügyfél egy-egy jelentkezése/távozása nagyot mozdít egy futáson.
  const SEEDS10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const cache = new Map<ProfileId, SimResult[]>();
  const runs = (profile: ProfileId): SimResult[] => {
    // 90 nap (a 3. korszak méréséhez); a 60 napos mutatók ugyanezekből a futásokból jönnek (a futás első 60 napja
    // bitre azonos egy 60 napos futással).
    if (!cache.has(profile)) cache.set(profile, SEEDS10.map((seed) => sim90(LIVE, profile, seed)));
    return cache.get(profile)!;
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Az átlagos MRR a 2. hónapban (31–60. nap): kevésbé zajos, mint egyetlen nap.
  const mrrMonth2 = (r: SimResult) => mean(r.days.filter((d) => d.day > 30 && d.day <= 60).map((d) => d.mrr_cents));
  const mrr60 = (r: SimResult) => at(r, 60).mrr_cents;
  const T = { timeout: 180_000 };

  it('the box costs a little, the client pays a lot: payback in 1.5–4 months', () => {
    const d = LIVE.dedicated!;
    const box = SERVER_SPECS.dedicated_box;
    expect(serverCapacity('dedicated_box', 1)).toBe(0); // a sima ügyfelek nem férnek rá
    const mid = dedicatedFeeMid(d);
    const months = box.purchase_cost_cents / (mid - box.monthly_cost_cents);
    expect(months).toBeGreaterThanOrEqual(1.5); // 2026-11-12 este: $350 → ~1,8 hónap
    expect(months).toBeLessThanOrEqual(4);
    // a díj jóval több, mint egy sima ügyfélé (business: $15–$30)
    expect(d.fee_min_cents).toBeGreaterThanOrEqual(10 * DEFAULT_PRICING.business);
    for (let id = 1; id <= 200; id++) {
      const f = dedicatedFeeCents(d, id);
      expect(f).toBeGreaterThanOrEqual(d.fee_min_cents);
      expect(f).toBeLessThanOrEqual(d.fee_max_cents);
    }
  });

  it('the dedicated player buys the box early in Era 2 and signs a big client', T, () => {
    const ded = runs('dedicated');
    for (const r of ded) {
      expect(r.dedicated_bought_day).not.toBeNull();
      expect(r.dedicated_bought_day!).toBeLessThanOrEqual(20);
      expect(r.min_cash_cents).toBeGreaterThanOrEqual(0);
      expect(r.sold_total).toBe(0);
    }
    expect(ded.filter((r) => r.dedicated_signed >= 1).length).toBeGreaterThanOrEqual(8);
    // aki rendesen kiszolgálja, az meg is tartja
    expect(mean(ded.map((r) => r.dedicated_lost))).toBeLessThanOrEqual(0.3);
  });

  it('dedicated is measurably better than no dedicated, but not by orders of magnitude', T, () => {
    const act = runs('active');
    const ded = runs('dedicated');
    expect(median(ded.map(mrrMonth2))).toBeGreaterThan(1.15 * median(act.map(mrrMonth2)));
    expect(mean(ded.map(mrrMonth2))).toBeGreaterThan(1.1 * mean(act.map(mrrMonth2)));
    expect(median(ded.map(mrr60))).toBeGreaterThan(median(act.map(mrr60)));
    expect(median(ded.map(mrrMonth2))).toBeLessThan(2 * median(act.map(mrrMonth2)));
  });

  it('the big client does not speed up Era 3: its fee does not count for the era MRR (Csaba: „nem hamar kipörgethető")', T, () => {
    const ded = runs('dedicated');
    const eraDay = (r: SimResult, era: number) => r.days.find((d) => d.era >= era)?.day ?? 999;
    // 2026-11-12 (csapat-kör): a 3. korszak napja seedenként 40 és 85 közt szór, ezért 20 seeden, és a csapat-kör
    // előtti szabályok aktív játékosához mérjük (a mostani „active" már csapatot is épít — lásd a csapat-blokkot).
    const S20 = Array.from({ length: 20 }, (_, i) => i + 1);
    const ded20 = S20.map((seed) => sim90(LIVE, 'dedicated', seed));
    const pre20 = S20.map((seed) => sim90(PRE_TEAM, 'active', seed));
    expect(median(ded20.map((r) => eraDay(r, 3)))).toBeGreaterThanOrEqual(median(pre20.map((r) => eraDay(r, 3))));
    expect(median(ded.map((r) => eraDay(r, 3)))).toBeGreaterThanOrEqual(35);
    // a kijelzett MRR viszont a teljes összeg: a nagy ügyfél díja benne van
    for (const r of ded) for (const d of r.days) expect(d.mrr_cents).toBeGreaterThanOrEqual(d.dedicated_mrr_cents);
    expect(ded.some((r) => r.days.some((d) => d.dedicated_mrr_cents > 0))).toBe(true);
  });

  it('buying the box and ignoring the client is not better than never buying it', T, () => {
    const act = runs('active');
    const neg = runs('dedicated_neglect');
    // 2026-11-12 este ($350-os gép): a magára hagyott ügyfél díja a távozásáig hoz valamennyit, ezért a 2–3. hónap
    // átlagát nézzük (hosszabb távon), nem csak a 2. hónapét.
    const mrrMonths23 = (r: SimResult) => mean(r.days.filter((d) => d.day > 30 && d.day <= 90).map((d) => d.mrr_cents));
    expect(mean(neg.map(mrrMonths23))).toBeLessThan(mean(act.map(mrrMonths23)));
    expect(median(neg.map(mrr60))).toBeLessThanOrEqual(median(act.map(mrr60)));
    // a nagy ügyfél nála nem marad meg
    expect(mean(neg.map((r) => r.dedicated_lost))).toBeGreaterThanOrEqual(1);
    for (const r of neg) expect(r.min_cash_cents).toBeGreaterThanOrEqual(-LIVE.debt_limit_cents);
  });
});

describe('v3 team and network (2026-11-12, csapat- és hálózat-kör)', () => {
  const S10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const cache = new Map<string, SimResult[]>();
  const runs = (profile: ProfileId, opts: { buy_network?: boolean; rules?: EconomyRules } = {}): SimResult[] => {
    const k = `${profile}:${opts.buy_network ?? ''}:${opts.rules ? 'pre' : ''}`;
    if (!cache.has(k)) cache.set(k, S10.map((seed) => sim90(opts.rules ?? LIVE, profile, seed, opts.buy_network)));
    return cache.get(k)!;
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const mrrMonth3 = (r: SimResult) => mean(r.days.filter((d) => d.day > 60 && d.day <= 90).map((d) => d.mrr_cents));
  const mrr90 = (r: SimResult) => at(r, 90).mrr_cents;
  const eraDay = (r: SimResult, era: number) => r.days.find((d) => d.era >= era)?.day ?? 999;
  const T = { timeout: 300_000 };

  it('Era 1 has no staff and no network costs: the idle player never hires, never pays, never goes broke', T, () => {
    for (const r of runs('idle')) {
      expect(r.broke_day).toBeNull();
      expect(r.staff_hired).toBe(0);
      expect(r.salaries_total_cents).toBe(0);
      expect(r.network_fees_total_cents).toBe(0);
      for (const d of r.days) expect(d.era).toBe(1);
    }
    // senki nem vesz fel embert az 1. korszakban
    for (const profile of ['active', 'casual', 'overhire_staff'] as const) {
      for (const r of runs(profile)) for (const d of r.days) if (d.era < 2) expect(d.staff).toBe(0);
    }
  });

  it('a good team makes the active player measurably better than never hiring anyone', T, () => {
    const team = runs('active');
    const none = runs('no_staff');
    expect(mean(team.map(mrrMonth3))).toBeGreaterThan(1.15 * mean(none.map(mrrMonth3)));
    expect(median(team.map(mrr90))).toBeGreaterThan(median(none.map(mrr90)));
    for (const r of team) {
      expect(r.min_cash_cents).toBeGreaterThanOrEqual(0);
      expect(r.sold_total).toBe(0);
      expect(r.staff_cut_debt).toBe(0);
    }
    expect(mean(team.map((r) => r.staff_hired))).toBeGreaterThanOrEqual(1.5);
    expect(mean(team.map((r) => r.support_resolved))).toBeGreaterThan(20);
    // a csapat a korlátokon belül marad
    for (const r of team) for (const d of r.days) expect(d.staff).toBeLessThanOrEqual(d.era >= 3 ? 6 : d.era >= 2 ? 3 : 0);
    // a jó csapatépítő bérei az MRR kis részét viszik
    for (const r of team) expect(at(r, 90).salary_monthly_cents).toBeLessThanOrEqual(0.35 * at(r, 90).mrr_cents);
  });

  it('overhiring hurts (wage spiral), but the safety nets hold: people go before machines, nobody goes bankrupt', T, () => {
    const over = runs('overhire_staff');
    const none = runs('no_staff');
    expect(median(over.map(mrr90))).toBeLessThan(median(none.map(mrr90)));
    expect(mean(over.map(mrrMonth3))).toBeLessThan(0.8 * mean(none.map(mrrMonth3)));
    for (const r of over) {
      expect(r.min_cash_cents).toBeGreaterThanOrEqual(-LIVE.debt_limit_cents);
      expect(r.sold_total).toBe(0); // a tartozásnál előbb az ember megy, a gép nem
      for (const d of r.days) expect(d.customers).toBeGreaterThanOrEqual(LIVE.churn_floor_customers);
    }
    // a spirál valóban fáj: többeknél elmegy valaki (felmond vagy a tartozás miatt el kell küldeni)
    expect(over.filter((r) => r.staff_quit + r.staff_cut_debt >= 1).length).toBeGreaterThanOrEqual(5);
  });

  it('too little bandwidth slows the sites: the same active player without network upgrades does much worse', T, () => {
    const withNet = runs('active');
    const noNet = runs('active', { buy_network: false });
    expect(mean(noNet.map((r) => r.slow_halfdays))).toBeGreaterThan(5 * Math.max(1, mean(withNet.map((r) => r.slow_halfdays))));
    expect(mean(noNet.map(mrrMonth3))).toBeLessThan(0.8 * mean(withNet.map(mrrMonth3)));
    // a hálózat havidíja valódi költség, de kicsi a haszonhoz képest
    for (const r of withNet) expect(r.network_fees_total_cents).toBeGreaterThan(0);
  });

  it('Era 3 does not come earlier than before the team round (Csaba: „nem hamar kipörgethető")', T, () => {
    // 20 seed: a 3. korszak napja seedenként 40 és 85 közt szór.
    const S20 = Array.from({ length: 20 }, (_, i) => i + 1);
    const now20 = S20.map((seed) => sim90(LIVE, 'active', seed));
    const pre20 = S20.map((seed) => sim90(PRE_TEAM, 'active', seed));
    expect(median(now20.map((r) => eraDay(r, 3)))).toBeGreaterThanOrEqual(median(pre20.map((r) => eraDay(r, 3))));
    expect(median(now20.map((r) => eraDay(r, 3)))).toBeGreaterThanOrEqual(55);
    for (const r of runs('active')) expect(eraDay(r, 2)).toBeGreaterThanOrEqual(7);
  });
});

// Görbék a grafikonhoz: SIM_DUMP=1 npx vitest run src/lib/game/__tests__/economy-sim.test.ts
describe.runIf(!!process.env.SIM_DUMP)('dump', () => {
  it('prints the curves as JSON', () => {
    const outRows: unknown[] = [];
    for (const rules of [LEGACY_RULES, ECONOMY, LIVE]) {
      for (const profile of ALL_PROFILES) {
        for (const seed of SEEDS) {
          const r = simulate(rules, profile, { days: 60, seed });
          outRows.push({ rules: r.rules, profile, seed, broke_day: r.broke_day, min_cash: r.min_cash_cents, bridge_day: r.bridge_day, churned: r.churned_total, acquired: r.acquired_total, lost: r.lost_total, sold: r.sold_total, fees: r.fees_total_cents, ded_signed: r.dedicated_signed, ded_lost: r.dedicated_lost, days: r.days });
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('SIMJSON' + JSON.stringify(outRows) + 'SIMJSON');
  });
});
