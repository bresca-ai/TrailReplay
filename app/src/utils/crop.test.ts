import { describe, expect, it } from 'vitest';
import { getCropPreviewMetrics, getCropRegion, getExportFrameFitPadding } from './crop';

describe('crop utils', () => {
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
