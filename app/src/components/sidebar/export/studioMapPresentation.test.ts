import { describe, expect, it, vi } from 'vitest';
import { applyStudioMapPresentation } from './studioMapPresentation';

function createMap() {
  const paint = new Map([
    ['background:raster-fade-duration', 250],
    ['fallback-satellite:raster-fade-duration', 0],
  ]);
  return {
    getStyle: () => ({
      layers: [
        { id: 'background', type: 'raster' },
        { id: 'fallback-satellite', type: 'raster' },
        { id: 'route', type: 'line' },
      ],
    }),
    getPaintProperty: vi.fn((layerId: string, property: string) => paint.get(`${layerId}:${property}`)),
    setPaintProperty: vi.fn((layerId: string, property: string, value: unknown) => {
      paint.set(`${layerId}:${property}`, value as number);
    }),
  } as unknown as Parameters<typeof applyStudioMapPresentation>[0] & {
    setPaintProperty: ReturnType<typeof vi.fn>;
  };
}

describe('applyStudioMapPresentation', () => {
  it('disables raster fading while preserving non-raster layers', () => {
    const map = createMap();

    applyStudioMapPresentation(map);

    expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'raster-fade-duration', 0);
    expect(map.setPaintProperty).not.toHaveBeenCalledWith('route', 'raster-fade-duration', 0);
  });

  it('restores raster fades after export', () => {
    const map = createMap();
    const restore = applyStudioMapPresentation(map);

    restore();

    expect(map.setPaintProperty).toHaveBeenLastCalledWith(
      'background',
      'raster-fade-duration',
      250,
    );
  });

});
