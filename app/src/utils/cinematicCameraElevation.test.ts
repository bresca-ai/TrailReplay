import { describe, expect, it } from 'vitest';
import { settleCinematicElevation } from './cinematicCameraElevation';

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
});
