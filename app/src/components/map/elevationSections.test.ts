import { describe, expect, it } from 'vitest';
import {
  detectElevationFocusSections,
  type ElevationSectionPoint,
} from './elevationSections';

function profile(
  elevations: number[],
  step = 100,
  segmentIndex = 0,
  segmentType: ElevationSectionPoint['segmentType'] = 'track',
  distanceOffset = 0,
): ElevationSectionPoint[] {
  const totalDistance = distanceOffset + Math.max(1, (elevations.length - 1) * step);
  return elevations.map((elevation, index) => ({
    distance: distanceOffset + index * step,
    elevation,
    progress: (distanceOffset + index * step) / totalDistance,
    segmentIndex,
    segmentType,
  }));
}

describe('detectElevationFocusSections', () => {
  it('finds a sustained climb through GPS noise and a small reversal', () => {
    const sections = detectElevationFocusSections(profile([
      100, 108, 116, 114, 126, 139, 151, 149, 164, 178, 191,
    ]));

    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('climb');
    expect(sections[0].distance).toBeGreaterThanOrEqual(900);
    expect(sections[0].elevationGain).toBeGreaterThan(75);
    expect(sections[0].minElevation).toBeLessThan(sections[0].maxElevation);
  });

  it('detects a meaningful descent with loss statistics', () => {
    const sections = detectElevationFocusSections(profile([
      310, 301, 289, 276, 263, 251, 239, 225, 214, 202, 190,
    ]));

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ kind: 'descent', segmentIndex: 0 });
    expect(sections[0].elevationLoss).toBeGreaterThan(100);
    expect(sections[0].elevationGain).toBe(0);
  });

  it('ignores essentially flat terrain', () => {
    const sections = detectElevationFocusSections(profile([
      100, 102, 99, 103, 101, 100, 102, 101, 103, 100, 101, 102,
    ]));

    expect(sections).toEqual([]);
  });

  it('ignores transport and never crosses track or invalid-data boundaries', () => {
    const firstTrack = profile([100, 112, 126], 100, 0);
    const transport = profile([126, 180, 240, 300], 100, 1, 'transport', 300);
    const secondTrack = profile([300, 288, 275], 100, 2, 'track', 700);
    const invalid = {
      distance: 650,
      elevation: 0,
      progress: 0.65,
      segmentIndex: 1,
      segmentType: 'track' as const,
    };

    const sections = detectElevationFocusSections(
      [...firstTrack, invalid, ...transport, ...secondTrack],
      { minSectionDistance: 150, minElevationChange: 20, minOverviewGap: 0 },
    );

    expect(sections.map((section) => section.segmentIndex)).toEqual([0, 2]);
    expect(sections.map((section) => section.kind)).toEqual(['climb', 'descent']);
    expect(sections.every((section) => section.startDistance >= (section.segmentIndex === 2 ? 700 : 0))).toBe(true);
  });

  it('merges close same-direction climbs separated by a short shelf', () => {
    const sections = detectElevationFocusSections(profile([
      100, 114, 130, 145, 158, 145, 157, 172, 188, 203,
    ], 100), {
      minSectionDistance: 200,
      minElevationChange: 20,
      mergeGapDistance: 250,
      minOverviewGap: 100,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('climb');
    expect(sections[0].startDistance).toBe(0);
    expect(sections[0].endDistance).toBe(900);
    expect(sections[0].elevationLoss).toBeGreaterThan(0);
  });
});
