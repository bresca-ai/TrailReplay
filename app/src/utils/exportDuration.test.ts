import { describe, expect, it } from 'vitest';
import type { PictureAnnotation, TextAnnotation, VideoAnnotation } from '@/types';
import { estimateExportDurationMs } from './exportDuration';

const empty = { routeDurationMs: 60_000, annotations: [], pictures: [], videos: [] };

describe('export output duration estimate', () => {
  it('includes intro, route, annotation slowdowns, photo holds, and clips', () => {
    const annotations = Array.from({ length: 10 }, (_, index) => ({
      id: `note-${index}`, progress: index / 10, presentation: 'side-panel', holdDuration: 30_000,
    })) as TextAnnotation[];
    const pictures = [{ id: 'photo', progress: 0.5, displayDuration: 5000 }] as PictureAnnotation[];
    const videos = [{ id: 'clip', progress: 0.7, durationSeconds: 10, isPlaceholder: false }] as VideoAnnotation[];

    expect(estimateExportDurationMs({ ...empty, annotations, pictures, videos })).toBe(379_500);
  });

  it('skips unrenderable clips and out-of-route media while including placeholder photo holds', () => {
    const pictures = [
      { progress: -1, displayDuration: 10_000 },
      { progress: 1, displayDuration: 0, isPlaceholder: true },
    ] as PictureAnnotation[];
    const videos = [
      { progress: 0.5, durationSeconds: 100, isPlaceholder: true },
      { progress: 0.5 },
      { progress: 2, durationSeconds: 100 },
    ] as VideoAnnotation[];
    expect(estimateExportDurationMs({ ...empty, pictures, videos })).toBe(69_500);
  });

  it('does not count text-card lead time as a hold or add cinematic phases to an empty route', () => {
    const annotations = [{ id: 'map-note', lat: 0, lon: 0, title: 'Map note', color: '#fff', progress: 0.5, displayDuration: 30_000 }];
    expect(estimateExportDurationMs({ ...empty, annotations })).toBe(64_500);
    expect(estimateExportDurationMs({ ...empty, routeDurationMs: 0 })).toBe(0);
  });
});
