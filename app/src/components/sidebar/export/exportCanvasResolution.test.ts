import { describe, expect, it, vi } from 'vitest';
import { setExportCanvasResolution } from './exportCanvasResolution';

function makeMap(width: number, height: number, maxRatio = Infinity) {
  const canvas = { clientWidth: width, clientHeight: height, width: width * 2, height: height * 2 };
  const setPixelRatio = vi.fn((ratio: number) => {
    const actual = Math.min(ratio, maxRatio);
    canvas.width = Math.round(width * actual);
    canvas.height = Math.round(height * actual);
  });
  return { canvas, setPixelRatio, map: { getCanvas: () => canvas, getPixelRatio: () => 2, setPixelRatio } as unknown as Parameters<typeof setExportCanvasResolution>[0] };
}

describe('export canvas resolution', () => {
  it.each([[600, 400], [1200, 800]])('renders the 4K portrait crop at native resolution with a %sx%s preview', (width, height) => {
    const { canvas, map, setPixelRatio } = makeMap(width, height);
    const restore = setExportCanvasResolution(map, { width: 3072, height: 3840 });
    expect(canvas.height).toBeGreaterThanOrEqual(3840);
    expect(canvas.width / width * (height * 0.8)).toBeGreaterThanOrEqual(3071);
    restore();
    expect(setPixelRatio).toHaveBeenLastCalledWith(2);
  });
  it('rejects and restores a device whose canvas cannot reach the selected resolution', () => {
    const { map, setPixelRatio } = makeMap(600, 400, 3);
    expect(() => setExportCanvasResolution(map, { width: 3072, height: 3840 })).toThrow('cannot render the selected video resolution');
    expect(setPixelRatio).toHaveBeenLastCalledWith(2);
  });
});
