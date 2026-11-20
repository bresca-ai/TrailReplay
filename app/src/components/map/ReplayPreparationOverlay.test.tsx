import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ReplayPreparationOverlay } from './ReplayPreparationOverlay';

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

it('explains the current preparation and lets playback start immediately', () => {
  const onStartNow = vi.fn();
  const { rerender } = render(<ReplayPreparationOverlay terrainLoading boundariesLoading={false} onStartNow={onStartNow} />);
  expect(screen.getByText('map.preparingTerrain')).toBeTruthy();
  rerender(<ReplayPreparationOverlay terrainLoading={false} boundariesLoading={false} onStartNow={onStartNow} />);
  expect(screen.getByText('map.preparingTiles')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'map.startReplayNow' }));
  expect(onStartNow).toHaveBeenCalledOnce();
  expect(screen.getByText('map.startReplayNowHint')).toBeTruthy();
});
