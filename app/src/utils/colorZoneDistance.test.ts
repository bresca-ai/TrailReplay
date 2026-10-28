import { describe, expect, it } from 'vitest';
import { colorZoneDistances, distanceAtZoneProgress, zoneProgressAtDistance } from './colorZoneDistance';

describe('color zone distance conversion', () => {
  it('maps distances to coordinate progress on unevenly spaced points', () => {
    const distances = colorZoneDistances([[0, 0], [0.001, 0], [0.01, 0]]);
    const halfway = zoneProgressAtDistance(distances, distances[2] / 2);
    expect(halfway).toBeGreaterThan(0.5);
    expect(distanceAtZoneProgress(distances, halfway)).toBeCloseTo(distances[2] / 2, 8);
    expect(zoneProgressAtDistance(distances, 100)).toBe(1);
  });
  it('handles missing and repeated points', () => {
    expect(zoneProgressAtDistance([], 1)).toBe(0);
    expect(zoneProgressAtDistance([0, 0, 1], 0.5)).toBe(0.75);
    expect(zoneProgressAtDistance([0, 0], 1)).toBe(0);
  });
});
