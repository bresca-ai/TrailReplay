import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { MapBuildingAttribution } from './MapBuildingAttribution';

beforeEach(() => { vi.useFakeTimers(); useAppStore.getState().setSettings({ language: 'en' }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('shows the building credits before collapsing and lets the user reopen them', () => {
  render(<MapBuildingAttribution />);
  expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toBeVisible();
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.queryByRole('link', { name: 'OpenStreetMap contributors' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Map data credits' }));
  expect(screen.getByRole('link', { name: 'OpenMapTiles' })).toBeVisible();
});
