// src/lib/game/economy.ts
// Hyperscales — a gazdaság szabályai EGY helyen (2026-11-12, egyensúly-kör).
//
// A tick (src/lib/game/tick.ts), a pénzáramlás-kijelzés (runway.ts) és a determinisztikus szimulátor
// (economy-sim.ts) ugyanezeket a tiszta függvényeket hívja, így a szimulátor számai a valódi tick számai.
// A véletlent mindig a hívó dobja: itt csak valószínűségek és összegek születnek.
//
// Két szabálykészlet:
//  - LEGACY_RULES: a 2026-11-12 előtti viselkedés (csak a szimulátor „előtte" görbéihez).
//  - ECONOMY: az élő szabályok. A régi → új értékek mellett az indoklás; a szimulátor (economy-sim.ts) és a
//    regressziós teszt (__tests__/economy-sim.test.ts) mutatja a számokat.
//
// A halálspirál oka (régi szabályok, szimulátor): a PPC a 33/33/34-es alap-mixben napi ~$95-öt vitt, de
// a beszerzési képletben egy PPC-pont pontosan annyit ért, mint egy ingyenes SEO-pont — tiszta veszteség
// volt. Közben ügyfelenként napi ~1,15 ticket jött (0,4%/tick), egy ingyenes műszak 10-et visz el, a 48 óránál
// régebbi ticket pedig tickenként 30%-kal elvitte az ügyfelet: a tétlen játékos 2-3 nap alatt minden ügyfelét
// elvesztette, a pénze ~10 nap alatt elfogyott, és nem maradt semmi, amiből talpra állhatott volna.

export const TICK_MINUTES = 5;
export const TICKS_PER_DAY = (24 * 60) / TICK_MINUTES;

export interface PpcBudgetRule {
  /** A napi bevétel (MRR/30) ekkora hányada mehet hirdetésre. */
  income_share: number;
  /** A tartalék fölötti pénz ekkora hányada mehet el naponta hirdetésre. */
  cash_share_per_day: number;
  /** Ennyi pénz alá a hirdetés sosem viszi le a kasszát (centben). */
  reserve_cents: number;
}

export interface BridgeRule {
  /** Ennyi pénz (cent) alatt jön az egyszeri áthidaló befektető. */
  below_cents: number;
  /** Az egyszeri juttatás (cent). */
  grant_cents: number;
  /** Az alapítás után legalább ennyi nap (az első percekben ne jöjjön). */
  min_age_days: number;
}

