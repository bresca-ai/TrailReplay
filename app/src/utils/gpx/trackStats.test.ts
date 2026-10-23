import { describe, expect, it } from 'vitest';
import { calculateElevationGain, calculateElevationLoss } from './trackStats';

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

  it('retains the full ascent of a sparse summit when playback passes into its descent', () => {
    const route = points([100, 120, 105]);
    expect(calculateElevationGain(route, 1)).toBe(20);
    expect(calculateElevationGain(route)).toBe(20);
  });

  it('does not change sparse two-point climbs', () => {
    expect(calculateElevationGain(points([1000, 1015]))).toBe(15);
  });
});

describe('distance-normalized elevation gain', () => {
  const profile = (step: number) => Array.from({ length: 1000 / step + 1 }, (_, i) => ({
    distance: i * step,
    elevation: 100 + i * step / 10 + (i * step % 20 === 0 ? 8 : -8),
  }));

  it('counts a sustained climb fully, including the last metres below the noise threshold', () => {
    const climb = Array.from({ length: 101 }, (_, i) => ({ distance: i * 10, elevation: 100 + i * 0.35 }));
    expect(calculateElevationGain(climb)).toBeCloseTo(35, 8);
  });

  it('does not count dense altitude jitter as repeated climbs', () => {
    const noisy = profile(5);
    expect(calculateElevationGain(noisy)).toBeGreaterThan(85);
    expect(calculateElevationGain(noisy)).toBeLessThan(120);
  });

  it('gives the same answer when the same elevation geometry has extra interpolated samples', () => {
    const original = profile(10);
    const dense = original.flatMap((point, i) => i === original.length - 1 ? [point] : [
      point,
      ...[0.2, 0.4, 0.6, 0.8].map((ratio) => ({
        distance: point.distance + ratio * 10,
        elevation: point.elevation + (original[i + 1].elevation - point.elevation) * ratio,
      })),
    ]);
    expect(calculateElevationGain(dense)).toBeCloseTo(calculateElevationGain(original), 8);
  });

  it('keeps genuine sustained climbs and descents', () => {
    const hills = Array.from({ length: 401 }, (_, i) => {
      const distance = i * 10;
      const elevation = distance <= 1000 ? 100 + distance * 0.1
        : distance <= 2000 ? 200 - (distance - 1000) * 0.1
        : distance <= 3000 ? 100 + (distance - 2000) * 0.1
        : 200 - (distance - 3000) * 0.1;
      return { distance, elevation };
    });
    expect(calculateElevationGain(hills)).toBeGreaterThan(170);
    expect(calculateElevationGain(hills)).toBeLessThanOrEqual(200);
  });

  it('uses the same calculation for descent and a reversed altitude profile', () => {
    const route = profile(5);
    const descending = route.map((point) => ({ ...point, elevation: -point.elevation }));
    expect(calculateElevationLoss(descending)).toBeCloseTo(calculateElevationGain(route), 8);
    expect(calculateElevationGain(descending)).toBeLessThan(10);
  });

  it('keeps equivalent legs independent of their distance origin', () => {
    const route = profile(5);
    expect(calculateElevationGain(route.map((point) => ({ ...point, distance: point.distance + 1200 })))).toBeCloseTo(calculateElevationGain(route), 8);
  });

  it('uses one stable, monotonic accumulated profile during playback without changing raw elevations', () => {
    const route = profile(5);
    const original = structuredClone(route);
    const gains = route.map((_, i) => calculateElevationGain(route, i));
    expect(gains[0]).toBe(0);
    expect(gains.every((gain, i) => i === 0 || gain >= gains[i - 1])).toBe(true);
    expect(gains.at(-1)).toBe(calculateElevationGain(route));
    expect(route).toEqual(original);
  });
});
