import { describe, expect, it } from 'vitest';
import { lastPaintedCoordinate, newestPaintedTrailTip, withPaintedTrailTip, type CompletedTrailData } from './paintedTrailTip';

const line: CompletedTrailData = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { color: 'red' }, geometry: { type: 'LineString', coordinates: [[1, 41], [1.1, 41.1]] } },
    { type: 'Feature', properties: { color: 'blue' }, geometry: { type: 'LineString', coordinates: [[1.1, 41.1], [1.123456789, 41.123456789]] } },
  ],
};

describe('painted trail tip', () => {
  it('sends the marker and the last colored segment through the same source update', () => {
    const data = withPaintedTrailTip(line, 4);
    expect(lastPaintedCoordinate(line)).toEqual([1.123456789, 41.123456789]);
    expect(data.features.slice(0, -1)).toEqual(line.features);
    expect(data.features.at(-1)?.geometry).toEqual({ type: 'Point', coordinates: [1.123456789, 41.123456789] });
    expect(newestPaintedTrailTip(data.features, 0)).toEqual({ revision: 4, position: [1.123456789, 41.123456789] });
    expect(line.features).toHaveLength(2);
  });

  it('does not move back to stale tiles when old and new tiles overlap', () => {
    const old = withPaintedTrailTip(line, 2).features.at(-1)!;
    const recent = withPaintedTrailTip(line, 5).features.at(-1)!;
    expect(newestPaintedTrailTip([recent, old, old], 4)?.revision).toBe(5);
    expect(newestPaintedTrailTip([old], 4)).toBeNull();
    // The same rendered frame must remain available for terrain reprojection.
    expect(newestPaintedTrailTip([recent], 5)?.revision).toBe(5);
  });

  it('retains the original coordinate instead of quantized tile geometry', () => {
    const tip = withPaintedTrailTip(line, 6).features.at(-1)!;
    tip.geometry.coordinates = [1.12, 41.12];
    expect(newestPaintedTrailTip([tip], 6)?.position).toEqual([1.123456789, 41.123456789]);
  });

  it('does not invent a tip for an empty line or accept invalid rendered properties', () => {
    expect(withPaintedTrailTip({ type: 'FeatureCollection', features: [] }, 1).features).toEqual([]);
    expect(newestPaintedTrailTip([{ properties: null }, { properties: { kind: 'playback-tip', revision: 1, lon: NaN, lat: 41 } }], 0)).toBeNull();
  });

  it('keeps the start marker when a color mode has no line segment yet', () => {
    const data = withPaintedTrailTip({ type: 'FeatureCollection', features: [] }, 1, [1, 41]);
    expect(newestPaintedTrailTip(data.features, 0)?.position).toEqual([1, 41]);
  });
});
