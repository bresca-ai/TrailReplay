import { describe, expect, it } from 'vitest';
import type { GPXPoint, GPXTrack, JourneySegment } from '@/types';
import {
  buildComputedJourney,
  buildJourneyDistanceProfile,
  getCompletedCoordinates,
  getJourneyDistanceAtProgress,
  getJourneyElevationData,
  getJourneyPointAtProgress,
  progressForRouteDistance,
  type JourneyPoint,
  type SegmentTiming,
} from './journeyUtils';

const timing = (segmentIndex: number, start: number, end: number, startCoordIndex: number, endCoordIndex: number): SegmentTiming => ({
  segmentId: `segment-${segmentIndex}`,
  segmentIndex,
  type: 'track',
  duration: end - start,
  startTime: start,
  endTime: end,
  startDistance: start * 100,
  endDistance: end * 100,
  startCoordIndex,
  endCoordIndex,
  progressStartRatio: start,
  progressEndRatio: end,
  distanceStartRatio: start,
  distanceEndRatio: end,
});

const point = (segmentIndex: number, elevation: number): JourneyPoint => ({
  lat: 45,
  lon: 6,
  elevation,
  time: null,
  heartRate: null,
  cadence: null,
  power: null,
  temperature: null,
  distance: 0,
  speed: 0,
  segmentIndex,
  segmentType: 'track',
});

describe('getJourneyElevationData', () => {
  it('uses journey segment timing instead of GPX sample counts', () => {
    const coordinates = [
      point(0, 100), point(0, 200), point(0, 300), point(0, 400),
      point(1, 500), point(1, 600),
    ];
    const data = getJourneyElevationData(coordinates, [
      timing(0, 0, 0.25, 0, 3),
      timing(1, 0.25, 1, 4, 5),
    ]);

    expect(data.map((sample) => sample.progress)).toEqual([0, 1 / 12, 1 / 6, 0.25, 0.25, 1]);
  });

  it('uses distance allocation when uniform timing is selected', () => {
    const data = getJourneyElevationData(
      [point(0, 100), point(0, 200), point(1, 300), point(1, 400)],
      [
        { ...timing(0, 0, 0.8, 0, 1), distanceEndRatio: 0.2 },
        { ...timing(1, 0.8, 1, 2, 3), distanceStartRatio: 0.2 },
      ],
      'uniform'
    );

    expect(data.map((sample) => sample.progress)).toEqual([0, 0.2, 0.2, 1]);
  });
});

function timedPoint(index: number, seconds: number | null): GPXPoint {
  return {
    lat: 45 + index * 0.001,
    lon: 6,
    elevation: 100 + index,
    time: seconds === null ? null : new Date(seconds * 1000),
    heartRate: null,
    cadence: null,
    power: null,
    temperature: null,
    distance: index * 100,
    speed: 1,
  };
}

function trackWithTimes(times: Array<number | null>): GPXTrack {
  const points = times.map((seconds, index) => timedPoint(index, seconds));
  return {
    id: 'timed-track',
    name: 'Timed track',
    activityIcon: 'runner',
    points,
    totalDistance: points[points.length - 1].distance,
    totalTime: times.at(-1) ?? 0,
    movingTime: times.at(-1) ?? 0,
    elevationGain: 0,
    elevationLoss: 0,
    maxElevation: 100,
    minElevation: 100,
    maxSpeed: 1,
    avgSpeed: 1,
    avgMovingSpeed: 1,
    bounds: { minLat: 45, maxLat: 46, minLon: 6, maxLon: 6 },
    color: '#000000',
    visible: true,
  };
}

function journeyFor(track: GPXTrack) {
  const segments: JourneySegment[] = [{
    id: 'timed-segment',
    type: 'track',
    trackId: track.id,
    duration: 320_000,
  }];
  return buildComputedJourney(segments, [track])!;
}

describe('Real Pace timestamp mapping', () => {
  it('spends replay time on a long stationary sampling gap', () => {
    const journey = journeyFor(trackWithTimes([0, 300, 310, 320]));
    const halfway = getJourneyPointAtProgress(0.5, journey.coordinates, journey.segmentTimings)!;

    // Half of the recorded clock is only 53% of the way to point 1. The old
    // point-index mapping was already halfway between points 1 and 2 here.
    expect(halfway.lat).toBeCloseTo(45.000533, 6);
    expect(halfway.distance).toBeCloseTo(53.333, 2);
    expect(halfway.time?.getTime()).toBe(160_000);

    const completed = getCompletedCoordinates(0.5, journey.coordinates, journey.segmentTimings);
    expect(completed).toHaveLength(2);
    expect(completed[1][1]).toBeCloseTo(halfway.lat, 8);
  });

  it('keeps distance anchors and elevation samples on the recorded clock', () => {
    const journey = journeyFor(trackWithTimes([0, 300, 310, 320]));
    const profile = buildJourneyDistanceProfile(journey.coordinates)!;
    const progress = progressForRouteDistance(
      journey.coordinates,
      journey.segmentTimings,
      100,
      'recorded',
    );

    expect(progress).toBeCloseTo(300 / 320, 8);
    expect(getJourneyDistanceAtProgress(progress!, profile, journey.segmentTimings)).toBeCloseTo(100, 5);
    expect(getJourneyElevationData(journey.coordinates, journey.segmentTimings, 'recorded')[1].progress)
      .toBeCloseTo(300 / 320, 8);
  });

  it('falls back to point-index timing when timestamps do not cover the route', () => {
    const journey = journeyFor(trackWithTimes([null, 300, 310, 320]));
    const halfway = getJourneyPointAtProgress(0.5, journey.coordinates, journey.segmentTimings)!;

    expect(halfway.distance).toBeCloseTo(150, 8);
  });
});
