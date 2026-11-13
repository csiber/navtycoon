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
  /** v3 (2026-11-12, dedikált-kör): a dedikált gép egyetlen nagy ügyfele. null = nincs ilyen ügyfél
   *  (a dedikált gép a régi szabályokkal sima 1 helyes gép volt). Részletek: dedicated.ts. */
  dedicated: DedicatedRule | null;
  /** v3 (2026-11-12, csapat-kör): munkatársak a 2. korszaktól (staff.ts). null = nincs csapat (a régi szabályok). */
  staff: StaffRule | null;
  /** v3 (2026-11-12, hálózat-kör): sávszélesség, peering, DDoS-védelem a 2. korszaktól (network.ts). null = nincs. */
  network: NetworkRule | null;
  /** 2026-11-13 (végjáték): nagyvállalati szerződés a 4. korszakban (dedicated.ts). null = nincs. */
  enterprise?: EnterpriseRule | null;
}

/** A nagyvállalati ügyfél (plan_tier = 'enterprise'): ugyanaz a nagy-ügyfél-gondozás, mint a dedikáltnál
 *  (DedicatedRule: SLA, ticketek, lezárás, távozás), de nagyobb szerződés, és csak globális jelenléttel jön. */
export interface EnterpriseRule {
  min_era: number;
  /** Ennyi hírnévtől jelentkezik. */
  min_reputation: number;
  /** Ennyi felhőrégió és edge POP kell hozzá (a nagyvállalat több kontinensen fut). */
  min_cloud_regions: number;
  min_edge_pops: number;
  /** A szerződés havidíj-sávja (cent), az azonosítóból determinisztikusan (mint a dedikáltnál). */
  fee_min_cents: number;
  fee_max_cents: number;
  fee_step_cents: number;
}

export type StaffRole = 'support' | 'sre' | 'sales';
export const STAFF_ROLES: readonly StaffRole[] = ['support', 'sre', 'sales'];
export type StaffTrait = 'steady' | 'fast_learner' | 'frugal' | 'perfectionist';
export const STAFF_TRAITS: readonly StaffTrait[] = ['steady', 'fast_learner', 'frugal', 'perfectionist'];

/** A csapat szabályai — lásd staff.ts. A szintenkénti tömbök indexe: szint − 1 (1..3). */
export interface StaffRule {
  /** Ettől a korszaktól lehet felvenni. */
  min_era: number;
  /** Legfeljebb ennyi munkatárs korszakonként (a hiányzó korszak = 0). */
  max_by_era: Record<number, number>;
  /** 1. szintű havi bér szerepkörönként (cent). */
  base_salary_cents: Record<StaffRole, number>;
  /** Bér-szorzó szintenként (a szintlépés emelést hoz). */
  level_salary: [number, number, number];
  /** Ennyi nap után lép 2., illetve 3. szintre (gyorsan tanuló: fele). */
  level_days: [number, number];
  /** Felvételi díj: a havi bér ennyiszerese (toborzás, egyszeri). */
  hire_fee_months: number;
  /** Ügyfélszolgálatos: ennyi ticketet old meg naponta (két részletben, félnaponta). */
  support_tickets_per_day: [number, number, number];
  /** …a válasza ennyi elégedettséget ad (a te jó műszakod: ~+8), utána lezárja. */
  support_reply_sat: number;
  /** …ennél morcosabb ügyfélhez nem nyúl (rád hagyja), és a nagy (dedikált) ügyfélhez sem. */
  support_min_sat: number;
  /** SRE: kevesebb ticket (incidens), és a hardver-/hálózati események egy része elmarad. */
  sre_ticket_pct: [number, number, number];
  sre_avoid_hardware: [number, number, number];
  sre_avoid_network: [number, number, number];
  /** Értékesítő: több új ügyfél (csak ha van hova tenni). */
  sales_acq_pct: [number, number, number];
  morale: {
    start: number;
    /** Ha semmi baj, félnaponta +drift, legfeljebb cap-ig. */
    drift: number; cap: number;
    /** Félnaponkénti romlás: túlterhelés, tartozás, kevés pénz. */
    overwork: number; debt: number; low_cash: number;
    /** Az ügyfélszolgálatos túlterhelt, ha a sor több, mint a napi keretének ennyiszerese. */
    overwork_queue_factor: number;
    /** Ez alatt gyengébben dolgozik (×slump_factor); ez alatt szól (csapatdráma); ez alatt felmond. */
    slump_below: number; slump_factor: number;
    drama_below: number;
    quit_below: number;
    /** Kirúgáskor a többiek hangulata ennyivel romlik. */
    fire_hit: number;
  };
  /** A csapatdráma döntései. */
  drama: { raise_pct: number; raise_morale: number; four_day_morale: number; four_day_output: number; leave_rep: number; leave_sat: number };
}

