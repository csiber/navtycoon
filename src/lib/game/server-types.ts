// Hyperscales — Server-tier definitions.
// Minden korszak gépei élnek (2026-11-13, végjáték: a felhőrégió és az edge POP is).
//
// Konvenciók:
//  - Pénz INTEGER (USD cents).
//  - capacity = max sites/customers per server (dedicated_box = 1, per-customer).
//  - (2026-11-13 előtt a 3–4. korszak gépei helyőrzők voltak: capacity=0 → affordableServerTypes() szűrte.)
//  - 2026-11-12 (játékmag): a kapacitás és a havidíj most SZÁMÍT. A kapacitás a típusból jön (nem a
//    servers.capacity oszlopból — így a hangolás a meglévő gépekre is érvényes), × a fejlesztések
//    capacity_pct-je (serverCapacity). A havidíjat a tick időarányosan vonja le a servers.monthly_cost_cents
//    alapján (a kezdőgépé 0 marad). Régi → új: lamp_box 30 hely $5/hó $150 → 15 hely $30/hó $100;
//    rack_unit 100 hely $30/hó → 60 hely $100/hó ($900); vps_node 250 hely $80/hó → 150 hely $220/hó ($2200).
//    Egy hely havidíja így ~$2 (a hobby-ügyfél $5-öt fizet): a teli gép jól keres, az üres gép pénzt éget. Indoklás: a régi 30 hellyel a
//    kezdőgép 60 nap alatt sem telt meg, így a szervervásárlás soha nem volt döntés (economy-sim.ts).
//  - 2026-11-12 (dedikált-kör): a dedikált gép 1 helyére csak egy nagy (üzleti/nagyvállalati) ügyfél jöhet
//    (dedicated.ts), a sima ügyfelek kapacitásába NEM számít (serverCapacity → 0). Régi → új: $3500 vételár,
//    $120/hó → $500 vételár, $50/hó; az ügyfél $200–$280/hót fizet (átlag $240 → nettó ~$190/hó, megtérülés
//    ~2,6 hónap + a várakozás). Indoklás: a régi gép egy $5-os helyet adott $120-ért (csapda), és $3500-ra a
//    szimulátor aktív játékosa 90 nap alatt sem gyűjtött; $500-at a 2. korszak elején össze tud spórolni, ha
//    addig nem vesz fejlesztést (economy-sim.ts, „dedicated" profil).
//  - 2026-11-12 este (Csaba: „lemehet igen"): a dedikált gép vételára $500 → $350 (a $50/hó és a nagy ügyfél
//    $200–$280-as díja marad). Megtérülés a sáv közepével ~2,6 → ~1,8 hónap. Szimulátor (10 seed, 90 nap, medián):
//    „dedicated" profil 3. korszak a 80. → 66. napon (dedikált nélkül, „active": 64.), 90 napos MRR $1284 → $1576
//    (active: $1377). A drágább gépre spórolás eddig a fejlesztéseket késleltette, ezért járt rosszabbul a dedikált nélküli úttal.

import type { ServerType, EraId } from './types';

export interface ServerSpec {
  type: ServerType;
  era: EraId;
  display_name: string;
  capacity: number;
  monthly_cost_cents: number;
  purchase_cost_cents: number;
  flavor: string;
}

