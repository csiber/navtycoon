// src/scripts/audio/sounds.ts — a hangfájlok tartalom-hash-es URL-jei (a Vite /_astro/ alá teszi őket, a
// public/_headers szerint immutable gyorsítótárral). Itt csak URL-ek vannak: a fájl csak a feloldás után töltődik le.
// Opus (ogg) az alap; ahol a böngésző nem játssza le (régebbi Safari), AAC (m4a) a tartalék.
import type { SoundName } from './engine';

const urls = import.meta.glob('../../assets/audio/*.{ogg,m4a}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export function soundUrl(name: SoundName, ext: 'ogg' | 'm4a'): string | null {
  return urls[`../../assets/audio/${name}.${ext}`] ?? null;
}

export function preferredExt(): 'ogg' | 'm4a' {
  try {
    const a = document.createElement('audio');
    if (a.canPlayType('audio/ogg; codecs="opus"')) return 'ogg';
  } catch { /* nincs audio elem */ }
  return 'm4a';
}