export interface EconomyRules {
  id: 'legacy' | 'v2' | 'v3';
  /** Ügyfelenkénti ticket-esély tickenként. */
  ticket_spawn_prob_per_tick: number;
  /** Ennyi elégedettségtől számít „elégedettnek" az ügyfél (ritkább ticket, türelmesebb). */
  happy_sat: number;
  /** Elégedett ügyfél ticket-szorzója. */
  happy_ticket_factor: number;
  /** Ennél régebbi nyitott ticket esetén indul a lemorzsolódás-dobás. */
  churn_hours: number;
  /** Tickenkénti lemorzsolódás-esély (lejárt tickettel). */
  churn_roll_prob: number;
  /** Elégedett ügyfél lemorzsolódás-szorzója. */
  happy_churn_factor: number;
  /** Pro-játékos lemorzsolódás-szorzója. */
  pro_churn_factor: number;
  /** Ennyi aktív ügyfél alá a lemorzsolódás nem visz (törzsügyfelek: mindig hoznak egy kis MRR-t). */
  churn_floor_customers: number;
  acquisition_base_prob: number;
  era_factor: Record<number, number>;
  pro_acquisition_factor: number;
  welcome_boost_days: number;
  welcome_boost_factor: number;
  /** PPC tickenkénti költsége 100%-os PPC-aránynál (cent). */
  ppc_full_cost_per_tick_cents: number;
  /** Egy PPC-pont beszerzési súlya (az SEO-pont súlya 1). */
  ppc_acquisition_weight: number;
  /** null = régi viselkedés: a teljes PPC-költség megy, ha van rá pénz, különben a PPC kiesik. */
  ppc_budget: PpcBudgetRule | null;
  /** null = nincs áthidaló befektető. */
  bridge: BridgeRule | null;
  /** true = esemény- és műszakköltség nem viheti 0 alá a pénzt. */
  clamp_costs_at_zero: boolean;
  /** Ennyi ticket fér egy műszakba. */
  shift_ticket_limit: number;
  /** true = a lemorzsolódott ügyfél nyitott ticketjei lezárulnak (nem foglalnak helyet a következő műszakban). */
  close_tickets_on_churn: boolean;
  /** Véletlen esemény esélye tickenként. */
  random_event_prob_per_tick: number;
  /** null = az események költsége mindig a névleges; különben a cég méretével (MRR) arányos, alsó határral. */
  event_cost_scale: { full_at_mrr_cents: number; min_factor: number } | null;
  /** null = nincs; különben 12 óránként +step elégedettség minden aktív ügyfélnek, akinek nincs nyitott ticketje (max cap),
   *  ha a játékos az utolsó engagement_window_hours órában belépett (a magára hagyott cég ügyfelei nem szeretik meg). */
  quiet_satisfaction: { step: number; cap: number } | null;
  /** true = a hírnév csak akkor kúszik felfelé, ha nincs 48 óránál régebbi megválaszolatlan ticket. */
  rep_drift_requires_no_stale_tickets: boolean;
  /** null = mindegy; különben a csendes elégedettség és a felfelé kúszó hírnév csak akkor jár, ha a játékos
   *  ennyi órán belül belépett. */
  engagement_window_hours: number | null;
  /** Ár-rugalmasság: a beszerzés × (árindex)^−e, ahol az árindex az alapárhoz mért (hobby ¾, business ¼ súllyal). 0 = nincs. */
  price_elasticity: number;
  /** null = nincs; különben ennyi hírnév alatt tickenként ekkora eséllyel +1 (lassú visszatérés, nincs spirál). */
  rep_recovery: { below: number; prob_per_tick: number } | null;
  // ─── v3 (2026-11-12, játékmag): a döntéseknek súlya van ───
  /** true = a tick időarányosan levonja a szerverek havidíját (servers.monthly_cost_cents × fee_pct). */
  server_fees: boolean;
  /** true = új ügyfél csak szabad helyre jöhet; ha nincs hely, elmarad (és ezt számoljuk). */
  capacity_limit: boolean;
  /** true = a fejlesztések hatása (upgrade-effects.ts) érvényes. */
  upgrade_effects: boolean;
  /** A havidíj legfeljebb eddig viheti mínuszba a pénzt (centben, pozitív szám); ha eléri, egy gép leáll (eladjuk). */
  debt_limit_cents: number;
  /** Az automatikusan eladott gépért a vételár ennyi %-a jön vissza. */
  auto_sell_refund_pct: number;
  /** Túlterhelés (több ügyfél, mint hely): ticket-szorzó 1 + factor × min(1, túllógás aránya), és 12 óránként
   *  −sat_step elégedettség mindenkinek. null = nincs. */
  overload: { ticket_factor: number; sat_step: number } | null;
}

export const LEGACY_RULES: EconomyRules = {
  id: 'legacy',
  ticket_spawn_prob_per_tick: 0.004,
  happy_sat: 70,
  happy_ticket_factor: 1,
  churn_hours: 48,
  churn_roll_prob: 0.30,
  happy_churn_factor: 1,
  pro_churn_factor: 0.5,
  churn_floor_customers: 0,
  acquisition_base_prob: 0.025,
  era_factor: { 1: 1, 2: 1.5, 3: 2, 4: 3 },
  pro_acquisition_factor: 2,
  welcome_boost_days: 7,
  welcome_boost_factor: 2,
  ppc_full_cost_per_tick_cents: 100,
  ppc_acquisition_weight: 1,
  ppc_budget: null,
  bridge: null,
  clamp_costs_at_zero: false,
  shift_ticket_limit: 10,
  close_tickets_on_churn: false,
  random_event_prob_per_tick: 0.007,
  event_cost_scale: null,
  price_elasticity: 0,
  rep_drift_requires_no_stale_tickets: false,
  engagement_window_hours: null,
  quiet_satisfaction: null,
  rep_recovery: null,
  server_fees: false,
  capacity_limit: false,
  upgrade_effects: false,
  debt_limit_cents: 0,
  auto_sell_refund_pct: 0,
  overload: null,
};

