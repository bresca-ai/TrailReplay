import { describe, expect, it, vi } from 'vitest';
import {
  getTilePriority,
  getTileRequestUrl,
  preloadTileImage,
  TileRequestScheduler,
} from './tileRequestScheduler';

describe('TileRequestScheduler', () => {
  it('does not queue duplicate requests while a tile is already loading', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const load = vi.fn(() => pending);
    const scheduler = new TileRequestScheduler({ concurrency: 1, load });
    const tile = { key: '12/1/2', priority: 0, sourceId: 'satellite', url: 'tile' };
    scheduler.enqueue(tile);
    scheduler.enqueue(tile);
    finish();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('allows a tile to be warmed again after a playback reset', async () => {
    const load = vi.fn(() => Promise.resolve());
    const scheduler = new TileRequestScheduler({ concurrency: 1, load });
    const tile = { key: '12/1/2', priority: 0, sourceId: 'satellite', url: 'tile' };
    scheduler.enqueue(tile);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    scheduler.clear();
    scheduler.enqueue(tile);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
  it('cancels in-flight work on reset so a new view can use the slot', async () => {
    const load = vi.fn((url: string, signal?: AbortSignal) => url === 'old'
      ? new Promise<void>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      : Promise.resolve());
    const scheduler = new TileRequestScheduler({ concurrency: 1, load });
    scheduler.enqueue({ key: '1/0/0', priority: 0, sourceId: 'satellite', url: 'old' });
    scheduler.clear();
    scheduler.enqueue({ key: '1/0/1', priority: 0, sourceId: 'satellite', url: 'new' });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls.map(([url]) => url)).toEqual(['old', 'new']);
  });
  it('retains the same tile when it is requested again before cancellation settles', async () => {
    let calls = 0;
    const load = vi.fn((_url: string, signal?: AbortSignal) => {
      calls++;
      return calls === 1 ? new Promise<void>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })) : Promise.resolve();
    });
    const scheduler = new TileRequestScheduler({ concurrency: 2, load });
    const tile = { key: '1/0/0', priority: 0, sourceId: 'satellite', url: 'tile' };
    scheduler.enqueue(tile);
    scheduler.clear();
    scheduler.enqueue(tile);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
  it('drops stale queued predictions so a new nearby view can load next', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const load = vi.fn((url: string) => url === 'active' ? pending : Promise.resolve());
    const scheduler = new TileRequestScheduler({ concurrency: 1, load });
    scheduler.enqueue({ key: '1/0/0', priority: 0, sourceId: 'satellite', url: 'active' });
    scheduler.enqueue({ key: '1/0/1', priority: 0, sourceId: 'satellite', url: 'stale' });
    scheduler.clearQueued();
    scheduler.enqueue({ key: '1/1/0', priority: 0, sourceId: 'satellite', url: 'nearby' });
    finish();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls.map(([url]) => url)).toEqual(['active', 'nearby']);
  });
  it('prioritizes essential tiles and does not duplicate a completed tile', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const load = vi.fn((url: string) => url === 'active' ? firstRequest : Promise.resolve());
    const scheduler = new TileRequestScheduler({ concurrency: 1, load });
    scheduler.enqueue({ key: '16/0/0', priority: 0, sourceId: 'base', url: 'active' });
    scheduler.enqueue({ key: '16/1/1', priority: 3, sourceId: 'labels', url: 'labels' });
    scheduler.enqueue({ key: '16/1/2', priority: 0, sourceId: 'base', url: 'base' });
    releaseFirst?.();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(load.mock.calls.map(([url]) => url)).toEqual(['active', 'base', 'labels']);

    scheduler.enqueue({ key: '16/1/2', priority: 0, sourceId: 'base', url: 'base' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('loads upcoming views before stale predictions without discarding the latter', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const load = vi.fn((url: string) => url === 'active' ? held : Promise.resolve());
    const scheduler = new TileRequestScheduler({ concurrency: 1, load, isStale: request => request.priority < 10 });
    scheduler.enqueue({ key: '1/0/0', priority: 0, sourceId: 'satellite', url: 'active' });
    scheduler.enqueue({ key: '1/0/1', priority: 1, sourceId: 'satellite', url: 'past' });
    scheduler.enqueue({ key: '1/1/0', priority: 11, sourceId: 'satellite', url: 'upcoming' });
    release();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(load.mock.calls.map(([url]) => url)).toEqual(['active', 'upcoming', 'past']);
  });

  it('revives a stale tile when it is rediscovered for a current view', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const load = vi.fn((url: string) => url === 'active' ? held : Promise.resolve());
    const scheduler = new TileRequestScheduler({ concurrency: 1, load, isStale: request => request.priority < 10 });
    scheduler.enqueue({ key: '1/0/0', priority: 0, sourceId: 'satellite', url: 'active' });
    scheduler.enqueue({ key: '1/0/1', priority: 1, sourceId: 'satellite', url: 'revisited' });
    scheduler.enqueue({ key: '1/1/0', priority: 12, sourceId: 'satellite', url: 'later' });
    scheduler.enqueue({ key: '1/0/1', priority: 11, sourceId: 'satellite', url: 'revisited' });
    release();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(load.mock.calls.map(([url]) => url)).toEqual(['active', 'revisited', 'later']);
  });

  it('does not replace a current prediction with an older stale one', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const load = vi.fn((url: string) => url === 'active' ? held : Promise.resolve());
    const scheduler = new TileRequestScheduler({ concurrency: 1, load, isStale: request => request.priority < 10 });
    scheduler.enqueue({ key: '1/0/0', priority: 0, sourceId: 'satellite', url: 'active' });
    scheduler.enqueue({ key: '1/0/1', priority: 11, sourceId: 'satellite', url: 'current' });
    scheduler.enqueue({ key: '1/1/0', priority: 12, sourceId: 'satellite', url: 'later' });
    scheduler.enqueue({ key: '1/0/1', priority: 1, sourceId: 'satellite', url: 'current' });
    release();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(load.mock.calls.map(([url]) => url)).toEqual(['active', 'current', 'later']);
  });

  it('builds provider URLs using their required coordinate ordering', () => {
    expect(getTileRequestUrl('esri-clarity', '16/12/34')).toContain('/16/34/12');
    expect(getTileRequestUrl('terrain-dem', '16/12/34')).toContain('/16/12/34.png');
    expect(getTileRequestUrl('fallback-esri-clarity', '12/12/34')).toContain('/12/34/12');
    expect(getTileRequestUrl('slope', '16/12/34')).toBeNull();
    const mapboxTemplate = 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=test';
    expect(getTileRequestUrl('fallback-mapbox-streets', '12/34/56', mapboxTemplate))
      .toBe('https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/12/34/56@2x?access_token=test');
  });

  it('prioritizes fallback imagery before detail and terrain tiles', () => {
    expect(getTilePriority('fallback-esri-clarity')).toBeLessThan(getTilePriority('esri-clarity'));
    expect(getTilePriority('esri-clarity')).toBeLessThan(getTilePriority('terrain-dem'));
  });

  it('preloads tiles in CORS mode so MapLibre can reuse the cached response', async () => {
    let requestedCrossOrigin: string | null = null;

    class FakeImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_url: string) {
        requestedCrossOrigin = this.crossOrigin;
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', FakeImage);

    await preloadTileImage('https://tiles.example.test/terrain.png');

    expect(requestedCrossOrigin).toBe('anonymous');
    vi.unstubAllGlobals();
  });

  it('retries a transient tile failure once', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    class FakeImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) {
        attempts++;
        if (attempts === 1) this.onerror?.();
        else this.onload?.();
      }
    }
    vi.stubGlobal('Image', FakeImage);
    try {
      const result = preloadTileImage('https://tiles.example.test/tile.png');
      await vi.advanceTimersByTimeAsync(500);
      await result;
      expect(attempts).toBe(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('retries a stalled image instead of occupying a preload slot indefinitely', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    class FakeImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        if (!url) return;
        attempts++;
        if (attempts === 2) this.onload?.();
      }
    }
    vi.stubGlobal('Image', FakeImage);
    try {
      const result = preloadTileImage('https://tiles.example.test/tile.png');
      await vi.advanceTimersByTimeAsync(5500);
      await result;
      expect(attempts).toBe(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
