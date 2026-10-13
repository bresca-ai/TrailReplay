import { describe, expect, it } from 'vitest';
import { shouldShowRouteLandmarks } from './useRouteLandmarksLayer';

describe('route landmark playback visibility', () => {
  it.each(['preloading', 'intro'] as const)('hides place labels during %s', (phase) => {
    expect(shouldShowRouteLandmarks(phase)).toBe(false);
  });

  it.each(['idle', 'playing', 'outro', 'ended'] as const)('shows place labels during %s', (phase) => {
    expect(shouldShowRouteLandmarks(phase)).toBe(true);
  });
});
