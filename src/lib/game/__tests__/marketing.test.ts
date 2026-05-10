import { describe, it, expect } from 'vitest';
import { normalizeMix } from '../marketing';

describe('normalizeMix', () => {
  it('balanced mix sums to 100', () => {
    const m = normalizeMix({ seo: 33, ppc: 33, referral: 34 });
    expect(m.seo + m.ppc + m.referral).toBe(100);
  });
  it('all-zero defaults to balanced', () => {
    expect(normalizeMix({})).toEqual({ seo: 33, ppc: 33, referral: 34 });
  });
  it('lopsided normalizes', () => {
    const m = normalizeMix({ seo: 200, ppc: 0, referral: 0 });
    expect(m.seo).toBe(100);
    expect(m.ppc).toBe(0);
    expect(m.referral).toBe(0);
  });
  it('negative values clamped to 0', () => {
    const m = normalizeMix({ seo: -50, ppc: 50, referral: 50 });
    expect(m.seo).toBe(0);
    expect(m.ppc + m.referral).toBe(100);
  });
});