export interface NetworkTier { bandwidth_units: number; monthly_cents: number; min_era: number }

/** A hálózat szabályai — lásd network.ts. */
export interface NetworkRule {
  min_era: number;
  /** Ügyfelenkénti forgalom (egység): hobbi, üzleti, nagy ügyfél. */
  units: { hobby: number; business: number; dedicated: number };
  /** Tranzit-csomagok (index = szint; a 0. az ingyenes alap). */
  tiers: NetworkTier[];
  /** Peering (IX-csatlakozás): egyszeri díj + havidíj; több hasznos sávszélesség és olcsóbb tranzit. */
  peering: { setup_cents: number; monthly_cents: number; bandwidth_pct: number; transit_discount_pct: number; min_tier: number };
  /** DDoS-védelem: havidíj; a DDoS-események ennyi %-a elmarad. */
  ddos: { monthly_cents: number; avoid_network: number };
  /** Kevés sávszélesség (lassulás): ticket-szorzó 1 + f × túllógás (max 1), és félnaponta −sat_step. */
  slowdown: { ticket_factor: number; sat_step: number };
}

/** A dedikált (üzleti / nagyvállalati) ügyfél szabályai — lásd dedicated.ts. */
export interface DedicatedRule {
  /** Ennyi hírnévtől jelentkezik nagy ügyfél (alatta senki nem bízza ránk a rendszerét). */
  min_reputation: number;
  /** Szabad dedikált gépenként naponta ekkora eséllyel jelentkezik egy (átlag 1/p nap várakozás). */
  arrival_per_day: number;
  /** A havidíj sávja (cent): az ügyfél azonosítójából determinisztikusan, step lépésekben (nem kell új oszlop). */
  fee_min_cents: number;
  fee_max_cents: number;
  fee_step_cents: number;
  /** Kezdő elégedettség. */
  start_sat: number;
  /** Ticket-szorzó a sima ügyfélhez képest (több, nehezebb ticket). */
  ticket_factor: number;
  /** Ennél régebbi megválaszolatlan ticket = megszegett SLA: 12 óránként −sla_sat elégedettség és −sla_rep hírnév. */
  sla_hours: number;
  sla_sat: number;
  sla_rep: number;
  /** Ennyi elégedettség alatt felmondja a szerződést (12 óránként nézzük). */
  leave_below_sat: number;
  /** A távozó nagy ügyfél ennyi hírnevet visz magával (bárhogy megy el). */
  leave_rep: number;
  /** …és utána ennyi napig nem jelentkezik új nagy ügyfél (rossz referencia; a gép közben üresen fizeti a díját). */
  leave_cooldown_days: number;
  /** A műszakban adott MI-értékelés szorzója: a jó válasz kevesebbet ér, a rossz többet árt. */
  reply_gain_factor: number;
  reply_loss_factor: number;
  /** Lezárás („close") elégedettség-hatása: ≥happy_at → happy, ≥ok_at → ok, ≥meh_at → meh, különben angry. */
  close: { happy_at: number; happy: number; ok_at: number; ok: number; meh_at: number; meh: number; angry: number };
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
  dedicated: null,
  staff: null,
  network: null,
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

/** 2026-11-12 (csapat-kör): a csapat számai. Indoklás: staff.ts fejkomment + szimulátor (economy-sim.ts). */
export const STAFF_RULE_V3: StaffRule = {
  min_era: 2,
  // 2026-11-13 (végjáték): a 4. korszakban 6 → 8 fő (a nagy flotta ticketjei különben a műszakon és 6 emberen elakadtak).
  max_by_era: { 2: 3, 3: 6, 4: 8 },
  base_salary_cents: { support: 7500, sre: 11000, sales: 9500 },
  level_salary: [1, 1.35, 1.7],
  level_days: [14, 42],
  hire_fee_months: 0.5,
  support_tickets_per_day: [4, 6, 8],
  support_reply_sat: 4,
  support_min_sat: 30,
  sre_ticket_pct: [-10, -15, -20],
  sre_avoid_hardware: [25, 35, 45],
  sre_avoid_network: [20, 30, 40],
  sales_acq_pct: [15, 25, 35],
  morale: {
    start: 70, drift: 2, cap: 85,
    overwork: 4, debt: 8, low_cash: 3,
    overwork_queue_factor: 2,
    slump_below: 40, slump_factor: 0.6,
    drama_below: 35,
    quit_below: 20,
    fire_hit: 5,
  },
  drama: { raise_pct: 20, raise_morale: 75, four_day_morale: 25, four_day_output: 0.8, leave_rep: 2, leave_sat: 3 },
};

/** 2026-11-12 (hálózat-kör): a hálózat számai. Indoklás: network.ts fejkomment + szimulátor. */
export const NETWORK_RULE_V3: NetworkRule = {
  min_era: 2,
  units: { hobby: 1, business: 2, dedicated: 8 },
  tiers: [
    { bandwidth_units: 80, monthly_cents: 0, min_era: 1 },
    { bandwidth_units: 200, monthly_cents: 4000, min_era: 2 },
    { bandwidth_units: 600, monthly_cents: 12000, min_era: 2 },
    // 2026-11-13 (végjáték): 10 Gbit a 3. korszaktól. Nélküle a forgalom ~780 egységnél (1 Gbit + peering) megállt,
    // a 4. korszak MRR-feltétele elérhetetlen volt (szimulátor, 365 nap).
    { bandwidth_units: 2000, monthly_cents: 40000, min_era: 3 },
  ],
  peering: { setup_cents: 20000, monthly_cents: 1500, bandwidth_pct: 30, transit_discount_pct: 30, min_tier: 1 },
  ddos: { monthly_cents: 3000, avoid_network: 75 },
  slowdown: { ticket_factor: 1.5, sat_step: 2 },
};

/** 2026-11-13 (végjáték): a nagyvállalati szerződés. A díj $1200–$2000/hó (átlag $1600 ≈ 6–7 dedikált ügyfél);
 *  a végcél MRR-jébe nem számít (mint a dedikálté sem a korszakéba), a végcél egy élő szerződést kér. */
export const ENTERPRISE_RULE_V3: EnterpriseRule = {
  min_era: 4,
  min_reputation: 75,
  min_cloud_regions: 1,
  min_edge_pops: 2,
  fee_min_cents: 120000, fee_max_cents: 200000, fee_step_cents: 20000,
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
  // 2026-11-12 (dedikált-kör): a dedikált gép egyetlen nagy, jól fizető ügyfélé. Régi: a gép 1 sima ügyfélhely
  // volt $120/hó díjjal és $3500 vételárral — csapda (a hely $5-öt hozott). Az új értékek indoklása a
  // szimulátorban (economy-sim.ts, „dedicated" / „dedicated_neglect" profil) és a server-types.ts fejében.
  dedicated: {
    min_reputation: 55,
    arrival_per_day: 0.33,
    // $200–$280/hó (5 lépcső, átlag $240): egy ügyfél ≈ 35 hobbi-ügyfél bevétele, ~1 ticket/nap mellett.
    // A brief $400–$900-at javasolt, de a szimulátorban a 2. korszak eleji cég MRR-je $100–$350: ekkora díj
    // egymaga többet hozna, mint az egész cég, és a 3. korszakot (MRR $1000) hetekkel előbbre hozná.
    fee_min_cents: 20000, fee_max_cents: 28000, fee_step_cents: 2000,
    start_sat: 60,
    ticket_factor: 3,
    sla_hours: 24, sla_sat: 6, sla_rep: 1,
    leave_below_sat: 25,
    // A távozás (bármi okból) 15 hírnév és 21 nap nagy ügyfél nélkül: a rá nem figyelő játékos így rosszabbul
    // jár, mintha meg sem vette volna a gépet (szimulátor: dedicated_neglect).
    leave_rep: 15,
    // 21 → 30 nap (2026-11-12 este, a $350-os gép mellett): olcsóbb gépnél a magára hagyott nagy ügyfél díja a
    // távozásig többet hozott, mint amennyit a rossz referencia elvitt — 30 nap várakozással a „megvettem, majd
    // lesz valahogy" a 2. hónapban sem jobb, mint dedikált nélkül (szimulátor: dedicated_neglect).
    leave_cooldown_days: 30,
    reply_gain_factor: 0.75,
    reply_loss_factor: 1.5,
    close: { happy_at: 70, happy: 3, ok_at: 45, ok: -5, meh_at: 30, meh: -10, angry: -30 },
  },
  staff: STAFF_RULE_V3,
  network: NETWORK_RULE_V3,
  enterprise: ENTERPRISE_RULE_V3,
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
