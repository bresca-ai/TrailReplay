import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PicturePopup } from './PicturePopup';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('reports the live hold clock and clears it on close', () => {
  vi.useFakeTimers();
  const onElapsedChange = vi.fn();
  const { unmount } = render(<PicturePopup picture={{ id: 'photo', file: null, url: '', isPlaceholder: true, progress: 0.5, position: 0.5, displayDuration: 3000 }} onElapsedChange={onElapsedChange} />);
  act(() => vi.advanceTimersByTime(1500));
  expect(onElapsedChange).toHaveBeenLastCalledWith(1500);
  unmount();
  expect(onElapsedChange).toHaveBeenLastCalledWith(null);
});
