import { describe, expect, it } from 'vitest';
import { getResolution, getVideoBitrate, normalizeVideoExportResolution } from './exportConfig';
import { createDefaultVideoExportSettings } from '@/store/defaults';

describe('getVideoBitrate', () => {
  it('allocates Studio bitrate for detailed 1080p and 4K map exports', () => {
    expect(getVideoBitrate({
      width: 1920,
      height: 1080,
      fps: 30,
      qualityMode: 'studio',
    })).toBe(15_000_000);
    expect(getVideoBitrate({
      width: 3840,
      height: 2160,
      fps: 30,
      qualityMode: 'studio',
    })).toBe(59_500_000);
  });

  it('scales with frame rate and actual output dimensions', () => {
    const base = getVideoBitrate({
      width: 1920,
      height: 1080,
      fps: 30,
      qualityMode: 'studio',
    });
    const sixtyFps = getVideoBitrate({
      width: 1920,
      height: 1080,
      fps: 60,
      qualityMode: 'studio',
    });
    const square = getVideoBitrate({
      width: 1080,
      height: 1080,
      fps: 30,
      qualityMode: 'studio',
    });

    expect(sixtyFps).toBe(base * 2);
    expect(square).toBeLessThan(base);
  });

  it('keeps Standard near the existing 1080p30 bitrate', () => {
    expect(getVideoBitrate({
      width: 1920,
      height: 1080,
      fps: 30,
      qualityMode: 'standard',
    })).toBe(5_000_000);
  });
});

it('fits every preset and aspect ratio within the same landscape pixel frame', () => {
  const landscape = { low: [1280, 720], medium: [1920, 1080], high: [2560, 1440], ultra: [3840, 2160] } as const;
  for (const quality of ['low', 'medium', 'high', 'ultra'] as const) {
    const [width, height] = landscape[quality];
    expect(getResolution(quality, '16:9')).toEqual({ width, height });
    for (const [ratio, aspect] of [['1:1', 1], ['4:5', 4 / 5], ['9:16', 9 / 16]] as const) {
      const result = getResolution(quality, ratio);
      expect(result.height).toBe(height);
      expect(result.width).toBeLessThanOrEqual(width);
      expect(result.width % 2).toBe(0);
      expect(Math.abs(result.width / result.height - aspect)).toBeLessThan(0.002);
    }
  }
  expect(getResolution('ultra', '4:5')).toEqual({ width: 1728, height: 2160 });
  expect(getResolution('ultra', '9:16')).toEqual({ width: 1216, height: 2160 });
});

it('upgrades saved portrait presets without replacing custom dimensions', () => {
  const old = { ...createDefaultVideoExportSettings(), quality: 'ultra' as const, aspectRatio: '4:5' as const, resolution: { width: 3072, height: 3840 } };
  expect(normalizeVideoExportResolution(old).resolution).toEqual({ width: 1728, height: 2160 });
  const custom = { ...old, resolution: { width: 2000, height: 2500 } };
  expect(normalizeVideoExportResolution(custom)).toBe(custom);
});
