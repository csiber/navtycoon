// src/scripts/audio/settings.ts — a hangbeállítások (fő némítás + 3 csatorna hangereje) localStorage-ben.
// Kulcs: 'hs_audio' (JSON). A régi Műszak-kapcsoló ('hs_sound', alapból KI volt) beolvad: aki kifejezetten
// kikapcsolta ('0'), annál némítva marad; mindenki más (új játékos, vagy '1') alapból hallja a hangot.

export type Channel = 'sfx' | 'amb' | 'music';
export const CHANNELS: Channel[] = ['sfx', 'amb', 'music'];

export interface AudioSettings {
  /** Fő kapcsoló: false = minden csatorna néma. */
  on: boolean;
  /** Hangerők 0..1. */
  sfx: number;
  amb: number;
  music: number;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const SETTINGS_KEY = 'hs_audio';
export const LEGACY_KEY = 'hs_sound';
export const DEFAULTS: Readonly<AudioSettings> = Object.freeze({ on: true, sfx: 0.7, amb: 0.35, music: 0.25 });

function vol(v: unknown, d: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return d;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

/** Beolvasás + régi kulcs átvétele. Hibás/hiányzó adat → alapértékek. */
export function loadSettings(st: StorageLike | null): AudioSettings {
  let raw: string | null = null;
  let legacy: string | null = null;
  try { raw = st?.getItem(SETTINGS_KEY) ?? null; legacy = st?.getItem(LEGACY_KEY) ?? null; } catch { /* tiltott tároló */ }
  if (raw) {
    try {
      const j = JSON.parse(raw) as Partial<Record<keyof AudioSettings, unknown>>;
      if (j && typeof j === 'object') {
        return {
          on: typeof j.on === 'boolean' ? j.on : DEFAULTS.on,
          sfx: vol(j.sfx, DEFAULTS.sfx),
          amb: vol(j.amb, DEFAULTS.amb),
          music: vol(j.music, DEFAULTS.music),
        };
      }
    } catch { /* sérült JSON → alapérték */ }
  }
  const s: AudioSettings = { ...DEFAULTS, on: legacy === '0' ? false : DEFAULTS.on };
  if (legacy !== null) saveSettings(st, s); // egyszeri átvétel: ezután már csak a 'hs_audio' számít
  return s;
}

export function saveSettings(st: StorageLike | null, s: AudioSettings): void {
  try {
    st?.setItem(SETTINGS_KEY, JSON.stringify({ on: s.on, sfx: s.sfx, amb: s.amb, music: s.music }));
    // A régi kulcsot is frissen tartjuk, hogy egy régi, gyorsítótárazott Műszak-oldal se értse félre.
    st?.setItem(LEGACY_KEY, s.on ? '1' : '0');
  } catch { /* tiltott tároló */ }
}

export function normalizeVolume(v: unknown, d = 0): number { return vol(v, d); }