/** Az előző egyensúly-kör (2026-11-12 délelőtt) szabályai: a szimulátor „előtte" görbéihez. Minden eltérés a
 *  LEGACY_RULES-tól szándékos; az indoklás a fejkommentben és a tesztben. */
export const BALANCE_V2_RULES: EconomyRules = {
  ...LEGACY_RULES,
  id: 'v2',
  // 1,15 → 0,29 ticket/ügyfél/nap: egy ingyenes műszak (10 ticket) ~35 ügyfelet visz el, elégedett ügyfelekkel ~70-et.
  ticket_spawn_prob_per_tick: 0.001,
  happy_ticket_factor: 0.5,
  // Az elégedett ügyfél türelmesebb: egy kimaradt nap nem viszi el azonnal.
  happy_churn_factor: 0.25,
  // Kevesebb, de maradandóbb ügyfél: a régi ütem (alap-mixen ~1,2/nap, az első héten 2,4/nap) messze túlfutott a
  // ticket-kapacitáson, a többletet a lemorzsolódás vitte el. Így az új ügyfél nagyjából annyi, amennyit ki is lehet szolgálni.
  acquisition_base_prob: 0.012,
  // A 3 törzsügyfél a tétlen játékosnak is megmarad (alap-MRR, ~$15/hó).
  churn_floor_customers: 3,
  // A PPC végre ér valamit (2,5× az SEO-pont), és olcsóbb: 33%-on $95/nap → ~$5,8/nap.
  ppc_full_cost_per_tick_cents: 6,
  ppc_acquisition_weight: 2.5,
  // A hirdetés a megfizethetőhöz igazodik: a napi bevétel fele + a $200-os tartalék fölötti pénz 3%-a naponta.
  ppc_budget: { income_share: 0.5, cash_share_per_day: 0.03, reserve_cents: 20000 },
  // Egyszeri áthidaló befektető: $50 alatt $400 egyszer.
  bridge: { below_cents: 5000, grant_cents: 40000, min_age_days: 1 },
  clamp_costs_at_zero: true,
  // Hibajavítás: eddig a lemorzsolódott ügyfél ticketje a műszak 10 helyéből is elvett egyet.
  close_tickets_on_churn: true,
  // Napi ~2 esemény → hetente ~2: a régi ütemben a kezdő cég bevételének sokszorosát vitték el.
  random_event_prob_per_tick: 0.001,
  // Az esemény ára a cég méretéhez igazodik: $1000 MRR-től a teljes (névleges) ár, alatta arányosan, de legalább 10%.
  event_cost_scale: { full_at_mrr_cents: 100000, min_factor: 0.1 },
  // Ami nem romlik el, az lassan megszeretteti magát: nyitott ticket nélkül 12 óránként +1 elégedettség (max 75).
  // Így a ticketeit rendben tartó (alkalmi) játékos ügyfelei is „elégedetté" válnak → fele annyi ticket → nő a kapacitás.
  quiet_satisfaction: { step: 1, cap: 75 },
  // …de hírnevet csak a válaszoló cég épít: amíg lejárt ticket vár, a hírnév nem nő (a tétlen cég nem lép korszakot).
  rep_drift_requires_no_stale_tickets: true,
  // Mindkettő csak annak jár, aki 3 napon belül benézett: a magára hagyott cég nem lép korszakot.
  engagement_window_hours: 72,
  // A drágább csomag kevesebb új ügyfelet hoz: max áron (×2) a beszerzés ~35%-ra esik. Az árazás így döntés,
  // nem ingyen pénz: magas ár = lassabb növekedés, de kevesebb ticket ugyanakkora MRR-hez.
  price_elasticity: 1.5,
  // 40 alatti hírnév naponta ~3 ponttal (1%/tick) magától visszakúszik: egy rossz hét nem öli meg a beszerzést.
  rep_recovery: { below: 40, prob_per_tick: 0.01 },
};

/** Az élő szabályok (v3, játékmag-kör): a v2 + szerver-havidíj, kapacitás-korlát, a fejlesztések valódi hatása.
 *  Hogy miért így, azt a szimulátor (economy-sim.ts) és a regressziós teszt mutatja. */
