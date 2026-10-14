import { describe, expect, it } from 'vitest';
import type { ElevationSectionOverride } from '@/types';
import type { ElevationFocusSection, ElevationSectionPoint } from './elevationSections';
import {
  applyElevationSectionOverrides,
  resizeElevationSection,
  upsertElevationSectionOverride,
} from './elevationSectionOverrides';

const points: ElevationSectionPoint[] = [100, 130, 160, 140, 180].map((elevation, index) => ({
  distance: index * 100,
  elevation,
  progress: index * 0.1,
  segmentIndex: 0,
  segmentType: 'track',
}));

const detected: ElevationFocusSection = {
  id: 'elevation-0-climb-1',
  kind: 'climb',
  startProgress: 0,
  endProgress: 0.4,
  startDistance: 0,
  endDistance: 400,
  distance: 400,
  minElevation: 100,
  maxElevation: 180,
  elevationGain: 100,
  elevationLoss: 20,
  segmentIndex: 0,
};

describe('elevation section overrides', () => {
  it('snaps dragged boundaries to route samples and recalculates metrics', () => {
    const resized = resizeElevationSection(detected, points, 0.09, 0.31);

    expect(resized).toMatchObject({
      startProgress: 0.1,
      startDistance: 100,
      endDistance: 300,
      distance: 200,
      minElevation: 130,
      maxElevation: 160,
      elevationGain: 30,
      elevationLoss: 20,
    });
    expect(resized.endProgress).toBeCloseTo(0.3);
  });

  it('persists an edit against the exact automatic section it came from', () => {
    const adjusted = resizeElevationSection(detected, points, 0.1, 0.3);
    const overrides = upsertElevationSectionOverride([], detected, adjusted);

    const restored = applyElevationSectionOverrides([detected], overrides, points)[0];
    expect(restored.startProgress).toBeCloseTo(0.1);
    expect(restored.endProgress).toBeCloseTo(0.3);
  });

  it('ignores a stale edit when automatic detection changes', () => {
    const stale: ElevationSectionOverride = {
      sectionId: detected.id,
      segmentIndex: 0,
      kind: 'climb',
      detectedStartProgress: 0.05,
      detectedEndProgress: 0.4,
      startProgress: 0.1,
      endProgress: 0.3,
    };

    expect(applyElevationSectionOverrides([detected], [stale], points)[0]).toBe(detected);
  });
});
