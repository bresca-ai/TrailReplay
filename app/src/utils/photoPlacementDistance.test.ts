import { describe, expect, it } from 'vitest';
import type { GPXPoint, GPXTrack } from '@/types';
import {
  buildComputedJourney,
  getJourneyElevationData,
  progressForRouteDistance,
  routeDistanceForSegmentAnchor,
  segmentAnchorForRouteDistance,
} from '@/utils/journeyUtils';
import { findTimestampPlacement } from '@/utils/photoTimelinePlacement';
import { projectCoordinateToJourney } from '@/utils/routeProjection';

/**
 * A climb recorded at an uneven sampling rate.
 *
 * Riding uphill is slow, so the device records many points per kilometre;
 * riding down again is fast and records few. That imbalance is what pulled
 * the marker, the elevation profile and the photos apart in the video: the
 * marker counted kilometres, the other two counted measurement points.
 *
 * The descent returns along the same line as the climb — an out-and-back —
 * so every coordinate on the way up appears a second time on the way down.
 */
const START_TIME = Date.UTC(2026, 4, 1, 8, 0, 0);

function makeBergTrack(): GPXTrack {
  const points: GPXPoint[] = [];
  const push = (lat: number, elevation: number, distance: number, minutes: number) => {
    points.push({
      lat,
      lon: 10.0,
      elevation,
      time: new Date(START_TIME + minutes * 60_000),
      heartRate: null,
      cadence: null,
      power: null,
      temperature: null,
      distance,
      speed: 0,
    });
  };

  // Climb: 40 points over 4000 m, one every 100 m, two minutes apart.
  for (let i = 0; i < 40; i += 1) {
    push(51.0 + i * 0.001, 500 + i * 16, i * 100, i * 2);
  }
  // Summit at 4000 m into the ride.
  push(51.04, 1140, 4000, 80);
  // Descent: back down the same line, 10 points over 4000 m.
  for (let i = 1; i <= 10; i += 1) {
    push(51.04 - i * 0.004, 1140 - i * 64, 4000 + i * 400, 80 + i);
  }

  return {
    id: 'berg', name: 'Bergfahrt', activityIcon: '🚴', points,
    totalDistance: 8000, totalTime: 5400, movingTime: 5400,
    elevationGain: 640, elevationLoss: 640, maxElevation: 1140, minElevation: 500,
    maxSpeed: 10, avgSpeed: 5, avgMovingSpeed: 5,
    bounds: { minLat: 51.0, maxLat: 51.04, minLon: 10.0, maxLon: 10.0 },
    color: '#000', visible: true,
  };
}

const track = makeBergTrack();
const segments = [{ id: 'seg', type: 'track' as const, trackId: 'berg', duration: 60_000 }];
const journey = buildComputedJourney(segments, [track])!;

/** The summit is exactly halfway by distance. */
const SUMMIT_BY_DISTANCE = 0.5;
/** By point number it is at 40 of 50 points — far too late. */
const SUMMIT_BY_POINT_INDEX = 40 / 50;
/** Metres into the ride where the summit photo was taken. */
const SUMMIT_ROUTE_DISTANCE = 4000;

describe('Constant Pace placement', () => {
  it('places a summit photo by distance, not by point number', () => {
    const match = projectCoordinateToJourney(journey, 51.04, 10.0, 0, 'uniform');

    expect(match).not.toBeNull();
    expect(match!.progress).toBeCloseTo(SUMMIT_BY_DISTANCE, 2);
    // The old value was about 30 percentage points out — that was the offset.
    expect(Math.abs(match!.progress - SUMMIT_BY_POINT_INDEX)).toBeGreaterThan(0.2);
  });

  it('puts the summit at the same place in the elevation profile', () => {
    const data = getJourneyElevationData(journey.coordinates, journey.segmentTimings, 'uniform');
    const summit = data.reduce((highest, point) => point.elevation > highest.elevation ? point : highest);

    expect(summit.elevation).toBe(1140);
    expect(summit.progress).toBeCloseTo(SUMMIT_BY_DISTANCE, 2);
  });

  it('brings photo and elevation profile to the same value', () => {
    const match = projectCoordinateToJourney(journey, 51.04, 10.0, 0, 'uniform');
    const data = getJourneyElevationData(journey.coordinates, journey.segmentTimings, 'uniform');
    const summit = data.reduce((highest, point) => point.elevation > highest.elevation ? point : highest);

    expect(Math.abs(match!.progress - summit.progress)).toBeLessThan(0.02);
  });
});

