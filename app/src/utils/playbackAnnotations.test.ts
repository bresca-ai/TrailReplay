import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '@/types';
import { getActivePlaybackAnnotationId } from './playbackAnnotations';

function createAnnotation(id: string, progress: number): TextAnnotation {
  return {
    id,
    progress,
    lat: 41.39,
    lon: 2.17,
    title: `Annotation ${id}`,
    color: '#f3b133',
    displayDuration: 4000,
  };
}

describe('getActivePlaybackAnnotationId', () => {
  it('shows an annotation when the marker reaches its anchor', () => {
    const annotations = [
      { ...createAnnotation('a', 0.2), displayDuration: 800 },
      { ...createAnnotation('b', 0.45), displayDuration: 900 },
      { ...createAnnotation('c', 0.7), displayDuration: 1_000 },
    ];

    const result = getActivePlaybackAnnotationId({
      annotations,
      currentTime: 4_500,
      totalDuration: 10_000,
    });

    expect(result).toBe('b');
  });

  it('hides the annotation after its configured display time', () => {
    const annotations = [
      createAnnotation('a', 0.45),
    ];

    const result = getActivePlaybackAnnotationId({
      annotations,
      currentTime: 8_501,
      totalDuration: 10_000,
    });

    expect(result).toBeNull();
  });

  it('does not show a caption before the marker reaches its anchor', () => {
    const annotations = [
      createAnnotation('a', 0.1),
    ];

    const result = getActivePlaybackAnnotationId({
      annotations,
      currentTime: 300,
      totalDuration: 10_000,
    });

    expect(result).toBeNull();
  });

  it('keeps the earliest active annotation when windows overlap', () => {
    const annotations = [
      { ...createAnnotation('a', 0.4), displayDuration: 2_000 },
      { ...createAnnotation('b', 0.45), displayDuration: 2_000 },
    ];

    const result = getActivePlaybackAnnotationId({
      annotations,
      currentTime: 4_500,
      totalDuration: 10_000,
    });

    expect(result).toBe('a');
  });

  it('hides the finish annotation during the final camera zoom out', () => {
    const annotations = [{ ...createAnnotation('finish', 1), presentation: 'side-panel' as const, holdDuration: 7000 }];
    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 10_000, totalDuration: 10_000, phase: 'playing' })).toBe('finish');
    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 10_000, totalDuration: 10_000, phase: 'outro' })).toBeNull();
  });
});
