import { renderHook } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { expect, it, vi } from 'vitest';
import { parseGPX } from '@/utils/gpxParser';
import { useComparisonTrackLayers } from './useComparisonTrackLayers';

it('keeps comparison dots the same 21px viewport size as the primary dot in both modes, including tilted cameras', () => {
  const track = parseGPX('<gpx><trk><trkseg><trkpt lat="42" lon="1"><time>2026-10-25T10:00:00Z</time></trkpt><trkpt lat="42.01" lon="1.01"><time>2026-10-25T10:30:00Z</time></trkpt></trkseg></trk></gpx>', 'rider.gpx');
  const layers = new Map<string, { id: string; paint?: Record<string, unknown> }>();
  const source = { setData: vi.fn() };
  const map = { addSource: vi.fn(), addLayer: (layer: { id: string; paint?: Record<string, unknown> }) => layers.set(layer.id, layer), getLayer: (id: string) => layers.get(id), getSource: () => source, removeLayer: vi.fn(), removeSource: vi.fn(), setLayoutProperty: vi.fn() };
  const params = { comparisonTracks: [{ id: 'b', offset: 0, name: 'B', color: '#ef4444', track, visible: true }], isMapLoaded: true, mapRef: { current: map as unknown as MapLibreMap }, currentTime: new Date('2026-10-25T10:15:00Z'), comparisonMode: 'time' as 'time' | 'route', comparisonThresholdMeters: 30, primaryTrack: track, primaryDistance: 0, sharedTrackIds: [] };
  const { rerender } = renderHook((value) => useComparisonTrackLayers(value), { initialProps: params });
  for (const mode of ['time', 'route'] as const) {
    rerender({ ...params, comparisonMode: mode });
    const paint = layers.get('comparison-position-glow-b')!.paint!;
    expect((Number(paint['circle-radius']) + Number(paint['circle-stroke-width'])) * 2).toBe(21);
    expect(paint['circle-pitch-scale']).toBe('viewport');
    expect(paint['circle-pitch-alignment']).toBe('viewport');
  }
});
