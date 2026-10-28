import { describe, expect, it } from 'vitest';
import { createDefaultVideoExportSettings } from '@/store/defaults';
import { estimateFileSize } from './videoExport';

describe('video size estimate', () => {
  it('uses the export bitrate for frame rate, resolution and quality mode', () => {
    const settings = createDefaultVideoExportSettings();
    expect(estimateFileSize(15_000, { ...settings, fps: 24 })).toBe('7.2 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 30 })).toBe('8.9 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 60 })).toBe('17.9 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 30, qualityMode: 'studio' })).toBe('26.8 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 30, resolution: { width: 1080, height: 1080 } })).toBe('5.4 MB');
  });
});
