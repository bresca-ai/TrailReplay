import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import { AnnotationsPanel } from './AnnotationsPanel';

vi.mock('./ActivityIconPicker', () => ({ ActivityIconPicker: ({ onSelect }: { onSelect: (value: string) => void }) => <button onClick={() => onSelect('3d-runner')}>Choose runner</button> }));
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); useAppStore.getState().reset(); useAppStore.getState().setSettings({ language: 'en' }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('offers the marker picker up front and activates the chosen icon from dot mode', () => {
  useAppStore.getState().setTrailStyle({ showMarker: true, markerType: 'dot' });
  render(<AnnotationsPanel />);
  fireEvent.click(screen.getByRole('button', { name: /change icon/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose runner' }));
  expect(useAppStore.getState().settings.trailStyle).toMatchObject({ markerType: 'icon', currentIcon: '3d-runner' });
});

it('shows route controls first and expanded on opening', () => {
  const { container } = render(<AnnotationsPanel />);
  const firstSection = container.querySelector('details');
  expect(firstSection?.open).toBe(true);
  expect(firstSection?.contains(screen.getByText(/route name/i))).toBe(true);
  expect(firstSection?.compareDocumentPosition(screen.getByRole('button', { name: /change icon/i }))! & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('changes only the route chosen from its card', () => {
  const track = { points: [], activityIcon: 'svg-walking', totalDistance: 1000, totalTime: 0, movingTime: 0, elevationGain: 100, elevationLoss: 100, maxElevation: 100, minElevation: 0, maxSpeed: 0, avgSpeed: 0, avgMovingSpeed: 0, bounds: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 }, color: '#c1652f', visible: true };
  useAppStore.getState().addTrack({ ...track, id: 'first', name: 'First route' });
  useAppStore.getState().addTrack({ ...track, id: 'second', name: 'Second route' });
  render(<AnnotationsPanel />);
  fireEvent.click(screen.getByRole('button', { name: /change.*icon.*second route/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose runner' }));
  expect(useAppStore.getState().tracks.find(item => item.id === 'first')?.activityIcon).toBe('svg-walking');
  expect(useAppStore.getState().tracks.find(item => item.id === 'second')?.activityIcon).toBe('3d-runner');
});
