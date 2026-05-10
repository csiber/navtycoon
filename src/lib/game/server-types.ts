// Hyperscaler — Server-tier definitions.
// Era 1+2 active (Phase 1). Era 3+4 placeholders for Phase 2.
//
// Konvenciók:
//  - Pénz INTEGER (USD cents).
//  - capacity = max sites/customers per server (dedicated_box = 1, per-customer).
//  - Era 3-4 placeholderek: capacity=0, monthly=0 → affordableServerTypes() szűri.

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
    capacity: 30, monthly_cost_cents: 500, purchase_cost_cents: 15000,
    flavor: 'Pentium III, 512MB, fan louder than the customer complaints. Honest work.',
  },
  rack_unit: {
    type: 'rack_unit', era: 2, display_name: '1U Rack Server',
    capacity: 100, monthly_cost_cents: 3000, purchase_cost_cents: 90000,
    flavor: 'Dual Xeon, redundant PSU, smells of fresh datacenter.',
  },
  vps_node: {
    type: 'vps_node', era: 2, display_name: 'VPS Node',
    capacity: 250, monthly_cost_cents: 8000, purchase_cost_cents: 220000,
    flavor: 'KVM-virtualized, 32GB RAM. The intern thinks "VPS" stands for "Very Powerful Server".',
  },
  dedicated_box: {
    type: 'dedicated_box', era: 2, display_name: 'Dedicated Box (per-customer)',
    capacity: 1, monthly_cost_cents: 12000, purchase_cost_cents: 350000,
    flavor: 'For The Pro who insists on bare metal. They will still complain.',
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
