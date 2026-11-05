import { describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { prepareBuildingFrame, setBuildingFrameController } from './buildingFrameReadiness';

describe('building export readiness', () => {
  it('waits for the textured layer and its imagery before capturing', () => {
    const map = { getLayer: vi.fn(() => undefined) } as unknown as Map;
    expect(prepareBuildingFrame(map, true)).toBe(false);
    let loaded = false;
    const prepare = vi.fn();
    setBuildingFrameController(map, { prepare, isReady: () => loaded });
    expect(prepareBuildingFrame(map, true)).toBe(false);
    loaded = true;
    expect(prepareBuildingFrame(map, true)).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(2);
    setBuildingFrameController(map, null);
    expect(prepareBuildingFrame(map, true)).toBe(false);
  });

  it('does not require the texture layer on non-satellite maps', () => {
    const map = { getLayer: vi.fn(() => undefined) } as unknown as Map;
    expect(prepareBuildingFrame(map)).toBe(true);
  });
});
