import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { useRecordedElevationLayer } from './useRecordedElevationLayer';

describe('recorded elevation prototype', () => {
  it('installs a 3D layer, uploads altitude-bearing vertices, and restores ground layers on exit', () => {
    let layer: maplibregl.CustomLayerInterface | undefined;
    const map = {
      getLayer: vi.fn((id: string) => id === 'recorded-elevation-prototype' ? layer : {}),
      setLayoutProperty: vi.fn(),
      addLayer: vi.fn((value: maplibregl.CustomLayerInterface) => { layer = value; }),
      removeLayer: vi.fn(), triggerRepaint: vi.fn(),
    };
    const points = [{ lon: 1, lat: 42, elevation: 1000 }, { lon: 1.01, lat: 42.01, elevation: 2000 }];
    const { unmount } = renderHook(() => useRecordedElevationLayer({ current: map as unknown as maplibregl.Map }, true, true, points, points[0], 1, { current: null }));
    expect(layer?.renderingMode).toBe('3d');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('trail-line', 'visibility', 'none');
    const bufferData = vi.fn();
    const gl = {
      createShader: () => ({}), shaderSource: vi.fn(), compileShader: vi.fn(), getShaderParameter: () => true,
      createProgram: () => ({}), attachShader: vi.fn(), linkProgram: vi.fn(), getProgramParameter: () => true,
      createBuffer: () => ({}), bindBuffer: vi.fn(), bufferData,
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, STATIC_DRAW: 4,
    } as unknown as WebGL2RenderingContext;
    layer!.onAdd!(map as unknown as maplibregl.Map, gl);
    const vertices = bufferData.mock.calls[0][1] as Float32Array;
    expect(vertices[2]).toBe(0);
    expect(vertices[5]).toBeGreaterThan(0);
    unmount();
    expect(map.removeLayer).toHaveBeenCalledWith('recorded-elevation-prototype');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('trail-line', 'visibility', 'visible');
  });
});
