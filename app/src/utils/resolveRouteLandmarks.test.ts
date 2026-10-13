import { describe, expect, it } from 'vitest';
import { resolveRouteLandmarks } from './resolveRouteLandmarks';
import type { RouteLandmark } from '@/types/landmarks';

const landmark = (id: string, source: RouteLandmark['source'], distance: number, importance: RouteLandmark['importance'] = 3): RouteLandmark => ({ id, type: 'custom', source, display: 'subtle', lat: 45, lon: 6 + distance / 100_000, progress: 0, title: id, importance, routeDistanceMeters: distance });

describe('resolveRouteLandmarks', () => {
  it('prefers a user landmark when candidates share an anchor', () => {
    expect(resolveRouteLandmarks([landmark('automatic', 'automatic', 100), landmark('user', 'user', 110)]).map((entry) => entry.id)).toEqual(['user']);
  });

  it('caps lower-priority labels in the same route corridor', () => {
    expect(resolveRouteLandmarks([landmark('first', 'automatic', 100), landmark('second', 'automatic', 200)]).length).toBe(1);
  });

  it('keeps more than forty distributed places from multiple routes', () => {
    const places = Array.from({ length: 64 }, (_, index) => (
      landmark(`place-${index}`, 'enriched', index * 1_000, 4)
    ));

    expect(resolveRouteLandmarks(places)).toHaveLength(64);
  });

  it('deduplicates the same physical place projected onto two journey segments', () => {
    const first = landmark('osm-town-1:segment-a', 'enriched', 1_000, 4);
    const second = {
      ...landmark('osm-town-1:segment-b', 'enriched', 80_000, 4),
      lat: first.lat + 0.00001,
      lon: first.lon + 0.00001,
    };

    expect(resolveRouteLandmarks([first, second])).toHaveLength(1);
  });

  it('retains a generous safety ceiling for very large landmark sets', () => {
    const places = Array.from({ length: 140 }, (_, index) => (
      landmark(`place-${index}`, 'enriched', index * 1_000, 4)
    ));

    expect(resolveRouteLandmarks(places)).toHaveLength(120);
  });
});
