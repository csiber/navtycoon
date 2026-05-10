import { describe, it, expect } from 'vitest';
import { clampPricing } from '../pricing';

describe('clampPricing', () => {
  it('within bounds passes through', () => {
    expect(clampPricing(500, 1500)).toEqual({ hobby: 500, business: 1500 });
  });
  it('below min clamps up', () => {
    expect(clampPricing(100, 500)).toEqual({ hobby: 300, business: 1000 });
  });
  it('above max clamps down', () => {
    expect(clampPricing(5000, 9999)).toEqual({ hobby: 1000, business: 3000 });
  });
});
