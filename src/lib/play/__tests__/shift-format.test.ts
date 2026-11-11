import { describe, it, expect } from 'vitest';
import { formatClock, timerPhase, satPct, satTone, moodFace, signed, signedUsd } from '../shift-format';

describe('shift-format', () => {
  it('formatClock', () => {
    expect(formatClock(1800)).toBe('30:00');
    expect(formatClock(65.9)).toBe('01:05');
    expect(formatClock(-4)).toBe('00:00');
  });
  it('timerPhase thresholds', () => {
    expect(timerPhase(301)).toBe('ok');
    expect(timerPhase(300)).toBe('warn');
    expect(timerPhase(60)).toBe('crit');
  });
  it('satisfaction helpers clamp and classify', () => {
    expect(satPct(-40)).toBe(0);
    expect(satPct(140)).toBe(100);
    expect(satTone(29)).toBe('low');
    expect(satTone(30)).toBe('mid');
    expect(satTone(60)).toBe('high');
    expect(moodFace(80)).toBe('😄');
    expect(moodFace(-10)).toBe('😠');
  });
  it('signed numbers and dollars', () => {
    expect(signed(5)).toBe('+5');
    expect(signed(-3)).toBe('−3');
    expect(signed(0)).toBe('0');
    expect(signedUsd(-5000)).toBe('−$50');
    expect(signedUsd(-150)).toBe('−$1.50');
    expect(signedUsd(250)).toBe('+$2.50');
    expect(signedUsd(0)).toBe('$0');
  });
});
