import { describe, expect, it } from 'vitest';
import { parseGPX } from './gpxParser';
import { getComparisonAvailability, hasSharedRoutePoint } from './comparisonAvailability';

function track(name: string, coords: Array<[number, number]>, timed: boolean) {
  const points = coords.map(([lat, lon], index) => `<trkpt lat="${lat}" lon="${lon}">${timed ? `<time>2026-10-25T10:${String(index * 10).padStart(2, '0')}:00Z</time>` : ''}</trkpt>`).join('');
  return parseGPX(`<gpx><trk><name>${name}</name><trkseg>${points}</trkseg></trk></gpx>`, `${name}.gpx`);
}

describe('comparison availability', () => {
  const primary = track('primary', [[42, 1], [42, 1.01], [42, 1.02]], true);
  const sameCourse = track('same', [[42, 1], [42, 1.005], [42, 1.02]], true);
  const distant = track('distant', [[43, 2], [43, 2.01]], true);

  it('allows both modes when both routes have timestamps and common points', () => {
    expect(getComparisonAvailability(primary, [sameCourse])).toMatchObject({ time: true, route: true });
  });

  it('rules out Time when one route has no usable timestamps', () => {
    const untimed = track('untimed', [[42, 1], [42, 1.02]], false);
    expect(getComparisonAvailability(primary, [untimed])).toMatchObject({ time: false, route: true, timeIssue: 'missingTiming' });
  });

  it('rules out Route when routes never meet, even if both are timed', () => {
    expect(hasSharedRoutePoint(primary, distant)).toBe(false);
    expect(getComparisonAvailability(primary, [distant])).toMatchObject({ time: true, route: false, routeIssue: 'noSharedRoute' });
  });

  it('reports both reasons when neither comparison can work', () => {
    const untimedDistant = track('untimed distant', [[43, 2], [43, 2.01]], false);
    expect(getComparisonAvailability(primary, [untimedDistant])).toEqual({ time: false, route: false, timeIssue: 'missingTiming', routeIssue: 'noSharedRoute' });
  });
});
