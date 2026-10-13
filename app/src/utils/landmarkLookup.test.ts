import { describe, expect, it } from 'vitest';
import {
  buildLandmarkLookupBatches,
  landmarkTrackSignature,
  selectRouteWidePlaces,
  tracksNeedingLandmarkLookup,
} from './landmarkLookup';

describe('landmark lookup batching', () => {
  it('splits long routes into overlapping API-safe corridors', () => {
    const points = Array.from({ length: 401 }, (_, index) => ({
      lat: 40 + index * 0.01,
      lon: 2 + index * 0.002,
    }));
    const batches = buildLandmarkLookupBatches(points);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((batch) => batch.length >= 2 && batch.length <= 160)).toBe(true);
    expect(batches.slice(1).every((batch, index) => {
      const previous = batches[index];
      return batch[0][0] === previous.at(-1)?.[0] && batch[0][1] === previous.at(-1)?.[1];
    })).toBe(true);
    expect(batches.every((batch) => {
      const latitudes = batch.map((point) => point[1]);
      const longitudes = batch.map((point) => point[0]);
      return Math.max(...latitudes) - Math.min(...latitudes) <= 1.1
        && Math.max(...longitudes) - Math.min(...longitudes) <= 1.1;
    })).toBe(true);
  });

  it('changes the cache signature when a newly imported track is added or replaced', () => {
    const first = { id: 'track-1', points: [{ lat: 40, lon: 2 }, { lat: 41, lon: 3 }] };
    expect(landmarkTrackSignature(first)).not.toBe(landmarkTrackSignature({
      ...first,
      points: [...first.points, { lat: 42, lon: 4 }],
    }));
  });

  it('requests the places API for a track added after the first lookup', () => {
    const first = { id: 'track-1', points: [{ lat: 40, lon: 2 }, { lat: 41, lon: 3 }] };
    const second = { id: 'track-2', points: [{ lat: 42, lon: 4 }, { lat: 43, lon: 5 }] };
    const cached = new Map([[first.id, landmarkTrackSignature(first)]]);

    expect(tracksNeedingLandmarkLookup([first, second], cached).map((track) => track.id))
      .toEqual(['track-2']);
  });

  it('spreads equal-importance places across the full route instead of trusting provider order', () => {
    const candidates = Array.from({ length: 96 }, (_, index) => ({
      id: `place-${index}`,
      distanceMeters: 100,
      importance: 4,
      // Provider order is grouped by route section, so a naive first-32 slice
      // would never reach the second half of the route.
      progress: index / 95,
    }));
    const selected = selectRouteWidePlaces(candidates);

    expect(selected).toHaveLength(32);
    expect(selected[0].progress).toBeLessThan(0.07);
    expect(selected.at(-1)?.progress).toBeGreaterThan(0.93);
    for (let bucket = 0; bucket < 16; bucket += 1) {
      expect(selected.filter((place) => (
        Math.min(15, Math.floor(place.progress * 16)) === bucket
      ))).toHaveLength(2);
    }
  });

  it('allows separate routes to contribute more than forty places', () => {
    const route = (prefix: string) => Array.from({ length: 64 }, (_, index) => ({
      id: `${prefix}-${index}`,
      distanceMeters: 50,
      importance: 4,
      progress: index / 63,
    }));

    expect([
      ...selectRouteWidePlaces(route('first')),
      ...selectRouteWidePlaces(route('second')),
    ]).toHaveLength(64);
  });
});
