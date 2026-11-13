import { describe, expect, it } from 'vitest';
// Exercise the installed renderer's tile cover, not a mock tile-count formula.
// These engine internals are used only by this regression test.
import { createMercatorTransform } from '../../../node_modules/maplibre-gl/src/geo/projection/mercator_transform.ts';
import { LngLat } from '../../../node_modules/maplibre-gl/src/geo/lng_lat.ts';
import { coveringTiles, createCalculateTileZoomFunction } from '../../../node_modules/maplibre-gl/src/geo/projection/covering_tiles.ts';
import { applyConsistentBasemapTileLod } from './basemapTileLod';
import { withStudioForegroundDetail } from '../sidebar/export/studioTileDetail';

describe('cinematic imagery tile coverage', () => {
  it.each([75, 85])('bounds tile demand and retains foreground detail at %s degrees', (pitch) => {
    const transform = createMercatorTransform({
      minZoom: 0, maxZoom: 22, minPitch: 0, maxPitch: 85, renderWorldCopies: true,
    });
    transform.resize(1920, 1080);
    transform.setCenter(new LngLat(1.83, 41.58));
    transform.setZoom(15.3);
    transform.setPitch(pitch);
    transform.setBearing(320.84);
    const source = {};
    const map = {
      getSource: (id) => id === 'satellite' ? source : undefined,
      setSourceTileLodParams: (levels, ratio) => {
        source.calculateTileZoom = createCalculateTileZoomFunction(levels, ratio);
      },
    };
    applyConsistentBasemapTileLod(map, 'satellite');
    const cover = (calculateTileZoom) => coveringTiles(transform, {
      tileSize: 256, minzoom: 0, maxzoom: 19, calculateTileZoom,
    });
    const unbounded = cover((zoom) => Math.floor(zoom));
    const bounded = cover(source.calculateTileZoom);
    const studio = cover(withStudioForegroundDetail(source.calculateTileZoom));
    // Detail is concentrated near the camera; the horizon keeps the original
    // budget instead of becoming an unbounded full-resolution tile cover.
    expect(studio.length).toBeGreaterThan(bounded.length);
    expect(studio.length).toBeLessThan(unbounded.length / 2);
    expect(Math.max(...studio.map(tile => tile.canonical.z))).toBeGreaterThan(Math.max(...bounded.map(tile => tile.canonical.z)));
    expect(bounded.length).toBeLessThan(200);
    expect(bounded.length).toBeLessThan(unbounded.length / 3);
    expect(Math.max(...bounded.map((tile) => tile.canonical.z))).toBeGreaterThanOrEqual(15);
  });
});