export const ECONOMY: EconomyRules = {
  ...BALANCE_V2_RULES,
  id: 'v3',
  server_fees: true,
  capacity_limit: true,
  upgrade_effects: true,
  // Tartozás legfeljebb $100: ennyi elég, hogy egy rossz hét ne vigye el azonnal a gépet (a bevétel közben
  // csordogál, és az áthidaló befektető $50 alatt egyszer amúgy is jön), de a havidíj nem visz végtelen mínuszba.
  debt_limit_cents: 10000,
  // Az automatikusan eladott gépért a vételár 30%-a jön vissza (használt vas), ez rendezi a tartozást.
  auto_sell_refund_pct: 30,
  // Túlterhelésnél (pl. egy gép eladása után) dupla-tripla ticket, és 12 óránként −2 elégedettség.
  overload: { ticket_factor: 2, sat_step: 2 },
};

// ─── v3: szerver-havidíj, kapacitás, tartozás ───

const MONTH_SEC = 30 * 86400;

/**
 * A havidíj ebben a tickben (centben), állapot nélkül pontosan: a [prev, now) időszakra jutó rész, a cent-töredék
 * nem vész el (floor(total·now/hó) − floor(total·prev/hó)). monthlyTotalCents már a fee_pct-vel csökkentett összeg.
 */
export function serverFeeForTick(monthlyTotalCents: number, nowSec: number, prevSec: number = nowSec - TICK_MINUTES * 60): number {
  if (monthlyTotalCents <= 0 || nowSec <= prevSec) return 0;
  return Math.floor((monthlyTotalCents * nowSec) / MONTH_SEC) - Math.floor((monthlyTotalCents * prevSec) / MONTH_SEC);
}

/** A gépek havidíja a fejlesztésekkel (fee_pct, negatív = olcsóbb). */
export function effectiveMonthlyFees(listedMonthlyCents: number, feePct: number): number {
  return Math.max(0, Math.round(listedMonthlyCents * Math.max(0, 1 + feePct / 100)));
}

/** A havidíj levonása után a pénz: a tartozás-határnál (−debt_limit) megáll; ami nem fért le, az „over". */
export function applyServerFee(rules: EconomyRules, cashCents: number, feeCents: number): { cash: number; over_limit: boolean } {
  if (feeCents <= 0) return { cash: cashCents, over_limit: false };
  const floor = -rules.debt_limit_cents;
  const next = cashCents - feeCents;
  if (next < floor) return { cash: Math.min(cashCents, floor), over_limit: true };
  return { cash: next, over_limit: next <= floor };
}

/** Melyik gép áll le (kerül eladásra) a tartozás-határnál: a legdrágább ÜRES fizetős gép; ha nincs üres, a
 *  legdrágább fizetős. A díjmentes (kezdő) gép soha. Visszaad: index vagy −1. */
export function pickServerToSell(servers: Array<{ monthly_cost_cents: number; load: number }>): number {
  let best = -1;
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    if (s.monthly_cost_cents <= 0) continue;
    if (best < 0) { best = i; continue; }
    const b = servers[best];
    const sEmpty = s.load === 0, bEmpty = b.load === 0;
    if (sEmpty !== bEmpty) { if (sEmpty) best = i; continue; }
    // azonos „üresség": a drágább; holtversenyben a később vett (a lista végén lévő)
    if (s.monthly_cost_cents >= b.monthly_cost_cents) best = i;
  }
  return best;
}

/** Túlterhelés aránya: (ügyfelek − hely) / hely, 0 ha belefér. Hely nélkül, ügyféllel: 1. */
export function overloadRatio(customers: number, capacity: number): number {
  if (customers <= capacity) return 0;
  if (capacity <= 0) return 1;
  return Math.min(1, (customers - capacity) / capacity);
}

/** A ticket-esély szorzója a túlterhelésből (1 = nincs). */
export function overloadTicketFactor(rules: EconomyRules, customers: number, capacity: number): number {
  if (!rules.capacity_limit || !rules.overload) return 1;
  return 1 + rules.overload.ticket_factor * overloadRatio(customers, capacity);
}

