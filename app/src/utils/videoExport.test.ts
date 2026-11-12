import { describe, expect, it } from 'vitest';
import { createDefaultVideoExportSettings } from '@/store/defaults';
import { estimateFileSize, estimateVideoDuration } from './videoExport';
import type { PictureAnnotation, TextAnnotation, VideoAnnotation } from '@/types';

describe('video size estimate', () => {
  it('includes annotation slowdowns, transitions, cover and available media in the duration', () => {
    const duration = estimateVideoDuration({ routeDuration: 15_000,
      annotations: [{ progress: 0.5, holdDuration: 3000 } as TextAnnotation], annotationHoldDuration: 5000,
      introDuration: 2500, outroDuration: 3000, includeCover: true,
      pictures: [{ progress: 0.4, displayDuration: 4000 } as PictureAnnotation],
      videos: [{ progress: 0.6, durationSeconds: 2 } as VideoAnnotation, { progress: 0.8, durationSeconds: 10, isPlaceholder: true } as VideoAnnotation] });
    expect(duration).toBe(29_500);
    expect(estimateFileSize(duration, createDefaultVideoExportSettings())).toBe('17.6 MB');
  });
  it('uses the export bitrate for frame rate, resolution and quality mode', () => {
    const settings = createDefaultVideoExportSettings();
    expect(estimateFileSize(15_000, { ...settings, fps: 24 })).toBe('7.2 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 30 })).toBe('8.9 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 60 })).toBe('17.9 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 30, qualityMode: 'studio' })).toBe('26.8 MB');
    expect(estimateFileSize(15_000, { ...settings, fps: 30, resolution: { width: 1080, height: 1080 } })).toBe('5.4 MB');
  });
});
