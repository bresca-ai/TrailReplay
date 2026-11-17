import { describe, expect, it } from 'vitest';
import { getCinematicCenterElevation, settleCinematicElevation } from './cinematicCameraElevation';

describe('cinematic terrain height', () => {
  it('limits tile refinement jumps using playback time and holds through missing samples', () => {
    const first = settleCinematicElevation(null, 100, null, true);
    const missing = settleCinematicElevation(first, null, 100, true);
    const refined = settleCinematicElevation(missing, 1000, 100, true);
    expect(first).toBe(100);
    expect(missing).toBe(100);
    expect(refined).toBe(140);
    expect(settleCinematicElevation(refined, 1000, 0, true)).toBe(140);
    expect(settleCinematicElevation(refined, 1000, 100, true)).toBe(180);
  });

  it('follows ordinary gradients immediately and resets when terrain is disabled', () => {
    expect(settleCinematicElevation(100, 120, 100, true)).toBe(120);
    expect(settleCinematicElevation(100, null, 100, false)).toBeNull();
    expect(settleCinematicElevation(null, 500, null, true)).toBe(500);
  });

  it('reduces a short terrain peak with a symmetric look-ahead window', () => {
    const coordinates = Array.from({ length: 101 }, (_, index) => [index / 100, 0]);
    const readElevation = ([x]: [number, number]) => 500 + 100 * Math.exp(-(((x - 0.5) / 0.025) ** 2));
    const smoothed = getCinematicCenterElevation({ coordinates, center: [0.5, 0], progress: 0.5,
      halfWindow: 4.5 / 30, maxDeviationMeters: 100, readElevation });
    expect(smoothed).not.toBeNull();
    expect(smoothed!).toBeGreaterThan(500);
    expect(smoothed!).toBeLessThan(580);
  });
});
