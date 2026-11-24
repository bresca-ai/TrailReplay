import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import { AnnotationsPanel } from './AnnotationsPanel';

vi.mock('./ActivityIconPicker', () => ({ ActivityIconPicker: ({ onSelect }: { onSelect: (value: string) => void }) => <button onClick={() => onSelect('3d-runner')}>Choose runner</button> }));
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); useAppStore.getState().reset(); useAppStore.getState().setSettings({ language: 'en' }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('only shows the activity icon picker when icon mode is selected', () => {
  useAppStore.getState().setTrailStyle({ showMarker: true, markerType: 'dot' });
  render(<AnnotationsPanel />);
  expect(screen.queryByRole('button', { name: /change icon/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
  fireEvent.click(screen.getByRole('button', { name: /change icon/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose runner' }));
  expect(useAppStore.getState().settings.trailStyle).toMatchObject({ markerType: 'icon', currentIcon: '3d-runner' });
  fireEvent.click(screen.getByRole('button', { name: 'Dot' }));
  expect(screen.queryByRole('button', { name: /change icon/i })).toBeNull();
});

it('shows route controls first and expanded on opening', () => {
  useAppStore.getState().setTrailStyle({ showMarker: true, markerType: 'icon' });
  const { container } = render(<AnnotationsPanel />);
  const firstSection = container.querySelector('details');
  expect(firstSection).not.toBeNull();
  if (!firstSection) throw new Error('Route section not found');
  expect(firstSection.open).toBe(true);
  expect(firstSection.contains(screen.getByText(/route name/i))).toBe(true);
  expect(firstSection.compareDocumentPosition(screen.getByRole('button', { name: /change icon/i })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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


it('orders route style controls by the current journey and keeps unsequenced routes available', () => {
  const track = { points: [], activityIcon: 'svg-walking', totalDistance: 1000, totalTime: 0, movingTime: 0, elevationGain: 100, elevationLoss: 100, maxElevation: 100, minElevation: 0, maxSpeed: 0, avgSpeed: 0, avgMovingSpeed: 0, bounds: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 }, color: '#c1652f', visible: true };
  for (const [id, name] of [['first', 'First route'], ['second', 'Second route'], ['third', 'Third route']]) {
    useAppStore.getState().addTrack({ ...track, id, name });
  }
  const segments = useAppStore.getState().journeySegments.filter(segment => segment.type === 'track');
  useAppStore.getState().reorderJourneySegments([segments[1], segments[0], segments[1]]);
  render(<AnnotationsPanel />);
  const names = () => screen.getAllByRole('button', { name: /^(First|Second|Third) route$/ }).map(button => button.textContent);
  expect(names()).toEqual(['Second route', 'First route', 'Third route']);
  act(() => useAppStore.getState().reorderJourneySegments([segments[0], segments[1]]));
  expect(names()).toEqual(['First route', 'Second route', 'Third route']);
});
