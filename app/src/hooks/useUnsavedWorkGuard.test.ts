import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { useUnsavedWorkGuard } from './useUnsavedWorkGuard';

/** True when the browser would ask before leaving the page. */
function leavingIsGuarded(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  cleanup();
  useAppStore.getState().reset();
});

it('guards leaving while only the story holds unsaved work', () => {
  renderHook(() => useUnsavedWorkGuard());
  expect(leavingIsGuarded()).toBe(false);

  act(() => useAppStore.getState().updateStory({ type: 'setCover', title: 'Not saved yet' }));
  expect(leavingIsGuarded()).toBe(true);

  act(() => useAppStore.getState().updateStory({ type: 'setCover', title: '' }));
  expect(leavingIsGuarded()).toBe(false);
});

it('does not re-render on a story edit that leaves the answer unchanged', () => {
  let renders = 0;
  renderHook(() => {
    renders += 1;
    useUnsavedWorkGuard();
  });
  act(() => useAppStore.getState().updateStory({ type: 'setCover', title: 'First' }));
  const rendersOnceDirty = renders;

  act(() => useAppStore.getState().updateStory({ type: 'setCover', title: 'First draft' }));
  act(() => useAppStore.getState().updateStory({ type: 'setCover', title: 'First draft, revised' }));
  expect(renders).toBe(rendersOnceDirty);
});
