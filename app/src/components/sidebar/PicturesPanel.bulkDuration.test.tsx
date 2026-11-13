import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { PicturesPanel } from './PicturesPanel';

const initial = useAppStore.getState();
afterEach(() => { cleanup(); useAppStore.setState(initial, true); });
it('sets one duration for placed and unplaced photos from the Pictures tab', () => {
  useAppStore.setState((state) => {
    state.settings.language = 'en';
    state.pictures = [{ id: 'placed', file: null, originalFileName: 'placed.jpg', url: '', isPlaceholder: true, progress: 0.2, position: 0.2, displayDuration: 3000 }];
  });
  useAppStore.getState().queuePendingPicturePlacement({ id: 'pending', file: new File([''], 'pending.jpg'), url: 'blob:pending', displayDuration: 3000, placementReason: 'missing-gps' });
  render(<PicturesPanel />);
  expect(screen.getByText('Applies to 2 photos, including those waiting for placement.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Set duration for all photos'), { target: { value: '2' } });
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply to all' })));
  expect(useAppStore.getState().pictures[0].displayDuration).toBe(2000);
  expect(useAppStore.getState().pendingPicturePlacements[0].displayDuration).toBe(2000);
  expect(useAppStore.getState().selectedPendingMediaIds).toEqual([]);
});
