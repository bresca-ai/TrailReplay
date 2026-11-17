import { describe, expect, it } from 'vitest';
import { getLocalShotHeading } from './localShotHeading';
import { getRouteBearingAtProgress } from './replayCameraPlan';

function angularDistance(a: number, b: number) {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

describe('local shot heading', () => {
  it('filters rapid switchbacks while retaining the direction of travel', () => {
    const route = Array.from({ length: 601 }, (_, i) => [i * 0.0001, (i % 20 < 10 ? i % 10 : 10 - (i % 10)) * 0.00008]);
    const raw: number[] = [];
    const smooth: number[] = [];
    for (let i = 200; i <= 400; i++) {
      const progress = i / 600;
      raw.push(getRouteBearingAtProgress(route, progress));
      smooth.push(getLocalShotHeading(route, progress, 0, 30_000));
    }
    const variation = (values: number[]) => values.slice(1).reduce((sum, value, i) => sum + angularDistance(value, values[i]), 0);
    expect(variation(raw)).toBeGreaterThan(variation(smooth) * 5);
    expect(angularDistance(smooth[100], 90)).toBeLessThan(20);
  });
});
