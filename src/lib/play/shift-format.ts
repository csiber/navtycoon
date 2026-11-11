// src/lib/play/shift-format.ts — a műszak-kliens (src/scripts/shift) apró, tesztelhető megjelenítési szabályai.

/** mm:ss (negatív → 00:00). */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Időzítő-fázis: 5 perc alatt figyelmeztet, 1 perc alatt kritikus. */
export function timerPhase(sec: number): 'ok' | 'warn' | 'crit' {
  return sec <= 60 ? 'crit' : sec <= 300 ? 'warn' : 'ok';
}

/** A játék elégedettsége −100..100; a sáv 0..100-at mutat. */
export function satPct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function satTone(v: number): 'low' | 'mid' | 'high' {
  return v < 30 ? 'low' : v < 60 ? 'mid' : 'high';
}

export function moodFace(v: number): string {
  return v >= 75 ? '😄' : v >= 55 ? '🙂' : v >= 35 ? '😐' : v >= 15 ? '😟' : '😠';
}

/** Előjeles szám: +5 / −3 / 0 (valódi mínuszjellel). */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Előjeles dollár centből: +$1.50 / −$50 / $0. */
export function signedUsd(cents: number): string {
  const abs = Math.abs(cents);
  const v = abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
  return cents > 0 ? `+$${v}` : cents < 0 ? `−$${v}` : '$0';
}
