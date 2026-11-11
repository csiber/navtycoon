// src/lib/game/capacity.ts
// Hyperscales — hány ügyfél fut az egyes szervereken. A servers.current_load oszlopot semmi nem frissíti
// (mindig 0), ezért a kijelzéshez a valós ügyfélszámot osztjuk szét a szervereken vásárlási sorrendben,
// kapacitásig töltve (2026-11-11). Ha több az ügyfél, mint a hely, a túlcsordulás külön jön vissza.

export interface CapacityServer { id: number; capacity: number }

export function assignLoad<T extends CapacityServer>(servers: T[], customers: number): {
  servers: Array<T & { load: number; util: number }>;
  overflow: number;
  totalCapacity: number;
} {
  let left = Math.max(0, customers);
  const out = servers.map((s) => {
    const load = Math.min(left, Math.max(0, s.capacity));
    left -= load;
    return { ...s, load, util: s.capacity > 0 ? Math.round((load / s.capacity) * 100) : 0 };
  });
  return { servers: out, overflow: left, totalCapacity: servers.reduce((a, s) => a + Math.max(0, s.capacity), 0) };
}