/** A flotta kihasználtsága (%, egészre kerekítve; hely nélkül 100, ha van ügyfél). */
export function fleetUtilPct(customers: number, capacity: number): number {
  if (capacity <= 0) return customers > 0 ? 100 : 0;
  return Math.round((customers / capacity) * 100);
}

/** Ettől a kihasználtságtól szól a vezérlő: „vegyél szervert". */
export const FLEET_WARN_PCT = 80;

export interface PpcSpend {
  /** Ennyi centet von le a tick. */
  cost_cents: number;
  /** A beszerzésbe ténylegesen beszámító PPC-arány (0..ppc_pct), a költött pénzzel arányos. */
  effective_pct: number;
  /** true, ha a költségkeret miatt kevesebb ment el, mint a beállított arány kérte. */
  throttled: boolean;
}

/** A PPC-csatorna ebben a tickben: mennyi pénz megy el, és mennyit ér a beszerzésben. */
export function ppcSpendPerTick(
  rules: EconomyRules,
  p: { ppc_pct: number; cash_cents: number; mrr_cents: number },
): PpcSpend {
  const pct = Math.max(0, Math.min(100, p.ppc_pct || 0));
  const nominal = Math.round(rules.ppc_full_cost_per_tick_cents * (pct / 100));
  if (pct <= 0 || nominal <= 0) return { cost_cents: 0, effective_pct: 0, throttled: false };
  if (!rules.ppc_budget) {
    if (p.cash_cents >= nominal) return { cost_cents: nominal, effective_pct: pct, throttled: false };
    return { cost_cents: 0, effective_pct: 0, throttled: true };
  }
  const b = rules.ppc_budget;
  const budgetPerDay = Math.max(0, p.mrr_cents / 30) * b.income_share
    + Math.max(0, p.cash_cents - b.reserve_cents) * b.cash_share_per_day;
  const cap = Math.floor(budgetPerDay / TICKS_PER_DAY);
  const cost = Math.max(0, Math.min(nominal, cap, Math.max(0, p.cash_cents)));
  return { cost_cents: cost, effective_pct: pct * (cost / nominal), throttled: cost < nominal };
}

export interface AcquisitionInput {
  seo_pct: number;
  ppc_effective_pct: number;
  referral_pct: number;
  reputation: number;
  era: number;
  is_pro: boolean;
  age_days: number;
  /** A játékos árai (cent); ha hiányzik, az alapárral számol (szorzó 1). */
  pricing_hobby_cents?: number;
  pricing_business_cents?: number;
  /** v3: a fejlesztések acq_pct-je (pl. +15 = 15%-kal több új ügyfél). */
  acq_pct?: number;
}

export const DEFAULT_PRICING = { hobby: 500, business: 1500 } as const;

/** Az árazás beszerzési szorzója (1 = alapár; drágábban kevesebb, olcsóbban több új ügyfél). */
export function priceFactor(rules: EconomyRules, hobbyCents?: number, businessCents?: number): number {
  if (!rules.price_elasticity) return 1;
  const h = (hobbyCents ?? DEFAULT_PRICING.hobby) / DEFAULT_PRICING.hobby;
  const b = (businessCents ?? DEFAULT_PRICING.business) / DEFAULT_PRICING.business;
  const idx = Math.max(0.1, 0.75 * h + 0.25 * b);
  return Math.pow(idx, -rules.price_elasticity);
}

/** Tickenkénti esély egy új ügyfélre. 0, ha egyik csatorna sem él. */
export function acquisitionProb(rules: EconomyRules, a: AcquisitionInput): number {
  const mixTotal = a.seo_pct + a.ppc_effective_pct + a.referral_pct;
  if (mixTotal <= 0) return 0;
  const referralBoost = 1 + Math.max(0, a.reputation - 50) / 100;
  const effectiveMix = a.seo_pct + a.ppc_effective_pct * rules.ppc_acquisition_weight + a.referral_pct * referralBoost;
  const mixFactor = effectiveMix / 300;
  const eraFactor = rules.era_factor[a.era] ?? 1;
  const repFactor = Math.max(0.1, a.reputation / 100);
  const proFactor = a.is_pro ? rules.pro_acquisition_factor : 1;
  const welcome = a.age_days < rules.welcome_boost_days ? rules.welcome_boost_factor : 1;
  const price = priceFactor(rules, a.pricing_hobby_cents, a.pricing_business_cents);
  const upg = rules.upgrade_effects ? Math.max(0, 1 + (a.acq_pct ?? 0) / 100) : 1;
  return rules.acquisition_base_prob * mixFactor * eraFactor * repFactor * proFactor * welcome * price * upg;
}

