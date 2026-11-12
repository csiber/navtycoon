// src/lib/play/rack-model.ts — a 3D/2D rack adatmodellje (vezérlő Flotta-panel + Szerverek lap), szerveroldalon számolva.
// Egy forrás a 3D-nek (src/scripts/rack3d) és a 2D-tartaléknak: a gépek a valódi szerverek, a terhelés az
// assignLoad szerint, az állapot a terhelésből és a futó incidensekből.

import { assignFleetLoad, type CapacityServer } from '../game/capacity';
// 2026-11-12 (dedikált-kör): a dedikált gép külön jelölést kap (dedicated + tag), a terhelése a nagy ügyfél
// (0 vagy 1), a sima ügyfelek nem kerülnek rá; a túlcsordulás a legutolsó SIMA gépen torlódik.

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
  /** Dedikált gép (egy nagy ügyfélé). */
  dedicated?: boolean;
  /** Rövid felirat az előlapra (pl. „DEDIKÁLT"). */
  tag?: string;
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

/** A 2D sor megjelenése ugyanabból az állapotból, mint a 3D (közös küszöbök: ≥ 70% borostyán, piros csak túlcsordulás / incidens). */
export interface Unit2d {
  /** A sor osztálya ('' | ' warn' | ' hot'). */
  row: '' | ' warn' | ' hot';
  /** A három LED osztálya (r = piros, a = borostyán, g = zöld). */
  leds: [string, string, string];
  /** Részletnézet színe. */
  tone: 'good' | 'warn' | 'bad';
}

export function unit2d(state: UnitState): Unit2d {
  const red = state === 'hot' || state === 'down';
  return {
    row: red ? ' hot' : state === 'warn' ? ' warn' : '',
    leds: [red ? 'r' : 'g', 'g', red || state === 'warn' ? 'a' : 'g'],
    tone: red ? 'bad' : state === 'warn' ? 'warn' : 'good',
  };
}

/**
 * A gépek állapota rack-sorrendben (a megadott szerverlista sorrendjében), a 3D és a 2D közös forrása.
 * Az incidens a legterheltebb gépet „dönti le" (holtversenyben a rack tetején lévőt); ha valaki nem fér el,
 * az utolsó gép túlterhelt (a túlcsordulás rajta torlódik).
 */
export function rackUnitStates<T extends CapacityServer & { type?: string }>(
  servers: T[],
  activeCustomers: number,
  openIncidents: string[] = [],
  /** Ennyi aktív dedikált ügyfél van (activeCustomers a SIMA ügyfelek száma). */
  dedicatedCustomers = 0,
): {
  loaded: { servers: Array<T & { load: number; util: number; dedicated: boolean }>; overflow: number; totalCapacity: number };
  incident: string | null;
  units: { util: number; state: UnitState }[];
} {
  const loaded = assignFleetLoad(servers.map((s) => ({ ...s, type: s.type ?? '' })), activeCustomers, dedicatedCustomers) as
    { servers: Array<T & { load: number; util: number; dedicated: boolean }>; overflow: number; totalCapacity: number };
  const incident = openIncidents.find((t) => (DOWN_EVENTS as readonly string[]).includes(t)) ?? null;
  let downIdx = -1;
  if (incident && loaded.servers.length > 0) {
    downIdx = loaded.servers.reduce((best, s, i, arr) => (s.util > arr[best].util ? i : best), 0);
  }
  // A túlcsordulás a legutolsó sima gépen torlódik (a dedikált gépen soha).
  let lastGeneral = -1;
  loaded.servers.forEach((s, i) => { if (!s.dedicated) lastGeneral = i; });
  const units = loaded.servers.map((s, i) => {
    if (s.dedicated) {
      // Foglalt dedikált gép: „ok" (zöld) — a teli dedikált gép a cél, nem figyelmeztetés.
      return { util: s.util, state: i === downIdx ? 'down' as const : s.load > 0 ? 'ok' as const : 'idle' as const };
    }
    const overflowing = loaded.overflow > 0 && i === lastGeneral;
    const util = overflowing ? Math.max(s.util, 100) : s.util;
    return { util, state: unitState(util, s.load, i === downIdx, overflowing) };
  });
  return { loaded, incident, units };
}

export function buildRackModel(input: {
  servers: { id: number; type: string; capacity: number }[];
  /** A SIMA aktív ügyfelek száma (a dedikáltak nélkül). */
  activeCustomers: number;
  /** Aktív dedikált ügyfelek; a dedikált gép sorának felirata (dedTag) és neve (dedName: az ügyfél neve). */
  dedicatedCustomers?: number;
  dedTag?: string;
  dedNames?: string[];
  /** Nyitott (megoldatlan) incidens-esemény típusa, ha van. */
  openIncidents?: string[];
  nameOf: (type: string) => string;
  minSlots?: number;
}): RackModel {
  const { loaded, incident, units: st } = rackUnitStates(input.servers, input.activeCustomers, input.openIncidents, input.dedicatedCustomers ?? 0);
  let dIdx = 0;
  const units: RackUnit[] = loaded.servers.map((s, i) => {
    const base: RackUnit = {
      id: s.id, u: 24 - i, type: s.type, name: input.nameOf(s.type),
      load: s.load, capacity: s.capacity, util: st[i].util, state: st[i].state,
    };
    if (!s.dedicated) return base;
    const who = s.load > 0 ? input.dedNames?.[dIdx++] : undefined;
    return { ...base, dedicated: true, tag: input.dedTag, name: who ? `${base.name} · ${who}` : base.name };
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
