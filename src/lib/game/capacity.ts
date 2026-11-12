// src/lib/game/capacity.ts
// Hyperscales — hány ügyfél fut az egyes szervereken. A servers.current_load oszlopot semmi nem frissíti
// (mindig 0), ezért a kijelzéshez a valós ügyfélszámot osztjuk szét a szervereken vásárlási sorrendben,
// kapacitásig töltve (2026-11-11). Ha több az ügyfél, mint a hely, a túlcsordulás külön jön vissza.
//
// 2026-11-12 (dedikált-kör): a dedikált gépre (capacity 0 a sima ügyfeleknek, lásd serverCapacity) csak dedikált
// ügyfél kerül: assignFleetLoad a sima ügyfeleket a sima gépekre, a dedikáltakat (vásárlási sorrendben, gépenként
// egyet) a dedikált gépekre osztja.

import { isDedicatedServer } from './dedicated';

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

/**
 * Mint az assignLoad, de a dedikált gépekkel: a sima ügyfelek (general) a sima gépek kapacitásáig, a dedikált
 * ügyfelek a dedikált gépekre (gépenként 1). A dedikált gép sorában dedicated = true, capacity = 1.
 * totalCapacity és overflow csak a sima ügyfelekre vonatkozik.
 */
export function assignFleetLoad<T extends CapacityServer & { type: string }>(
  servers: T[], general: number, dedicated = 0,
): {
  servers: Array<T & { load: number; util: number; dedicated: boolean }>;
  overflow: number;
  totalCapacity: number;
} {
  const gen = assignLoad(servers.map((s) => (isDedicatedServer(s.type) ? { ...s, capacity: 0 } : s)), general);
  let dLeft = Math.max(0, dedicated);
  const out = gen.servers.map((s, i) => {
    if (!isDedicatedServer(s.type)) return { ...s, dedicated: false };
    const load = dLeft > 0 ? 1 : 0;
    dLeft -= load;
    return { ...servers[i], load, util: load * 100, capacity: 1, dedicated: true };
  });
  return { servers: out, overflow: gen.overflow, totalCapacity: gen.totalCapacity };
}
