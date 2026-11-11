// src/scripts/shift/shift-fx.ts — lebegő jelzések (+$, hangulat, hírnév) és halk, szintetizált UI-hangok.
// Hang: alapból KI (localStorage 'hs_sound' = '1' kapcsolja be); WebAudio-val generált rövid hangok, nincs
// letöltött hangfájl. A lebegő jelzések prefers-reduced-motion mellett is megjelennek, csak nem mozognak.

export type PopKind = 'good' | 'bad' | 'cash';

export function popAt(anchor: Element | null, text: string, kind: PopKind, dx = 0) {
  const layer = document.getElementById('sx-fx');
  if (!layer || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'sx-pop ' + kind;
  el.textContent = text;
  el.style.left = `${Math.round(r.left + r.width / 2 + dx)}px`;
  el.style.top = `${Math.round(r.top - 8)}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

let ctx: AudioContext | null = null;
let enabled = false;
try { enabled = localStorage.getItem('hs_sound') === '1'; } catch { /* sandboxed */ }

export function soundEnabled(): boolean { return enabled; }
export function setSound(on: boolean) {
  enabled = on;
  try { localStorage.setItem('hs_sound', on ? '1' : '0'); } catch { /* sandboxed */ }
  if (on) play('tick');
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.06) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = a.currentTime + at;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export type Sfx = 'send' | 'reply' | 'good' | 'bad' | 'cash' | 'tick' | 'warn' | 'star' | 'fanfare';

export function play(s: Sfx, i = 0) {
  if (!enabled) return;
  switch (s) {
    case 'send': tone(660, 0, 0.08, 'triangle', 0.04); break;
    case 'reply': tone(523, 0, 0.1, 'sine', 0.05); tone(784, 0.07, 0.14, 'sine', 0.04); break;
    case 'good': tone(659, 0, 0.12, 'sine'); tone(988, 0.08, 0.18, 'sine', 0.05); break;
    case 'bad': tone(220, 0, 0.22, 'triangle', 0.07); tone(174, 0.09, 0.26, 'triangle', 0.05); break;
    case 'cash': tone(1318, 0, 0.06, 'square', 0.025); tone(1760, 0.05, 0.1, 'square', 0.02); break;
    case 'tick': tone(880, 0, 0.05, 'sine', 0.03); break;
    case 'warn': tone(440, 0, 0.15, 'sawtooth', 0.03); tone(440, 0.22, 0.15, 'sawtooth', 0.03); break;
    case 'star': tone([784, 988, 1318][i] ?? 1318, 0, 0.25, 'sine', 0.06); break;
    case 'fanfare': [523, 659, 784, 1046].forEach((f, k) => tone(f, k * 0.09, 0.3, 'triangle', 0.045)); break;
  }
}
