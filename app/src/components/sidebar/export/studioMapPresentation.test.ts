import { describe, expect, it, vi } from 'vitest';
import { applyStudioMapPresentation } from './studioMapPresentation';
import { withStudioForegroundDetail } from './studioTileDetail';

function createMap() {
  const paint = new Map([['background:raster-fade-duration', 250]]);
  const original = () => 10;
  const source = { calculateTileZoom: original };
  const map = {
    getSource: vi.fn((id: string) => id === 'esri-clarity' ? source : undefined),
    setSourceTileLodParams: vi.fn(() => { source.calculateTileZoom = original; }),
    getCanvas: () => ({ clientWidth: 1000, clientHeight: 800 }),
    getPixelRatio: () => 1,
    setPixelRatio: vi.fn(),
    getStyle: () => ({ layers: [{ id: 'background', type: 'raster' }, { id: 'route', type: 'line' }] }),
    getPaintProperty: vi.fn((id: string, property: string) => paint.get(`${id}:${property}`)),
    setPaintProperty: vi.fn((id: string, property: string, value: number) => { paint.set(`${id}:${property}`, value); }),
  };
  return { map: map as unknown as Parameters<typeof applyStudioMapPresentation>[0], source, original, calls: map };
}

describe('studio map presentation', () => {
  it('improves foreground detail and export canvas resolution, then restores the map', () => {
    const { map, source, original, calls } = createMap();
    const restore = applyStudioMapPresentation(map, { highDetail: true, mapStyle: 'esri-clarity', resolution: { width: 1080, height: 1920 } });
    expect(source.calculateTileZoom).not.toBe(original);
    expect(calls.setPixelRatio).toHaveBeenCalledWith(2.4);
    expect(calls.setPaintProperty).toHaveBeenCalledWith('background', 'raster-fade-duration', 0);
    restore();
    expect(source.calculateTileZoom).toBe(original);
    expect(calls.setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(calls.setPaintProperty).toHaveBeenLastCalledWith('background', 'raster-fade-duration', 250);
  });

  it('does not change tile detail or resolution for ordinary exports', () => {
    const { map, source, original, calls } = createMap();
    applyStudioMapPresentation(map, { mapStyle: 'esri-clarity' });
    expect(source.calculateTileZoom).toBe(original);
    expect(calls.setPixelRatio).not.toHaveBeenCalled();
    expect(calls.setSourceTileLodParams).not.toHaveBeenCalled();
  });

  it('adds detail near the camera target but not to distant horizon tiles', () => {
    const zoom = withStudioForegroundDetail(() => 10);
    expect(zoom(15, 0, 100, 100, 45)).toBe(11);
    expect(zoom(15, 1000, 100, 100, 45)).toBe(10);
  });
});
