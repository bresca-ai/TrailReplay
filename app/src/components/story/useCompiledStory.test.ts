import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { northbound } from '@/utils/story/storyTestFixtures';
import { useCompiledStory } from './useCompiledStory';

beforeEach(() => useAppStore.getState().reset());
afterEach(cleanup);

describe('useCompiledStory', () => {
  it('compiles the store, follows story edits and ignores playback', () => {
    useAppStore.getState().addTrack(northbound('Ridge', 42, 1));
    let renders = 0;
    const { result } = renderHook(() => { renders += 1; return useCompiledStory(); });
    expect(result.current.story?.route.route.totalDistance).toBeGreaterThan(1000);

    const before = renders;
    act(() => {
      useAppStore.getState().seekToProgress(0.5);
      useAppStore.getState().play();
    });
    expect(renders).toBe(before);

    act(() => useAppStore.getState().updateStory({ type: 'setCover', title: 'Ridge day' }));
    expect(result.current.story?.title).toBe('Ridge day');
    expect(result.current.input.document.title).toBe('Ridge day');
  });

  it('has no story without a route', () => {
    const { result } = renderHook(() => useCompiledStory());
    expect(result.current.story).toBeNull();
  });
});
