import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { RouteLandmarkList } from './RouteLandmarkList';
import type { RouteLandmark } from '@/types/landmarks';

const landmark: RouteLandmark = { id: 'place', type: 'summit', source: 'enriched', display: 'subtle', lat: 42, lon: 1, progress: 0.5, title: 'Puig Alt', importance: 3 };
beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.getState().setEnrichedLandmarks([landmark]);
  useAppStore.getState().selectLandmark(landmark.id);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ icons: { bicycle: { svg: '<svg><path d="M1 1L14 14Z"/></svg>', srcdir: 'transport' } } }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('searches the route moment icon library, adopts a derived landmark and displays the selected icon', async () => {
  render(<RouteLandmarkList />);
  expect(screen.getByRole('button', { name: 'Peak' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search map icons' }), { target: { value: 'bicycle' } });
  fireEvent.click(await screen.findByRole('button', { name: 'bicycle' }));
  expect(useAppStore.getState().userLandmarks[0]).toMatchObject({ id: landmark.id, source: 'user', icon: 'pinhead:bicycle' });
  expect(screen.getByRole('button', { name: 'Puig Alt' }).querySelector('svg path')).toHaveAttribute('d', 'M1 1L14 14Z');
  fireEvent.click(screen.getByRole('button', { name: 'Emoji' }));
  expect(useAppStore.getState().userLandmarks[0].icon).toBe('emoji:🚰');
  const input = screen.getByRole('textbox', { name: /Emoji/ });
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.change(input, { target: { value: '🏕️' } });
  expect(useAppStore.getState().userLandmarks[0].icon).toBe('emoji:🏕️');
});
