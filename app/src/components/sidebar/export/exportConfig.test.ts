import { describe, expect, it } from 'vitest';
import { getVideoBitrate } from './exportConfig';

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
