import { describe, expect, it } from 'vitest';
import { calculateElevationGain } from './trackStats';

const points = (elevations: number[]) => elevations.map((elevation) => ({ elevation }));

describe('calculateElevationGain', () => {
  it('ignores short GPS oscillations', () => {
    expect(calculateElevationGain(points([1000, 1005, 1001, 1007, 1003]))).toBe(0);
  });

  it('preserves a sustained climb', () => {
    expect(calculateElevationGain(points([1000, 1004, 1009, 1015, 1025, 1035]))).toBe(35);
  });

  it('removes an isolated altitude spike before accumulating gain', () => {
    expect(calculateElevationGain(points([1000, 1002, 1040, 1003, 1005, 1018]))).toBe(18);
  });

  it('does not change sparse two-point climbs', () => {
    expect(calculateElevationGain(points([1000, 1015]))).toBe(15);
  });
});
