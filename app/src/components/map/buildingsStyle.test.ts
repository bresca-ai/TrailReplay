import { describe, expect, it } from 'vitest';
import { MAP_STYLE } from './mapStyle';
import { buildingImageryZoom } from './satelliteRoofs';
import { createDefaultSettings } from '@/store/defaults';

describe('3D buildings', () => {
  it('uses fewer imagery tiles for distant buildings and detailed tiles close up', () => {
    expect(buildingImageryZoom(13.7)).toBe(13);
    expect(buildingImageryZoom(15.4)).toBe(15);
    expect(buildingImageryZoom(18)).toBe(16);
  });

  it('is opt-in and uses the OpenFreeMap building vector source', () => {
    expect(createDefaultSettings().show3DBuildings).toBe(false);
    expect(MAP_STYLE.sources['buildings-vector'].url).toBe('https://tiles.openfreemap.org/planet');
    const building = MAP_STYLE.layers.find((layer) => layer.id === 'buildings-3d');
    expect(building).toMatchObject({ type: 'fill-extrusion', source: 'buildings-vector', 'source-layer': 'building', layout: { visibility: 'none' } });
    const ids = MAP_STYLE.layers.map((layer) => layer.id);
    expect(ids.indexOf('buildings-3d')).toBeGreaterThan(ids.indexOf('mapbox-streets'));
    expect(ids.indexOf('buildings-3d')).toBeLessThan(ids.indexOf('carto-labels'));
  });
});
