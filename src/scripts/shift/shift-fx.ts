// src/scripts/shift/shift-fx.ts — lebegő jelzések (+$, hangulat, hírnév) és halk, szintetizált UI-hangok.
// Hang (2026-11-12): a közös hangmotoron át (src/scripts/audio) — alapból BE, a fő némítás és az effekt-hangerő
// itt is érvényes. A régi 'hs_sound' = '0' (kifejezetten kikapcsolt) a motorban némítva marad.
// A csippanások WebAudio-val generáltak (nincs fájl); a pénz-hang a közös, finomított 'cash' minta.
// A lebegő jelzések prefers-reduced-motion mellett is megjelennek, csak nem mozognak.
import { getAudio } from '../audio/audio';

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

export function soundEnabled(): boolean { return getAudio().settings.on; }
export function setSound(on: boolean) {
  const a = getAudio();
  a.unlock();
  a.update({ on });
  if (on) play('tick');
}

/** A Műszak saját hanggombja kövesse a felső sáv / Beállítások változásait is. */
export function onSoundChange(fn: () => void): void { getAudio().subscribe(fn); }

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.06) {
  const out = getAudio().synthOut(); if (!out) return;
  const a = out.ctx as unknown as AudioContext;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = a.currentTime + at;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol * 3, t0 + 0.012); // ×3: az effekt-csatorna (70%) és a mintákhoz igazított szint
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out.out as unknown as AudioNode);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export type Sfx = 'send' | 'reply' | 'good' | 'bad' | 'cash' | 'tick' | 'warn' | 'star' | 'fanfare';

export function play(s: Sfx, i = 0) {
  if (!soundEnabled()) return;
  switch (s) {
    case 'send': tone(660, 0, 0.08, 'triangle', 0.04); break;
    case 'reply': tone(523, 0, 0.1, 'sine', 0.05); tone(784, 0.07, 0.14, 'sine', 0.04); break;
    case 'good': tone(659, 0, 0.12, 'sine'); tone(988, 0.08, 0.18, 'sine', 0.05); break;
    case 'bad': tone(220, 0, 0.22, 'triangle', 0.07); tone(174, 0.09, 0.26, 'triangle', 0.05); break;
    case 'cash': getAudio().play('cash'); break;
    case 'tick': tone(880, 0, 0.05, 'sine', 0.03); break;
    case 'warn': tone(440, 0, 0.15, 'sawtooth', 0.03); tone(440, 0.22, 0.15, 'sawtooth', 0.03); break;
    case 'star': tone([784, 988, 1318][i] ?? 1318, 0, 0.25, 'sine', 0.06); break;
    case 'fanfare': [523, 659, 784, 1046].forEach((f, k) => tone(f, k * 0.09, 0.3, 'triangle', 0.045)); break;
  }
}
