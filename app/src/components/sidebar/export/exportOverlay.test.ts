import { describe, expect, it } from 'vitest';
import {
  getCapturedCanvasDrawSize,
  getElevationOverlayDrawRect,
  getExportOverlayMetrics,
  getExportedOverlayFontSize,
  getOverlayRefreshIntervalMs,
  getPopupOverlayDrawRect,
  getStatsOverlayDrawRect,
  getStatsValueTimelineBucket,
  isDrawableRect,
} from './exportOverlay';

describe('exportOverlay', () => {
  it('caps overlay refresh cadence below the video frame rate', () => {
    expect(getOverlayRefreshIntervalMs(30)).toBe(83);
    expect(getOverlayRefreshIntervalMs(24)).toBe(83);
    expect(getOverlayRefreshIntervalMs(12)).toBe(83);
    expect(getOverlayRefreshIntervalMs(6)).toBe(167);
  });

  it('paces native stat updates by encoded video time rather than wall-clock time', () => {
    expect(getStatsValueTimelineBucket(0)).toBe(0);
    expect(getStatsValueTimelineBucket(99)).toBe(0);
    expect(getStatsValueTimelineBucket(100)).toBe(1);
    expect(getStatsValueTimelineBucket(1_050)).toBe(10);
  });

  it('derives crop metrics and overlay scaling from the exported frame', () => {
    const metrics = getExportOverlayMetrics({ width: 1200, height: 800 }, 1080, 1920);

    expect(metrics.cropX).toBeGreaterThan(0);
    expect(metrics.cropY).toBe(0);
    expect(metrics.cropW).toBeLessThan(1200);
    expect(metrics.scaleToRecording).toBeGreaterThan(1);
  });

  it('keeps elevation overlay centered and inside the exported frame', () => {
    const rect = getElevationOverlayDrawRect({
      captureCanvas: { width: 800, height: 60 },
      scaleToRecording: 1.5,
      recordW: 1080,
      recordH: 1920,
      margin: 27,
    });

    expect(rect.drawWidth).toBeLessThanOrEqual(1080 * 0.85);
    expect(rect.drawX).toBeGreaterThanOrEqual(0);
    expect(rect.drawY + rect.drawHeight).toBe(1920 - 27);
  });

  it('centers the stats overlay for portrait exports without an arbitrary width cap', () => {
    const rect = getStatsOverlayDrawRect({
      captureCanvas: { width: 920, height: 220 },
      scaleToRecording: 1,
      recordW: 1080,
      recordH: 1920,
      margin: 27,
    });

    expect(rect.drawWidth).toBe(920);
    expect(rect.drawX).toBeCloseTo((1080 - rect.drawWidth) / 2);
    expect(rect.drawY).toBe(27);
  });

  it('honors the user-selected stats scale in exported frames', () => {
    const normal = getStatsOverlayDrawRect({
      captureCanvas: { width: 300, height: 100 },
      scaleToRecording: 1,
      recordW: 1920,
      recordH: 1080,
      margin: 48,
      sizeScale: 1,
    });
    const large = getStatsOverlayDrawRect({
      captureCanvas: { width: 300, height: 100 },
      scaleToRecording: 1,
      recordW: 1920,
      recordH: 1080,
      margin: 48,
      sizeScale: 1.5,
    });

    expect(large.drawWidth).toBeCloseTo(normal.drawWidth * 1.5);
    expect(large.drawHeight).toBeCloseTo(normal.drawHeight * 1.5);
  });

  it('centers the stats overlay in landscape exports', () => {
    const rect = getStatsOverlayDrawRect({
      captureCanvas: { width: 520, height: 120 },
      scaleToRecording: 1,
      recordW: 1920,
      recordH: 1080,
      margin: 48,
    });

    expect(rect.drawX).toBe(700);
    expect(rect.drawY).toBe(48);
    expect(rect.drawWidth).toBe(520);
  });

  it('maps popup coordinates into the cropped export frame', () => {
    const rect = getPopupOverlayDrawRect({
      popupRect: { left: 240, top: 120, width: 320, height: 180 },
      containerRect: { left: 100, top: 50, width: 1200, height: 800 },
      cropX: 150,
      cropY: 0,
      scaleToRecording: 1.5,
    });

    expect(rect.drawX).toBeCloseTo(-15);
    expect(rect.drawY).toBeCloseTo(105);
    expect(rect.drawWidth).toBe(480);
    expect(rect.drawHeight).toBe(270);
    expect(isDrawableRect(rect)).toBe(true);
  });

  it('scales captured html2canvas output back to recording pixels', () => {
    const size = getCapturedCanvasDrawSize({ width: 600, height: 150 }, 1.8, 2);

    expect(size.drawWidth).toBe(540);
    expect(size.drawHeight).toBe(135);
  });

  it('scales redrawn stat values by the same intrinsic ratio as captured labels', () => {
    // A 4x preview transform makes the element visually 400px tall, but its
    // intrinsic DOM layout remains 100px. Drawing it at 800px must make a
    // 12px value 96px, exactly as it does for the captured label bitmap.
    expect(getExportedOverlayFontSize(12, 100, 800)).toBe(96);
  });
});
