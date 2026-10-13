import { describe, expect, it } from 'vitest';
import {
  getLivePlaybackClockTick,
  isLivePlaybackBasemapReady,
  type LivePlaybackBasemapMap,
} from './livePlaybackTileGate';

function createMap(overrides: Partial<LivePlaybackBasemapMap> = {}): LivePlaybackBasemapMap {
  return {
    getSource: () => ({}),
    isSourceLoaded: () => true,
    isStyleLoaded: () => true,
    ...overrides,
  };
}

describe('isLivePlaybackBasemapReady', () => {
  it('waits for the active detail source rather than accepting fallback tiles', () => {
    const requestedSources: string[] = [];
    const map = createMap({
      getSource: (sourceId) => ({ sourceId }),
      isSourceLoaded: (sourceId) => {
        requestedSources.push(sourceId);
        return false;
      },
    });

    expect(isLivePlaybackBasemapReady(map, 'satellite')).toBe(false);
    expect(requestedSources).toEqual(['satellite']);
  });

  it('does not accept an indeterminate style state', () => {
    expect(isLivePlaybackBasemapReady(
      createMap({ isStyleLoaded: () => undefined }),
      'satellite',
    )).toBe(false);
  });

  it('does not block a presentation whose optional source is absent', () => {
    expect(isLivePlaybackBasemapReady(
      createMap({ getSource: () => undefined }),
      'wayback',
    )).toBe(true);
  });
});

describe('getLivePlaybackClockTick', () => {
  it('establishes its first wall-clock anchor without advancing route time', () => {
    expect(getLivePlaybackClockTick(100, null, true)).toEqual({
      deltaMs: 0,
      timestampMs: 100,
    });
  });

  it('consumes blocked wall time without advancing route time', () => {
    expect(getLivePlaybackClockTick(1100, 100, false)).toEqual({
      deltaMs: 0,
      timestampMs: 1100,
    });
  });

  it('resumes from the latest blocked timestamp without a catch-up jump', () => {
    const blocked = getLivePlaybackClockTick(1100, 100, false);
    const resumed = getLivePlaybackClockTick(1116, blocked.timestampMs, true);

    expect(resumed.deltaMs).toBe(16);
  });
});
