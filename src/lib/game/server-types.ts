// Hyperscales — Server-tier definitions.
// Era 1+2 active (Phase 1). Era 3+4 placeholders for Phase 2.
//
// Konvenciók:
//  - Pénz INTEGER (USD cents).
//  - capacity = max sites/customers per server (dedicated_box = 1, per-customer).
//  - Era 3-4 placeholderek: capacity=0, monthly=0 → affordableServerTypes() szűri.
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
    capacity: 1, monthly_cost_cents: 5000, purchase_cost_cents: 50000,
    flavor: 'One business client, their own bare metal, and a phone number they will actually call.',
  },
  cloud_region: {
    type: 'cloud_region', era: 3, display_name: 'Cloud Region (Phase 2)',
    capacity: 0, monthly_cost_cents: 0, purchase_cost_cents: 0,
    flavor: 'Era 3 unlock — coming Phase 2.',
  },
  edge_pop: {
    type: 'edge_pop', era: 4, display_name: 'Edge POP (Phase 2)',
    capacity: 0, monthly_cost_cents: 0, purchase_cost_cents: 0,
    flavor: 'Era 4 unlock — coming Phase 2.',
  },
};

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
