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
  it('adds the configured time without freezing the marker and inverts the route clock', () => {
    const duration = 60_000;
    expect(playbackTimeForRoute(duration, duration, [station])).toBeCloseTo(67_000);
    for (let elapsed = 0; elapsed <= 67_000; elapsed += 100) {
      const route = routeTimeForPlayback(elapsed, duration, [station]);
      expect(playbackTimeForRoute(route, duration, [station])).toBeCloseTo(elapsed, 2);
      if (elapsed > 0) expect(route).toBeGreaterThan(routeTimeForPlayback(elapsed - 1, duration, [station]));
    }
  });

  it('leaves legacy cards on the original timeline', () => {
    expect(playbackTimeForRoute(60_000, 60_000, [{ ...station, presentation: 'map-card' }])).toBe(60_000);
  });

  it('identifies redundant export frames only inside the annotation slowdown', () => {
    const duration = 60_000;
    const arrival = station.progress * duration;

    expect(annotationPlaybackRate(arrival - 500, duration, [station])).toBe(1);
    expect(annotationExportFrameStride(arrival - 500, duration, [station])).toBe(1);
    expect(annotationPlaybackRate(arrival, duration, [station])).toBeCloseTo(15);
    // Keep enough intermediate samples for the slowdown easing to remain
    // visibly smooth while still avoiding most near-identical map renders.
    expect(annotationExportFrameStride(arrival, duration, [station])).toBe(8);
    expect(annotationExportFrameStride(arrival + 500, duration, [station])).toBe(1);
  });

  it('bounds extremely long holds to avoid multi-second video samples', () => {
    const duration = 60_000;
    const longHold = { ...station, holdDuration: 30_000 };

    expect(annotationPlaybackRate(30_000, duration, [longHold])).toBeCloseTo(61);
    expect(annotationExportFrameStride(30_000, duration, [longHold])).toBe(8);
  });
});