export const SERVER_SPECS: Record<ServerType, ServerSpec> = {
  lamp_box: {
    type: 'lamp_box', era: 1, display_name: 'Beige Tower (LAMP)',
    capacity: 15, monthly_cost_cents: 3000, purchase_cost_cents: 10000,
    flavor: 'Pentium III, 512MB, fan louder than the customer complaints. Honest work.',
  },
  rack_unit: {
    type: 'rack_unit', era: 2, display_name: '1U Rack Server',
    capacity: 60, monthly_cost_cents: 10000, purchase_cost_cents: 90000,
    flavor: 'Dual Xeon, redundant PSU, smells of fresh datacenter.',
  },
  vps_node: {
    type: 'vps_node', era: 2, display_name: 'VPS Node',
    capacity: 150, monthly_cost_cents: 22000, purchase_cost_cents: 220000,
    flavor: 'KVM-virtualized, 32GB RAM. The intern thinks "VPS" stands for "Very Powerful Server".',
  },
  dedicated_box: {
    type: 'dedicated_box', era: 2, display_name: 'Dedicated Box (one big client)',
    capacity: 1, monthly_cost_cents: 5000, purchase_cost_cents: 35000,
    flavor: 'One business client, their own bare metal, and a phone number they will actually call.',
  },
  // 2026-11-13 (végjáték): a 3–4. korszak gépei valódiak (eddig 0 hely, $0, kiszűrve).
  //  - Felhőrégió: a 3. korszaktól, legalább 1 Gbites tranzittal (SERVER_REQUIREMENTS). Sok hely, magas havidíj:
  //    500 hely $700/hó ($1,4/hely, a VPS-csomóponté $1,47) $7500-ért — a nagy flotta gerince.
  //  - Edge POP: a 4. korszaktól. Kevés hely (120, $350/hó, $4000), de minden POP a forgalom egy részét helyben
  //    szolgálja ki: +EDGE_POP_BANDWIDTH_UNITS sávszélesség (network.ts edge_units). A végcél is kér belőlük.
  cloud_region: {
    type: 'cloud_region', era: 3, display_name: 'Cloud Region',
    capacity: 400, monthly_cost_cents: 45000, purchase_cost_cents: 300000,
    flavor: 'Three availability zones, one invoice, and a status page you actually have to keep green.',
  },
  edge_pop: {
    type: 'edge_pop', era: 4, display_name: 'Edge POP',
    capacity: 120, monthly_cost_cents: 25000, purchase_cost_cents: 250000,
    flavor: 'A small cage in a faraway exchange. Your traffic stops crossing the ocean.',
  },
};

/** Egy edge POP ennyi forgalmi egységet szolgál ki helyben (a tranzit sávszélessége fölött). */
export const EDGE_POP_BANDWIDTH_UNITS = 250;

/** Vásárlási feltételek a korszakon túl (2026-11-13): a felhőrégió legalább ekkora tranzit-csomagot kér
 *  (2 = 1 Gbit). A szerver-API, a katalógus és a szimulátor is ezt nézi. */
export const SERVER_REQUIREMENTS: Partial<Record<ServerType, { min_transit_tier: number }>> = {
  cloud_region: { min_transit_tier: 2 },
};

/** Megveheti-e a gépet a tranzit-csomag alapján (a korszakot és a pénzt a hívó nézi). */
export function meetsServerRequirements(type: string, transitTier: number): boolean {
  const req = (SERVER_REQUIREMENTS as Record<string, { min_transit_tier: number } | undefined>)[type];
  return !req || transitTier >= req.min_transit_tier;
}

/** Az edge POP-ok helyben kiszolgált forgalma (egység). */
export function edgeUnits(servers: Array<{ type: string }>): number {
  return servers.reduce((a, s) => a + (s.type === 'edge_pop' ? EDGE_POP_BANDWIDTH_UNITS : 0), 0);
}

export function affordableServerTypes(currentEra: EraId): ServerSpec[] {
  return Object.values(SERVER_SPECS).filter(s => s.era <= currentEra && s.capacity > 0);
}

/** Egy gép SIMA ügyfélhelye: a típus kapacitása × a fejlesztések capacity_pct-je (lefelé kerekítve).
 *  Ismeretlen típusnál a sorban tárolt kapacitás. A dedikált gép 0: az egyetlen helye a dedikált ügyfélé
 *  (dedicated.ts), és a fejlesztés sem bővíti. */
export function serverCapacity(type: string, storedCapacity: number, capacityPct = 0): number {
  if (type === 'dedicated_box') return 0;
  const spec = (SERVER_SPECS as Record<string, ServerSpec | undefined>)[type];
  const base = spec && spec.capacity > 0 ? spec.capacity : Math.max(0, storedCapacity);
  return Math.floor(base * Math.max(0, 1 + capacityPct / 100));
}
