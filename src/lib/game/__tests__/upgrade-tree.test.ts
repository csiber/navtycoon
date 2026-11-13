import { describe, it, expect } from 'vitest';
import { availableUpgrades, getUpgradeById, UPGRADE_SPECS } from '../upgrade-tree';
import { SERVER_SPECS, affordableServerTypes } from '../server-types';

describe('upgrade-tree', () => {
  it('26 specs total (Era 1: 8, Era 2: 12, Era 3: 3, Era 4: 3)', () => {
    expect(UPGRADE_SPECS.length).toBe(26);
    expect(UPGRADE_SPECS.filter(u => u.era === 1).length).toBe(8);
    expect(UPGRADE_SPECS.filter(u => u.era === 2).length).toBe(12);
    expect(UPGRADE_SPECS.filter(u => u.era === 3).length).toBe(3);
    expect(UPGRADE_SPECS.filter(u => u.era === 4).length).toBe(3);
  });

  it('every prereq exists and is from the same or an earlier era', () => {
    for (const u of UPGRADE_SPECS) {
      if (!u.prereq) continue;
      const p = getUpgradeById(u.prereq);
      expect(p, u.id).toBeDefined();
      expect(p!.era).toBeLessThanOrEqual(u.era);
    }
  });

  it('Era 1 player sees only Era 1 unowned upgrades (cdn_bind gated by mod_pagespeed)', () => {
    const avail = availableUpgrades(1, new Set());
    // 8 Era-1 upgrades, but cdn_bind has prereq mod_pagespeed → 7 visible.
    expect(avail.length).toBe(7);
    expect(avail.every(u => u.era === 1)).toBe(true);
    expect(avail.find(u => u.id === 'cdn_bind')).toBeUndefined();
  });

  it('owned upgrade hidden from available', () => {
    const avail = availableUpgrades(1, new Set(['cooling_fan']));
    expect(avail.find(u => u.id === 'cooling_fan')).toBeUndefined();
    // 7 visible minus cooling_fan owned = 6 (cdn_bind still gated by mod_pagespeed).
    expect(avail.length).toBe(6);
  });

  it('all 8 Era-1 upgrades reachable once mod_pagespeed owned', () => {
    const avail = availableUpgrades(1, new Set(['mod_pagespeed']));
    // 8 - 1 (mod_pagespeed owned) = 7 visible, including cdn_bind now unlocked.
    expect(avail.length).toBe(7);
    expect(avail.find(u => u.id === 'cdn_bind')).toBeDefined();
  });

  it('prereq enforced: cdn_bind hidden until mod_pagespeed owned', () => {
    const avail0 = availableUpgrades(1, new Set());
    expect(avail0.find(u => u.id === 'cdn_bind')).toBeUndefined();

    const avail1 = availableUpgrades(1, new Set(['mod_pagespeed']));
    expect(avail1.find(u => u.id === 'cdn_bind')).toBeDefined();
  });

  it('getUpgradeById works', () => {
    expect(getUpgradeById('cooling_fan')?.cost_usd_cents).toBe(8000);
    expect(getUpgradeById('nope')).toBeUndefined();
  });
});

describe('server-types', () => {
  it('Era 1 only sees lamp_box', () => {
    const a = affordableServerTypes(1);
    expect(a.length).toBe(1);
    expect(a[0].type).toBe('lamp_box');
  });

  it('Era 2 sees Era 1 + Era 2 active types (lamp + rack + vps + dedicated)', () => {
    const a = affordableServerTypes(2);
    const types = a.map(s => s.type).sort();
    expect(types).toEqual(['dedicated_box', 'lamp_box', 'rack_unit', 'vps_node']);
  });

  it('SERVER_SPECS has all 6 entries, and the Era 3-4 machines are real now (2026-11-13)', () => {
    expect(Object.keys(SERVER_SPECS).length).toBe(6);
    expect(affordableServerTypes(3).map(s => s.type)).toContain('cloud_region');
    expect(affordableServerTypes(3).map(s => s.type)).not.toContain('edge_pop');
    expect(affordableServerTypes(4).map(s => s.type)).toContain('edge_pop');
    for (const t of ['cloud_region', 'edge_pop'] as const) {
      expect(SERVER_SPECS[t].capacity).toBeGreaterThan(0);
      expect(SERVER_SPECS[t].monthly_cost_cents).toBeGreaterThan(0);
      expect(SERVER_SPECS[t].purchase_cost_cents).toBeGreaterThan(0);
    }
  });
});
