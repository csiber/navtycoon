import { describe, it, expect } from 'vitest';
import { shiftScore, shiftStars, shiftTip, secondsUntilShiftReset } from '../shift-score';

describe('shift-score', () => {
  it('perfect shift → 3 stars, tip great', () => {
    const o = { resolved: 3, total: 3, satisfaction_total: 45, refunds_cents: 0 };
    expect(shiftScore(o)).toBe(91); // 60 + 21 + 10
    expect(shiftStars(o)).toBe(3);
    expect(shiftScore({ ...o, satisfaction_total: 90 })).toBe(100);
    expect(shiftTip(o)).toBe('great');
  });
  it('just closing everything (+5 each) is 2 stars; the third needs real conversations', () => {
    const o = { resolved: 3, total: 3, satisfaction_total: 15, refunds_cents: 0 };
    expect(shiftScore(o)).toBe(85); // 60 + 15 + 10
    expect(shiftStars(o)).toBe(2);
    const worse = { resolved: 3, total: 3, satisfaction_total: -30, refunds_cents: 0 };
    expect(shiftStars(worse)).toBe(2); // 60 + 6 + 10 = 76
    expect(shiftTip(worse)).toBe('mood');
  });
  it('half the queue left open → at most 2 stars, tip unresolved', () => {
    const o = { resolved: 2, total: 4, satisfaction_total: 60, refunds_cents: 0 };
    expect(shiftScore(o)).toBe(70);
    expect(shiftStars(o)).toBe(2);
    expect(shiftTip(o)).toBe('unresolved');
  });
  it('buying happiness with refunds costs the thrift points', () => {
    const o = { resolved: 2, total: 2, satisfaction_total: 70, refunds_cents: 2 * 5000 };
    expect(shiftScore(o)).toBe(90);
    expect(shiftTip(o)).toBe('refunds');
  });
  it('nothing resolved → 1 star, score 0, tip empty; total 0 is safe', () => {
    expect(shiftStars({ resolved: 0, total: 3, satisfaction_total: 0, refunds_cents: 0 })).toBe(1);
    expect(shiftScore({ resolved: 0, total: 0, satisfaction_total: 0, refunds_cents: 0 })).toBe(0);
    expect(shiftTip({ resolved: 0, total: 3, satisfaction_total: 0, refunds_cents: 0 })).toBe('empty');
  });
  it('secondsUntilShiftReset counts to the next UTC midnight', () => {
    expect(secondsUntilShiftReset(86400 * 10)).toBe(86400);
    expect(secondsUntilShiftReset(86400 * 10 + 3600)).toBe(86400 - 3600);
  });
});
