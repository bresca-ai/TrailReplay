import { describe, expect, it } from 'vitest';
import { constrainOverlayToFrame, getCropPreviewMetrics, getCropRegion, getExportFrameFitPadding, getVideoCropRegion, getVideoCropPreviewMetrics } from './crop';

describe('crop utils', () => {
  it('uses the available portrait frame for phone video', () => {
    const preview = getVideoCropPreviewMetrics(390, 700, '9:16');
    const output = getVideoCropRegion({ width: 390, height: 700 }, 9, 16);
    expect(preview.frameWidth).toBeCloseTo(390);
    expect(preview.frameHeight).toBeCloseTo(390 * 16 / 9);
    expect(output.cropW).toBeCloseTo(preview.frameWidth);
    expect(output.cropH).toBeCloseTo(preview.frameHeight);
  });

  it('keeps saved stats positions inside the selected video crop', () => {
    const frame = getVideoCropPreviewMetrics(960, 664, '1:1');
    expect(constrainOverlayToFrame({ x: 0, y: 0 }, { width: 960, height: 664 }, frame, { width: 100, height: 50 }))
      .toEqual({ left: frame.frameLeft, top: frame.frameTop });
    expect(constrainOverlayToFrame({ x: 1, y: 1 }, { width: 960, height: 664 }, frame, { width: 100, height: 50 }))
      .toEqual({ left: frame.frameLeft + frame.frameWidth - 100, top: frame.frameTop + frame.frameHeight - 50 });
  });
  it('adds top and bottom bars when the export is wider than the container', () => {
    const metrics = getCropPreviewMetrics(1200, 800, '16:9');

    expect(metrics.top).toBeGreaterThan(0);
    expect(metrics.bottom).toBe(metrics.top);
    expect(metrics.left).toBe(0);
    expect(metrics.frameHeight).toBeLessThan(800);
  });

  it('adds left and right bars when the export is narrower than the container', () => {
    const region = getCropRegion({ width: 1200, height: 800 }, 1080, 1920);

    expect(region.cropX).toBeGreaterThan(0);
    expect(region.cropY).toBe(0);
    expect(region.cropW).toBeLessThan(1200);
    expect(region.cropH).toBe(800);
  });

  it.each([
    [1200, 800, '9:16', 9 / 16],
    [1200, 800, '4:5', 4 / 5],
    [1200, 800, '1:1', 1],
    [390, 700, '9:16', 9 / 16],
    [390, 700, '16:9', 16 / 9],
    [1000, 400, '16:9', 16 / 9],
  ] as const)('maximizes the %s × %s viewport for %s in preview and recording', (width, height, ratio, aspect) => {
    const preview = getVideoCropPreviewMetrics(width, height, ratio);
    const output = getVideoCropRegion({ width, height }, aspect, 1);
    const expectedWidth = Math.min(width, height * aspect);
    const expectedHeight = expectedWidth / aspect;
    expect(preview.frameWidth).toBeCloseTo(expectedWidth);
    expect(preview.frameHeight).toBeCloseTo(expectedHeight);
    expect(preview.frameLeft).toBeCloseTo((width - expectedWidth) / 2);
    expect(preview.frameTop).toBeCloseTo((height - expectedHeight) / 2);
    expect(output.cropX).toBeCloseTo(preview.frameLeft);
    expect(output.cropY).toBeCloseTo(preview.frameTop);
    expect(output.cropW).toBeCloseTo(preview.frameWidth);
    expect(output.cropH).toBeCloseTo(preview.frameHeight);
  });

  it('reserves the cropped bars when fitting a portrait export', () => {
    const frame = getCropPreviewMetrics(1200, 800, '9:16');

    expect(getExportFrameFitPadding(frame)).toEqual({
      top: 24,
      right: 399,
      bottom: 24,
      left: 399,
    });
  });

  it('reserves the cropped bars when fitting a landscape export', () => {
    const frame = getCropPreviewMetrics(800, 1200, '16:9');
    const padding = getExportFrameFitPadding(frame);

    expect(padding.left).toBe(24);
    expect(padding.right).toBe(24);
    expect(padding.top).toBeCloseTo(399);
    expect(padding.bottom).toBeCloseTo(399);
  });

  it('uses a proportional safe margin around a square export', () => {
    const frame = getCropPreviewMetrics(1200, 800, '1:1');

    expect(getExportFrameFitPadding(frame)).toEqual({
      top: 40,
      right: 240,
      bottom: 40,
      left: 240,
    });
  });
});
