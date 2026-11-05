import { describe, expect, it } from 'vitest';
import { buildColorZoneLineFeatures, buildSegmentLineFeatures, TRANSPORT_SEGMENT_COLOR } from './trailColorFeatures';
import type { ColoredSegmentTiming } from './trailColorFeatures';
import type { TrailColorZone } from '@/types';

const segmentTimings: ColoredSegmentTiming[] = [
  {
    segmentIndex: 0,
    type: 'track',
    startCoordIndex: 0,
    endCoordIndex: 2,
    color: '#ff0000',
  },
  {
    segmentIndex: 1,
    type: 'track',
    startCoordIndex: 3,
    endCoordIndex: 5,
    color: '#0000ff',
  },
];

describe('buildSegmentLineFeatures', () => {
  it('builds one colored line feature per segment', () => {
    const features = buildSegmentLineFeatures({
      coordinates: [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      segmentTimings,
      fallbackColor: '#00ff00',
    });

    expect(features).toHaveLength(2);
    expect(features[0].properties.color).toBe('#ff0000');
    expect(features[1].properties.color).toBe('#0000ff');
  });

  it('extends the active segment with the interpolated current point', () => {
    const features = buildSegmentLineFeatures({
      coordinates: [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      segmentTimings,
      fallbackColor: '#00ff00',
      maxCoordIndex: 3,
      partialEndpoint: [3.5, 3.5],
      partialSegmentIndex: 1,
    });

    expect(features).toHaveLength(2);
    expect(features[1].geometry.coordinates.at(-1)).toEqual([3.5, 3.5]);
  });

  it('uses the transport fallback color for transport segments', () => {
    const features = buildSegmentLineFeatures({
      coordinates: [
        [0, 0],
        [1, 1],
      ],
      segmentTimings: [
        {
          segmentIndex: 0,
          type: 'transport',
          startCoordIndex: 0,
          endCoordIndex: 1,
        },
      ],
      fallbackColor: '#00ff00',
    });

    expect(features[0].properties.color).toBe(TRANSPORT_SEGMENT_COLOR);
  });
});

describe('buildColorZoneLineFeatures', () => {
  const coordinates = [
    [0, 0],
    [10, 0],
    [20, 0],
  ];
  const zones: TrailColorZone[] = [
    { id: 'red-middle', fromProgress: 0.25, toProgress: 0.75, color: '#ff0000' },
  ];

  it('interpolates zone boundaries instead of snapping to GPS coordinates', () => {
    const features = buildColorZoneLineFeatures({
      coordinates,
      colorZones: zones,
      fallbackColor: '#00ff00',
    });

    expect(features.map((feature) => feature.properties.color)).toEqual(['#00ff00', '#ff0000', '#00ff00']);
    expect(features.map((feature) => feature.geometry.coordinates)).toEqual([
      [[0, 0], [5, 0]],
      [[5, 0], [10, 0], [15, 0]],
      [[15, 0], [20, 0]],
    ]);
  });

  it('does not extend a partially completed trail to the next GPS point', () => {
    const features = buildColorZoneLineFeatures({
      coordinates,
      colorZones: [{ id: 'all-red', fromProgress: 0, toProgress: 1, color: '#ff0000' }],
      fallbackColor: '#00ff00',
      maxCoordIndex: 0.5,
      partialEndpoint: [5, 0],
    });

    expect(features).toHaveLength(1);
    expect(features[0].geometry.coordinates).toEqual([[0, 0], [5, 0]]);
  });
});


describe('camera transition geometry', () => {
  it('does not draw the transition in fixed or zone colors', () => {
    const coordinates = [[0, 0], [1, 0], [1, 0], [10, 0], [10, 0], [11, 0]];
    const timings: ColoredSegmentTiming[] = [
      { segmentIndex: 0, type: 'track', startCoordIndex: 0, endCoordIndex: 1 },
      { segmentIndex: 1, type: 'transport', transportMode: 'camera', startCoordIndex: 2, endCoordIndex: 3 },
      { segmentIndex: 2, type: 'track', startCoordIndex: 4, endCoordIndex: 5 },
    ];
    const fixed = buildSegmentLineFeatures({ coordinates, segmentTimings: timings, fallbackColor: '#000' });
    const zones = buildColorZoneLineFeatures({ coordinates, segmentTimings: timings, colorZones: [], fallbackColor: '#000' });
    for (const features of [fixed, zones]) {
      expect(features.map((feature) => feature.geometry.coordinates)).toEqual([[[0, 0], [1, 0]], [[10, 0], [11, 0]]]);
    }
  });
});
