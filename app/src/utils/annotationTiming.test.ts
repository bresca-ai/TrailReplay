import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '@/types';
import {
  annotationExportFrameStride,
  annotationPlaybackRate,
  playbackTimeForRoute,
  routeTimeForPlayback,
} from './annotationTiming';

const station: TextAnnotation = {
  id: 'station', progress: 0.5, lat: 0, lon: 0, title: 'Station',
  color: '#123456', displayDuration: 4000, presentation: 'side-panel', holdDuration: 7000,
};

describe('annotation slowdown', () => {
  it('uses the configured total visible time without freezing the marker and inverts the route clock', () => {
    const duration = 60_000;
    expect(playbackTimeForRoute(duration, duration, [station])).toBeCloseTo(66_000);
    for (let elapsed = 0; elapsed <= 66_000; elapsed += 100) {
      const route = routeTimeForPlayback(elapsed, duration, [station]);
      expect(playbackTimeForRoute(route, duration, [station])).toBeCloseTo(elapsed, 2);
      if (elapsed > 0) expect(route).toBeGreaterThan(routeTimeForPlayback(elapsed - 1, duration, [station]));
    }
  });

  it('slows both caption and map annotation presentations', () => {
    expect(playbackTimeForRoute(60_000, 60_000, [{ ...station, presentation: 'map-card' }])).toBeCloseTo(66_000);
  });

  it('defaults to five seconds of slowdown', () => {
    expect(playbackTimeForRoute(60000, 60000, [{ ...station, holdDuration: undefined }])).toBeCloseTo(64000);
  });

  it('uses shared slowdown unless a note overrides it, including zero', () => {
    expect(playbackTimeForRoute(60000, 60000, [{ ...station, holdDuration: undefined }], 3000)).toBeCloseTo(62000);
    expect(playbackTimeForRoute(60000, 60000, [{ ...station, holdDuration: 1000 }], 3000)).toBeCloseTo(60000);
    expect(playbackTimeForRoute(60000, 60000, [{ ...station, holdDuration: 0 }], 3000)).toBeCloseTo(60000);
  });

  it('uses four seconds total after an override is cleared, including start and finish stops', () => {
    for (const progress of [0, 0.5, 1]) {
      const note = { ...station, progress, holdDuration: undefined };
      const arrival = progress * 60000;
      const start = Math.max(0, arrival - 500);
      const end = Math.min(60000, arrival + 500);
      expect(playbackTimeForRoute(end, 60000, [note], 4000) - playbackTimeForRoute(start, 60000, [note], 4000)).toBeCloseTo(4000);
    }
  });

  it('identifies redundant export frames only inside the annotation slowdown', () => {
    const duration = 60_000;
    const arrival = station.progress * duration;

    expect(annotationPlaybackRate(arrival - 500, duration, [station])).toBe(1);
    expect(annotationExportFrameStride(arrival - 500, duration, [station])).toBe(1);
    expect(annotationPlaybackRate(arrival, duration, [station])).toBeCloseTo(13);
    // Keep enough intermediate samples for the slowdown easing to remain
    // visibly smooth while still avoiding most near-identical map renders.
    expect(annotationExportFrameStride(arrival, duration, [station])).toBe(2);
    expect(annotationExportFrameStride(arrival + 500, duration, [station])).toBe(1);
  });

  it('bounds extremely long holds to avoid multi-second video samples', () => {
    const duration = 60_000;
    const longHold = { ...station, holdDuration: 30_000 };

    expect(annotationPlaybackRate(30_000, duration, [longHold])).toBeCloseTo(59);
    expect(annotationExportFrameStride(30_000, duration, [longHold])).toBe(2);
  });
});
