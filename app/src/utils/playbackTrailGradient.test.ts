import { describe, expect, it } from 'vitest';
import { createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec';
import type { StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import {
  buildPlaybackTrailGradient,
  PLAYBACK_PROGRESS_GLOBAL_STATE,
} from './playbackTrailGradient';

const coordinates = [
  [0, 0],
  [0.01, 0],
  [0.02, 0],
  [0.03, 0],
];

describe('buildPlaybackTrailGradient', () => {
  it('reveals the static line from render-time global state', () => {
    const expression = buildPlaybackTrailGradient({
      coordinates,
      colorMode: 'fixed',
      colorZones: [],
      fallbackColor: '#00ff00',
      heartRatePoints: [],
      segmentTimings: [],
    });

    expect(expression).toEqual([
      'case',
      ['<=', ['line-progress'], ['coalesce', ['global-state', PLAYBACK_PROGRESS_GLOBAL_STATE], 0]],
      '#00ff00',
      'rgba(0, 0, 0, 0)',
    ]);
  });

  it('builds a MapLibre-valid gradient for a fixed-color route', () => {
    const expression = buildPlaybackTrailGradient({
      coordinates,
      colorMode: 'fixed',
      colorZones: [],
      fallbackColor: '#00ff00',
      heartRatePoints: [],
      segmentTimings: [],
    });

    const parsed = createPropertyExpression(
      expression,
      'line-gradient',
      latest.paint_line['line-gradient'] as StylePropertySpecification,
      { [PLAYBACK_PROGRESS_GLOBAL_STATE]: 0.5 },
    );

    expect(parsed.result).toBe('success');
    if (parsed.result === 'success') {
      expect(parsed.value.evaluate({ zoom: 0, lineProgress: 0.25 }).a).toBe(1);
      expect(parsed.value.evaluate({ zoom: 0, lineProgress: 0.75 }).a).toBe(0);
    }
  });

  it('keeps per-segment colors in the completed route', () => {
    const expression = buildPlaybackTrailGradient({
      coordinates,
      colorMode: 'fixed',
      colorZones: [],
      fallbackColor: '#00ff00',
      heartRatePoints: [],
      segmentTimings: [
        { startCoordIndex: 0, type: 'track', color: '#ff0000' },
        { startCoordIndex: 2, type: 'track', color: '#0000ff' },
      ],
    });

    expect(expression[2]).toEqual([
      'step',
      ['line-progress'],
      '#ff0000',
      expect.closeTo(2 / 3, 5),
      '#0000ff',
    ]);
  });

  it('collapses consecutive heart-rate samples with the same color', () => {
    const expression = buildPlaybackTrailGradient({
      coordinates,
      colorMode: 'heartRate',
      colorZones: [],
      fallbackColor: '#00ff00',
      heartRatePoints: [
        { heartRate: 100 },
        { heartRate: 100 },
        { heartRate: 170 },
        { heartRate: 170 },
      ],
      segmentTimings: [],
    });

    expect(expression[2]).toEqual([
      'step',
      ['line-progress'],
      '#4ade80',
      expect.closeTo(2 / 3, 5),
      '#ef4444',
    ]);
  });
});
