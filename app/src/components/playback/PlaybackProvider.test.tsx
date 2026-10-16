import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PlaybackProvider } from './PlaybackProvider';
import { useAppStore } from '@/store/useAppStore';

describe('PlaybackProvider intro timing', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAppStore.getState().setAnimationPhase('idle');
    useAppStore.getState().setIsDeterministicExport(false);
    useAppStore.getState().resetPlayback();
  });

  it('lets deterministic export advance the intro instead of the wall clock', () => {
    vi.useFakeTimers();
    useAppStore.getState().setIsDeterministicExport(true);
    useAppStore.getState().setAnimationPhase('intro');

    render(<PlaybackProvider><div /></PlaybackProvider>);
    vi.advanceTimersByTime(3000);

    expect(useAppStore.getState().animationPhase).toBe('intro');
  });

  it('keeps the wall-clock intro transition for normal playback', () => {
    vi.useFakeTimers();
    useAppStore.getState().setIsDeterministicExport(false);
    useAppStore.getState().setAnimationPhase('intro');

    render(<PlaybackProvider><div /></PlaybackProvider>);
    vi.advanceTimersByTime(2500);

    expect(useAppStore.getState().animationPhase).toBe('playing');
  });
});
