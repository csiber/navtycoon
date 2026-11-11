import { describe, it, expect } from 'vitest';
import { buildRackModel, unitState, ledHz } from '../rack-model';

const nameOf = (t: string) => t.toUpperCase();
const srv = (id: number, capacity = 30) => ({ id, type: 'lamp', capacity });

describe('rack-model', () => {
  it('assigns load top-down and labels U24 downwards', () => {
    const m = buildRackModel({ servers: [srv(1), srv(2)], activeCustomers: 33, nameOf });
    expect(m.units.map((u) => [u.u, u.load, u.util, u.state])).toEqual([[24, 30, 100, 'warn'], [23, 3, 10, 'ok']]);
    expect(m.slots).toBe(12);
    expect(m.units[0].name).toBe('LAMP');
  });
  it('empty server is idle; overflow marks the last server hot', () => {
    expect(buildRackModel({ servers: [srv(1), srv(2)], activeCustomers: 3, nameOf }).units[1].state).toBe('idle');
    const m = buildRackModel({ servers: [srv(1, 10)], activeCustomers: 14, nameOf });
    expect(m.overflow).toBe(4);
    expect(m.units[0].state).toBe('hot');
  });
  it('an open incident takes the busiest server down; unrelated events do not', () => {
    const m = buildRackModel({ servers: [srv(1, 10), srv(2, 100)], activeCustomers: 40, openIncidents: ['viral_blog', 'cooling_failure'], nameOf });
    expect(m.incident).toBe('cooling_failure');
    expect(m.units.map((u) => u.state)).toEqual(['down', 'ok']);
    expect(buildRackModel({ servers: [srv(1)], activeCustomers: 1, openIncidents: ['viral_blog'], nameOf }).units[0].state).toBe('ok');
  });
  it('slot count grows with the fleet, capped at 24', () => {
    const many = Array.from({ length: 30 }, (_, i) => srv(i + 1));
    const big = buildRackModel({ servers: many, activeCustomers: 0, nameOf });
    expect(big.slots).toBe(24);
    expect(big.units).toHaveLength(24);
    expect(big.hidden).toBe(6);
    expect(big.units[23].u).toBe(1);
    expect(buildRackModel({ servers: [srv(1)], activeCustomers: 0, nameOf, minSlots: 6 }).slots).toBe(6);
  });
  it('unitState thresholds and LED speed', () => {
    expect(unitState(69, 5, false)).toBe('ok');
    expect(unitState(70, 5, false)).toBe('warn');
    expect(unitState(100, 5, false)).toBe('warn'); // teli, de nem torlódik
    expect(unitState(100, 5, false, true)).toBe('hot');
    expect(unitState(0, 0, false)).toBe('idle');
    expect(unitState(10, 1, true)).toBe('down');
    expect(ledHz(100, 'hot')).toBeGreaterThan(ledHz(10, 'ok'));
    expect(ledHz(0, 'idle')).toBe(0.25);
  });
});
