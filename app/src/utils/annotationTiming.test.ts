import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '@/types';
import { playbackTimeForRoute, routeTimeForPlayback } from './annotationTiming';

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
});
