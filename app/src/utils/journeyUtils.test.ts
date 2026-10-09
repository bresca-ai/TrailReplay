import { describe, expect, it } from 'vitest';
import { getJourneyElevationData, type JourneyPoint, type SegmentTiming } from './journeyUtils';

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
