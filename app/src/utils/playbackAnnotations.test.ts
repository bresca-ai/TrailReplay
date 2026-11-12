import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '@/types';
import { getActivePlaybackAnnotationId, getUpcomingAnnotationIndexes } from './playbackAnnotations';

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
  it('shows annotation text as the slowdown begins', () => {
    const annotations = [
      { ...createAnnotation('a', 0.2), displayDuration: 800 },
      { ...createAnnotation('b', 0.45), displayDuration: 900 },
      { ...createAnnotation('c', 0.7), displayDuration: 1_000 },
    ];

    const result = getActivePlaybackAnnotationId({
      annotations,
      currentTime: 4_200,
      totalDuration: 10_000,
    });

    expect(result).toBe('b');
  });

  it('hides annotation text after the slowdown ends', () => {
    const annotations = [
      createAnnotation('a', 0.45),
    ];

    const result = getActivePlaybackAnnotationId({
      annotations,
      currentTime: 5_001,
      totalDuration: 10_000,
    });

    expect(result).toBeNull();
  });

  it('keeps text hidden until its slowdown window', () => {
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
      currentTime: 3_900,
      totalDuration: 10_000,
    });

    expect(result).toBe('a');
  });

  it('hides the finish annotation during the final camera zoom out', () => {
    const annotations = [{ ...createAnnotation('finish', 1), presentation: 'side-panel' as const, holdDuration: 7000 }];
    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 10_000, totalDuration: 10_000, phase: 'playing' })).toBe('finish');
    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 10_000, totalDuration: 10_000, phase: 'outro' })).toBeNull();
  });

  it.each(['preloading', 'intro'] as const)('waits until playback before showing a start annotation during %s', (phase) => {
    const annotations = [{ ...createAnnotation('start', 0), presentation: 'side-panel' as const, holdDuration: 7000 }];

    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 0, totalDuration: 10_000, phase })).toBeNull();
    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 0, totalDuration: 10_000, phase: 'playing' })).toBe('start');
  });

  it('keeps annotations available when the editor is paused away from the start', () => {
    const annotations = [createAnnotation('middle', 0.5)];

    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 5_000, totalDuration: 10_000, phase: 'idle' })).toBe('middle');
  });
});

describe('upcoming pins', () => {
  it('shows pins before text, respects overrides and hides them after the moment', () => {
    const annotations = [{ ...createAnnotation('a', 0.5), presentation: 'side-panel' as const }, { ...createAnnotation('b', 0.7), pinLeadDuration: 1000 }];
    expect(getUpcomingAnnotationIndexes(annotations, 3900, 10000, 1000)).toEqual([]);
    expect(getUpcomingAnnotationIndexes(annotations, 4000, 10000, 1000)).toEqual([0]);
    expect(getActivePlaybackAnnotationId({ annotations, currentTime: 4000, totalDuration: 10000 })).toBeNull();
    expect(getUpcomingAnnotationIndexes(annotations, 6000, 10000, 5000)).toEqual([1]);
    expect(getUpcomingAnnotationIndexes(annotations, 8000, 10000, 5000)).toEqual([]);
  });
});
