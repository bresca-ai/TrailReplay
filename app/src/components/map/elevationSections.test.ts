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

  it('detects a sustained descent by default', () => {
    const sections = detectElevationFocusSections(profile([
      310, 301, 289, 276, 263, 251, 239, 225, 214, 202, 190,
    ]));

    expect(sections[0]).toMatchObject({ kind: 'descent', segmentIndex: 0 });
    expect(sections[0].elevationLoss).toBeGreaterThan(100);
  });

  it('can explicitly restrict detection to climbs', () => {
    const sections = detectElevationFocusSections(profile([
      310, 301, 289, 276, 263, 251, 239, 225, 214, 202, 190,
    ]), { includeDescents: false });

    expect(sections).toEqual([]);
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

  it('keeps the stronger of two nearby climbs instead of combining them into one arbitrary span', () => {
    const sections = detectElevationFocusSections(profile([
      100, 120, 145, 170, 195,
      155, 145, 140,
      155, 170, 185, 200,
    ], 100), {
      minSectionDistance: 250,
      minElevationChange: 30,
      mergeGapDistance: 100,
      minOverviewGap: 500,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].startDistance).toBe(0);
    expect(sections[0].endDistance).toBe(400);
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

  it('keeps a long climb together across a proportionally short downhill interruption', () => {
    const sections = detectElevationFocusSections(profile([
      100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300,
      285, 275, 270,
      285, 300, 320, 340, 360, 380, 400, 420, 440,
    ], 100), {
      minSectionDistance: 300,
      minElevationChange: 30,
      minOverviewGap: 0,
      maxSections: 4,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      kind: 'climb',
      startDistance: 0,
      endDistance: 2_200,
    });
    expect(sections[0].elevationGain).toBeGreaterThan(330);
    expect(sections[0].elevationLoss).toBeGreaterThan(20);
  });

  it('keeps a long descent together across a proportionally short uphill interruption', () => {
    const sections = detectElevationFocusSections(profile([
      440, 420, 400, 380, 360, 340, 320, 300, 280, 260, 240,
      255, 265, 270,
      255, 240, 220, 200, 180, 160, 140, 120, 100,
    ], 100), {
      minSectionDistance: 300,
      minElevationChange: 30,
      minOverviewGap: 0,
      maxSections: 4,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      kind: 'descent',
      startDistance: 0,
      endDistance: 2_200,
    });
    expect(sections[0].elevationLoss).toBeGreaterThan(330);
    expect(sections[0].elevationGain).toBeGreaterThan(20);
  });

  it('keeps a substantial valley as separate terrain instead of merging two hills', () => {
    const sections = detectElevationFocusSections(profile([
      100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300,
      285, 270, 255, 240, 225, 210, 200,
      220, 240, 260, 280, 300, 320, 340, 360, 380, 400,
    ], 100), {
      minSectionDistance: 300,
      minElevationChange: 30,
      minOverviewGap: 0,
      maxSections: 4,
    });

    expect(sections.map((section) => section.kind)).toEqual([
      'climb',
      'descent',
      'climb',
    ]);
  });

  it('uses a later higher summit when an extended dip has low prominence', () => {
    const sections = detectElevationFocusSections(profile([
      100, 140, 180, 220, 260, 300, 340, 380, 420, 460, 500,
      494, 488, 482, 476, 470, 464, 458, 452, 446, 440,
      465, 490, 515, 540, 565, 590, 615, 640,
    ], 100), {
      minSectionDistance: 300,
      minElevationChange: 30,
      minOverviewGap: 0,
      maxSections: 4,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      kind: 'climb',
      startDistance: 0,
      endDistance: 2_800,
    });
    expect(sections[0].maxElevation).toBeGreaterThan(620);
  });

  it('uses a later lower valley when an extended bump has low prominence', () => {
    const sections = detectElevationFocusSections(profile([
      640, 600, 560, 520, 480, 440, 400, 360, 320, 280, 240,
      246, 252, 258, 264, 270, 276, 282, 288, 294, 300,
      275, 250, 225, 200, 175, 150, 125, 100,
    ], 100), {
      minSectionDistance: 300,
      minElevationChange: 30,
      minOverviewGap: 0,
      maxSections: 4,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      kind: 'descent',
      startDistance: 0,
      endDistance: 2_800,
    });
    expect(sections[0].minElevation).toBeLessThan(120);
  });

  it('keeps both directions represented when separated climbs and descents are available', () => {
    const descent = profile([260, 225, 190, 155, 120, 85], 100, 0);
    const climb = profile([80, 115, 150, 185, 220, 255], 100, 1, 'track', 2_000);
    const sections = detectElevationFocusSections([...descent, ...climb], {
      minSectionDistance: 300,
      minElevationChange: 60,
      minOverviewGap: 500,
      maxSections: 3,
    });

    expect(new Set(sections.map((section) => section.kind))).toEqual(new Set(['climb', 'descent']));
  });
});
