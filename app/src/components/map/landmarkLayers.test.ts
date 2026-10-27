import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  LANDMARK_SOURCE_ID,
  landmarkIconLayer,
  landmarkEmojiLayer,
  landmarkLabelLayer,
} from './landmarkLayers';

/**
 * MapLibre rejects an invalid layer at addLayer time, which shows up as
 * landmarks silently missing from the map rather than as a test failure — so
 * the real style-spec validator runs over the layers here.
 */
function validate(layers: unknown[]) {
  return validateStyleMin({
    version: 8,
    sources: { [LANDMARK_SOURCE_ID]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('landmark layers', () => {
  it('produces a valid icon layer at every landmark size', () => {
    expect(validate([landmarkIconLayer(1)])).toEqual([]);
    expect(validate([landmarkIconLayer(1.8)])).toEqual([]);
    expect(validate([landmarkIconLayer(0.7)])).toEqual([]);
    expect(validate([landmarkEmojiLayer(1)])).toEqual([]);
  });

  it('produces a valid label layer at every label size and fade setting', () => {
    expect(validate([landmarkLabelLayer(1, true)])).toEqual([]);
    expect(validate([landmarkLabelLayer(1.8, false)])).toEqual([]);
    expect(validate([landmarkLabelLayer(0.7, true)])).toEqual([]);
  });

  it('catches a zoom curve nested inside another expression', () => {
    const broken = landmarkIconLayer(1);
    // The shape that shipped once and blanked every icon.
    (broken.layout as Record<string, unknown>)['icon-size'] = [
      '*', 1.35, ['interpolate', ['linear'], ['zoom'], 7, 0.52, 15, 0.92],
    ];

    expect(validate([broken]).length).toBeGreaterThan(0);
  });

  it('draws every icon rather than dropping colliding ones', () => {
    const layout = landmarkIconLayer(1).layout as Record<string, unknown>;
    expect(layout['icon-allow-overlap']).toBe(true);
  });
});
