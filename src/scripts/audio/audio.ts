// src/scripts/audio/audio.ts — az oldalanként egyetlen hangmotor (window.__hsAudio), hogy a külön csomagolt
// szkriptek (keret, Műszak, 3D rack) ugyanazt a kontextust és beállítást használják.
import { AudioEngine, type CtxLike, type SoundName } from './engine';
import { soundUrl, preferredExt } from './sounds';

declare global {
  interface Window {
    __hsAudio?: AudioEngine;
    hsSfx?: (name: string) => void;
    webkitAudioContext?: typeof AudioContext;
  }
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function getAudio(): AudioEngine {
  if (window.__hsAudio) return window.__hsAudio;
  const ext = preferredExt();
  const eng = new AudioEngine({
    createContext: () => {
      const C = window.AudioContext || window.webkitAudioContext;
      return C ? (new C({ latencyHint: 'interactive' }) as unknown as CtxLike) : null;
    },
    load: async (name: SoundName) => {
      const url = soundUrl(name, ext) ?? soundUrl(name, 'm4a');
      if (!url) throw new Error('no url: ' + name);
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    },
    storage: safeStorage('local'),
    session: safeStorage('session'),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  window.__hsAudio = eng;
  window.hsSfx = (n: string) => eng.play(n as SoundName);
  return eng;
}