describe('Real Pace placement follows recorded timestamps', () => {
  it('places the summit at its recorded time', () => {
    const match = projectCoordinateToJourney(journey, 51.04, 10.0, 0, 'recorded');

    expect(match).not.toBeNull();
    expect(match!.progress).toBeCloseTo(80 / 90, 2);
  });
});

describe('The anchor kept with the photo', () => {
  it('records where on the route a GPS placement landed', () => {
    const match = projectCoordinateToJourney(journey, 51.02, 10.0, 0, 'uniform');

    expect(match!.routeDistance).toBeCloseTo(2000, 0);
  });

  it('records where on the route a timestamp placement landed', () => {
    // 85 minutes in — five minutes past the summit, on the way down. Its
    // coordinates are the same as the point 2 km into the climb.
    const placement = findTimestampPlacement({
      timestamp: new Date(START_TIME + 85 * 60_000),
      tracks: [track],
      journeySegments: segments,
      computedJourney: journey,
      activeTrackId: 'berg',
      routeTimingMode: 'uniform',
    });

    expect(placement.match).not.toBeNull();
    expect(placement.match!.lat).toBeCloseTo(51.02, 4);
    // Five points down the descent: 4000 m of climb plus 5 × 400 m. The
    // identical spot on the way up would be 2000 m.
    expect(placement.match!.routeDistance).toBeCloseTo(6000, 0);
  });

  it('keeps a photo on the leg it belongs to when the mode changes', () => {
    // On the way down, level with the point 2 km into the climb. Its
    // coordinates appear twice on this route; only the anchor distinguishes
    // the two, and recalculating must not move the photo to the other leg.
    const onTheWayDown = 6000;

    const uniform = progressForRouteDistance(
      journey.coordinates, journey.segmentTimings, onTheWayDown, 'uniform',
    );
    const recorded = progressForRouteDistance(
      journey.coordinates, journey.segmentTimings, onTheWayDown, 'recorded',
    );

    // Three quarters of the distance and 85 of 90 recorded minutes.
    expect(uniform).toBeCloseTo(0.75, 2);
    expect(recorded).toBeCloseTo(85 / 90, 2);

    // Searching for the nearest coordinate instead would find the identical
    // point on the way up and place the photo at half that distance.
    const byCoordinates = projectCoordinateToJourney(journey, 51.02, 10.0, 0, 'uniform');
    expect(byCoordinates!.progress).toBeLessThan(0.3);
  });

  it('is stable when recalculated repeatedly', () => {
    const once = progressForRouteDistance(
      journey.coordinates, journey.segmentTimings, SUMMIT_ROUTE_DISTANCE, 'uniform',
    );
    const twice = progressForRouteDistance(
      journey.coordinates, journey.segmentTimings, SUMMIT_ROUTE_DISTANCE, 'uniform',
    );

    expect(twice).toBeCloseTo(once!, 6);
    expect(once).toBeCloseTo(SUMMIT_BY_DISTANCE, 2);
  });

  it('stays with its segment when journey segments are reordered', () => {
    const repeatedSegments = [
      { id: 'outbound', type: 'track' as const, trackId: 'berg', duration: 60_000 },
      { id: 'return', type: 'track' as const, trackId: 'berg', duration: 60_000 },
    ];
    const beforeReorder = buildComputedJourney(repeatedSegments, [track])!;
    const afterReorder = buildComputedJourney([...repeatedSegments].reverse(), [track])!;

    const beforeDistance = routeDistanceForSegmentAnchor(
      beforeReorder.segmentTimings,
      'return',
      2000,
    );
    const afterDistance = routeDistanceForSegmentAnchor(
      afterReorder.segmentTimings,
      'return',
      2000,
    );

    expect(beforeDistance).toBe(10_000);
    expect(afterDistance).toBe(2000);
    expect(progressForRouteDistance(
      afterReorder.coordinates,
      afterReorder.segmentTimings,
      afterDistance!,
      'uniform',
    )).toBeCloseTo(0.125, 3);
  });

  it('upgrades a legacy journey-wide distance to a stable segment anchor', () => {
    const repeatedSegments = [
      { id: 'outbound', type: 'track' as const, trackId: 'berg', duration: 60_000 },
      { id: 'return', type: 'track' as const, trackId: 'berg', duration: 60_000 },
    ];
    const repeatedJourney = buildComputedJourney(repeatedSegments, [track])!;

    expect(segmentAnchorForRouteDistance(repeatedJourney.segmentTimings, 10_000)).toEqual({
      segmentId: 'return',
      segmentDistance: 2000,
    });
  });
});
