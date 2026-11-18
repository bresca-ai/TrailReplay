import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mapGlobalRef } from '@/utils/mapRef';
import { useRailMapResize } from './useRailMapResize';

afterEach(() => { mapGlobalRef.current = null; vi.unstubAllGlobals(); });

it('redraws the live map without adding a duplicate image during panel transitions', () => {
  let notify = () => {};
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  const container = document.createElement('div');
  const map = { getContainer: () => container, resize: vi.fn(), redraw: vi.fn() };
  mapGlobalRef.current = map as unknown as typeof mapGlobalRef.current;
  const { result, unmount } = renderHook(() => useRailMapResize());
  act(() => result.current.start());
  expect(observe).toHaveBeenCalledWith(container);
  act(() => notify());
  expect(map.resize).toHaveBeenCalledOnce();
  expect(map.redraw).toHaveBeenCalledOnce();
  expect(container.childElementCount).toBe(0);
  act(() => result.current.stop());
  expect(disconnect).toHaveBeenCalledOnce();
  unmount();
});
