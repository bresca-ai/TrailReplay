import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { createTrimTestTrack } from '@/test/fixtures/trimTrack';
import { useAppStore } from '@/store/useAppStore';
import { buildTrackTrimPreviewData, useTrackTrimPreview } from './useTrackTrimPreview';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('trim map overlay', () => {
  it('draws the original route, continuous selection and exact endpoint markers', () => {
    const track = createTrimTestTrack();
    const data = buildTrackTrimPreviewData(track, { trackId: track.id, startIndex: 1, endIndex: 4 });
    expect(data.features.map((feature) => feature.properties?.part)).toEqual(['original', 'selected', 'start', 'end']);
    expect(data.features[1].geometry.coordinates).toEqual(track.points.slice(1, 5).map((point) => [point.lon, point.lat]));
    expect(data.features[2].geometry.coordinates).toEqual([track.points[1].lon, track.points[1].lat]);
    expect(data.features[3].geometry.coordinates).toEqual([track.points[4].lon, track.points[4].lat]);
  });

  it('updates GeoJSON during selection and removes all preview layers when cancelled', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const layers = new Set<string>();
    const source = { setData: vi.fn() };
    let hasSource = false;
    const map = {
      addSource: vi.fn(() => { hasSource = true; }),
      addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
      getLayer: (id: string) => layers.has(id),
      getSource: () => hasSource ? source : undefined,
      removeLayer: vi.fn((id: string) => layers.delete(id)),
      removeSource: vi.fn(() => { hasSource = false; }),
    };
    const track = createTrimTestTrack();
    useAppStore.getState().reset();
    useAppStore.getState().addTrack(track);
    const mapRef = { current: map as unknown as Map };
    renderHook(() => useTrackTrimPreview(mapRef, true));
    act(() => useAppStore.getState().setTrackTrimPreview({ trackId: track.id, startIndex: 1, endIndex: 4 }));
    act(() => { frames.splice(0).forEach((callback) => callback(0)); });
    expect(map.addSource).toHaveBeenCalledOnce();
    expect(map.addLayer).toHaveBeenCalledTimes(4);
    expect(source.setData.mock.lastCall?.[0].features[1].geometry.coordinates).toHaveLength(4);
    act(() => useAppStore.getState().setTrackTrimPreview({ trackId: track.id, startIndex: 2, endIndex: 3 }));
    act(() => { frames.splice(0).forEach((callback) => callback(0)); });
    expect(source.setData.mock.lastCall?.[0].features[1].geometry.coordinates).toHaveLength(2);
    expect(map.addSource).toHaveBeenCalledOnce();
    act(() => useAppStore.getState().setTrackTrimPreview(null));
    expect(map.removeLayer).toHaveBeenCalledTimes(4);
    expect(map.removeSource).toHaveBeenCalledOnce();
    expect(layers.size).toBe(0);
  });
});