/** Ügyfelenkénti ticket-esély tickenként. */
export function ticketSpawnProb(rules: EconomyRules, satisfaction: number, ticketPct = 0, overloadFactor = 1): number {
  const upg = rules.upgrade_effects ? Math.max(0, 1 + ticketPct / 100) : 1;
  return rules.ticket_spawn_prob_per_tick * (satisfaction >= rules.happy_sat ? rules.happy_ticket_factor : 1)
    * upg * overloadFactor;
}

/** Lemorzsolódás-esély tickenként egy lejárt tickettel rendelkező ügyfélre. */
export function churnProb(rules: EconomyRules, satisfaction: number, isPro: boolean, churnPct = 0): number {
  const upg = rules.upgrade_effects ? Math.max(0, 1 + churnPct / 100) : 1;
  return upg * rules.churn_roll_prob
    * (isPro ? rules.pro_churn_factor : 1)
    * (satisfaction >= rules.happy_sat ? rules.happy_churn_factor : 1);
}

/** Jár-e most az egyszeri áthidaló befektető. */
export function bridgeDue(
  rules: EconomyRules,
  p: { cash_cents: number; age_days: number; already_used: boolean },
): boolean {
  const b = rules.bridge;
  if (!b || p.already_used) return false;
  return p.age_days >= b.min_age_days && p.cash_cents < b.below_cents;
}

/** Egy költség (negatív delta) levonása után a pénz — a v2-ben 0 alá nem mehet. Pozitív delta változatlan. */
export function applyCashDelta(rules: EconomyRules, cashCents: number, deltaCents: number): number {
  const next = cashCents + deltaCents;
  if (deltaCents < 0 && rules.clamp_costs_at_zero) return cashCents <= 0 ? cashCents : Math.max(0, next);
  return next;
}

/** Az események költség-szorzója a cég mostani MRR-je alapján (1 = névleges ár). */
export function eventCostFactor(rules: EconomyRules, mrrCents: number): number {
  const sc = rules.event_cost_scale;
  if (!sc) return 1;
  return Math.max(sc.min_factor, Math.min(1, Math.max(0, mrrCents) / sc.full_at_mrr_cents));
}

/** Egy eseménydöntés pénzhatása a cég méretéhez igazítva: csak a költség skálázódik, a bevétel nem. */
export function scaleEventCash(rules: EconomyRules, deltaCents: number, mrrCents: number): number {
  if (deltaCents >= 0) return deltaCents;
  // 100 centre kerekítve, hogy a felirat ($30) és a levonás egyezzen.
  return -Math.max(100, Math.round((-deltaCents * eventCostFactor(rules, mrrCents)) / 100) * 100);
}

/** A feliratban szereplő árat („$300", „$1,200", „-$800") a skálázott összegre cseréli. */
export function rescaleMoneyLabel(label: string, nominalCents: number, scaledCents: number): string {
  if (nominalCents === scaledCents) return label;
  const nominalUsd = Math.abs(nominalCents) / 100;
  const scaledTxt = '$' + (Math.abs(scaledCents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return label.replace(/\$([\d,]+(?:\.\d+)?)(k?)/g, (m, num: string, k: string) => {
    const v = Number(num.replace(/,/g, '')) * (k ? 1000 : 1);
    return v === nominalUsd ? scaledTxt : m;
  });
}

/** Számít-e „gondozottnak" a cég (lásd engagement_window_hours). */
export function isEngaged(rules: EconomyRules, nowSec: number, lastActiveSec: number): boolean {
  return rules.engagement_window_hours === null || nowSec - lastActiveSec <= rules.engagement_window_hours * 3600;
}

/** Az alacsony-pénz figyelmeztetés küszöbe (cent): ez alatt a felület elmagyarázza, mi történik. */
export const LOW_CASH_WARN_CENTS = 10000;
