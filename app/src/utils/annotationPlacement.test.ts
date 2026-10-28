import { describe, expect, it } from 'vitest';
import type { GPXPoint, GPXTrack, TrackSegment } from '@/types';
import { buildComputedJourney } from '@/utils/journeyUtils';
import { annotationPlacementAtDistance } from './annotationPlacement';

function point(distance: number, seconds: number): GPXPoint {
  return { lat: 42 + distance / 100000, lon: 1, elevation: distance / 10, time: new Date(seconds * 1000), heartRate: null, cadence: null, power: null, temperature: null, distance, speed: 1 };
}
const track: GPXTrack = {
  id: 'route', name: 'Route', activityIcon: '🏃', points: [point(0, 0), point(100, 90), point(1000, 100)], totalDistance: 1000,
  totalTime: 100, movingTime: 100, elevationGain: 100, elevationLoss: 0, maxElevation: 100, minElevation: 0,
  maxSpeed: 1, avgSpeed: 1, avgMovingSpeed: 1, bounds: { minLat: 42, maxLat: 42.01, minLon: 1, maxLon: 1 }, color: '#000000', visible: true,
};
const segments: TrackSegment[] = [{ id: 'segment', type: 'track', trackId: 'route', duration: 100000 }];
const journey = buildComputedJourney(segments, [track])!;

describe('annotation placement', () => {
  it('maps distance to the correct coordinates and recorded playback time', () => {
    const placement = annotationPlacementAtDistance(500, journey, track, 'recorded')!;
    expect(placement.lat).toBeCloseTo(42.005, 6);
    expect(placement.routeDistance).toBe(500);
    expect(placement.progress).toBeCloseTo(0.94444, 4);
  });
  it('uses distance progress for uniform timing and clamps to the route', () => {
    expect(annotationPlacementAtDistance(500, journey, track, 'uniform')?.progress).toBeCloseTo(0.5);
    expect(annotationPlacementAtDistance(5000, null, track, 'uniform')).toMatchObject({ routeDistance: 1000, progress: 1 });
    expect(annotationPlacementAtDistance(1, null, null, 'uniform')).toBeNull();
  });
});
