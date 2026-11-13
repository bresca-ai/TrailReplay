import { describe, expect, it, vi } from 'vitest';
import { applyBasemapVisibility } from './basemapVisibility';
import { createDefaultSettings } from '@/store/defaults';
import { BASEMAP_PRESENTATIONS } from './mapStyle';

function mapWithStaleSatellite() {
  const visibility = new Map([['background', 'visible'], ['fallback-satellite', 'visible'], ['esri-clarity', 'none'], ['fallback-esri-clarity', 'none']]);
  const map = {
    getLayer: (id: string) => visibility.has(id) ? {} : undefined,
    getLayoutProperty: (id: string) => visibility.get(id),
    setLayoutProperty: vi.fn((id: string, _property: string, value: string) => { visibility.set(id, value); }),
  };
  return { map: map as unknown as Parameters<typeof applyBasemapVisibility>[0], visibility };
}

describe('basemap visibility', () => {
  it('restores the selected style when stale satellite layers are visible', () => {
    const { map, visibility } = mapWithStaleSatellite();
    applyBasemapVisibility(map, 'esri-clarity');
    expect(visibility.get('background')).toBe('none');
    expect(visibility.get('fallback-satellite')).toBe('none');
    expect(visibility.get('esri-clarity')).toBe('visible');
    expect(visibility.get('fallback-esri-clarity')).toBe('visible');
  });

  it('uses the build default for unavailable saved providers', () => {
    const { map, visibility } = mapWithStaleSatellite();
    applyBasemapVisibility(map, 'unavailable-provider');
    const expected = BASEMAP_PRESENTATIONS[createDefaultSettings().mapStyle];
    expect(visibility.get(expected.layerId)).toBe('visible');
    expect(visibility.get(expected.fallbackLayerId)).toBe('visible');
  });
});
