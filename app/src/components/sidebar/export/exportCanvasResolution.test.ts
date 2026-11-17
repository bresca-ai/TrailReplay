import { describe, expect, it, vi } from 'vitest';
import { assertExportCanvasUsable, assertRecordingCanvasResolution, setExportCanvasResolution } from './exportCanvasResolution';

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
  it('rejects a landscape recording canvas when portrait output was selected', () => {
    const canvas = { width: 1920, height: 1080 } as HTMLCanvasElement;
    expect(() => assertRecordingCanvasResolution(canvas, { width: 810, height: 1440 })).toThrow('expected 810×1440, got 1920×1080');
    expect(() => assertRecordingCanvasResolution(canvas, { width: 1920, height: 1080 })).not.toThrow();
  });
  it.each([[600, 400], [1200, 800]])('renders the 4K portrait crop at native resolution with a %sx%s preview', (width, height) => {
    const { canvas, map, setPixelRatio } = makeMap(width, height);
    const restore = setExportCanvasResolution(map, { width: 3072, height: 3840 });
    expect(canvas.height).toBeGreaterThanOrEqual(3840);
    expect(canvas.width / width * (height * 0.8)).toBeGreaterThanOrEqual(3071);
    restore();
    expect(setPixelRatio).toHaveBeenLastCalledWith(2);
  });
  it('keeps a clamped mobile canvas usable and restores the original ratio', () => {
    const { canvas, map, setPixelRatio } = makeMap(320, 2132, 8192 / 2132);
    const resolution = { width: 1280, height: 720 };
    const restore = setExportCanvasResolution(map, resolution);
    expect(canvas.height).toBeLessThanOrEqual(8192);
    expect(canvas.width).toBeLessThan(resolution.width);
    expect(() => assertExportCanvasUsable(map, resolution)).not.toThrow();
    restore();
    expect(setPixelRatio).toHaveBeenLastCalledWith(2);
  });
  it('rejects an unusable backing buffer and restores the original ratio', () => {
    const { map, setPixelRatio } = makeMap(600, 400, 0);
    expect(() => setExportCanvasResolution(map, { width: 1280, height: 720 })).toThrow('valid size');
    expect(setPixelRatio).toHaveBeenLastCalledWith(2);
  });
  it('detects a backing buffer lost during capture', () => {
    const { canvas, map } = makeMap(600, 400);
    canvas.width = 0;
    expect(() => assertExportCanvasUsable(map, { width: 1280, height: 720 })).toThrow('valid size');
  });
});
