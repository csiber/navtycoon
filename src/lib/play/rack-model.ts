// src/lib/play/rack-model.ts — a 3D/2D rack adatmodellje (vezérlő Flotta-panel + Szerverek lap), szerveroldalon számolva.
// Egy forrás a 3D-nek (src/scripts/rack3d) és a 2D-tartaléknak: a gépek a valódi szerverek, a terhelés az
// assignLoad szerint, az állapot a terhelésből és a futó incidensekből.

import { assignLoad } from '../game/capacity';

export type UnitState = 'idle' | 'ok' | 'warn' | 'hot' | 'down';

export interface RackUnit {
  id: number;
  /** Rack-pozíció felülről: U24, U23, … */
  u: number;
  type: string;
  name: string;
  load: number;
  capacity: number;
  util: number;
  state: UnitState;
}

export interface RackModel {
  units: RackUnit[];
  /** Ennyi rack-hely (üresekkel együtt) látszik. */
  slots: number;
  overflow: number;
  totalCapacity: number;
  /** A nyitott incidens-esemény típusa (ha van). */
  incident: string | null;
  /** Ennyi gép nem fér a 24U-s rackbe (a 3D nézet csak az első 24-et mutatja). */
  hidden: number;
}

/** Incidens-események, amelyek alatt a legterheltebb gép „leállt" állapotot mutat. */
export const DOWN_EVENTS = ['cooling_failure', 'ddos_attempt', 'security_breach'] as const;

/**
 * Állapot: a teli (≥ 70%) gép csak „terhelt" (borostyán) — a játék sorban tölti fel a gépeket, így a korábbiak
 * rendszerint 100%-on vannak, ez nem baj. Piros (túlterhelt) csak az, amelyiken torlódik a túlcsordulás
 * (több ügyfél, mint az összes kapacitás), és a nyitott incidens által „leállított" gép.
 */
export function unitState(util: number, load: number, down: boolean, overflowing = false): UnitState {
  if (down) return 'down';
  if (overflowing) return 'hot';
  if (load <= 0) return 'idle';
  if (util >= 70) return 'warn';
  return 'ok';
}

/** LED-villogás frekvenciája (Hz) a terhelésből: üresjáraton lassú „szívverés", teli gépen gyors. */
export function ledHz(util: number, state: UnitState): number {
  if (state === 'down') return 1.2;
  if (state === 'idle') return 0.25;
  return 0.6 + Math.min(100, Math.max(0, util)) / 100 * 5.4;
}

export function buildRackModel(input: {
  servers: { id: number; type: string; capacity: number }[];
  activeCustomers: number;
  /** Nyitott (megoldatlan) incidens-esemény típusa, ha van. */
  openIncidents?: string[];
  nameOf: (type: string) => string;
  minSlots?: number;
}): RackModel {
  const loaded = assignLoad(input.servers, input.activeCustomers);
  const incident = (input.openIncidents ?? []).find((t) => (DOWN_EVENTS as readonly string[]).includes(t)) ?? null;
  // Az incidens a legterheltebb gépet „dönti le" (holtversenyben a rack tetején lévőt).
  let downIdx = -1;
  if (incident && loaded.servers.length > 0) {
    downIdx = loaded.servers.reduce((best, s, i, arr) => (s.util > arr[best].util ? i : best), 0);
  }
  const units = loaded.servers.map((s, i) => {
    // Ha valaki nem fér el, az utolsó gép túlterhelt (a túlcsordulás rajta torlódik).
    const overflowing = loaded.overflow > 0 && i === loaded.servers.length - 1;
    const util = overflowing ? Math.max(s.util, 100) : s.util;
    return {
      id: s.id, u: 24 - i, type: s.type, name: input.nameOf(s.type),
      load: s.load, capacity: s.capacity, util,
      state: unitState(util, s.load, i === downIdx, overflowing),
    };
  });
  return {
    units: units.slice(0, 24),
    hidden: Math.max(0, units.length - 24),
    slots: Math.min(24, Math.max(input.minSlots ?? 12, units.length + 2)),
    overflow: loaded.overflow,
    totalCapacity: loaded.totalCapacity,
    incident,
  };
}
