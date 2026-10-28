import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { RouteAnnotationsEditor } from './RouteAnnotationsEditor';

const journeyState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/hooks/useComputedJourney', () => ({ useComputedJourney: () => journeyState.current }));
vi.mock('@/components/ui/slider', () => ({ Slider: () => <div /> }));
vi.mock('@/components/sidebar/AnnotationSymbolPicker', () => ({ AnnotationSymbolPicker: () => <div>Symbol picker</div> }));

beforeEach(() => { useAppStore.getState().reset(); useAppStore.getState().setSettings({ language: 'en' }); journeyState.current = { currentPosition: { lat: 42, lon: 1, elevation: 100 }, routeDistance: 500 }; });
afterEach(cleanup);

it('creates an annotation at the playhead and keeps its editing controls available', () => {
  render(<RouteAnnotationsEditor />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Mountain pass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Annotation' }));
  expect(useAppStore.getState().textAnnotations[0]).toMatchObject({ title: 'Mountain pass', lat: 42, lon: 1, routeDistance: 500 });
  const summary = screen.getByText('Mountain pass').closest('summary');
  expect(summary).not.toBeNull();
  fireEvent.click(summary!);
  expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
});

it('offers distinct annotation types with an explanation', () => {
  render(<RouteAnnotationsEditor />);
  expect(screen.getByText('Short text displayed on the map.')).toBeInTheDocument();
  expect(screen.getByText('A larger panel; slows playback for reading.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Map caption/ }));
  expect(screen.getByPlaceholderText('Subtitle')).toBeInTheDocument();
});


it('uses the manually entered distance instead of the playhead and can return to the playhead', () => {
  const point = (distance: number) => ({ lat: 42 + distance / 100000, lon: 1, elevation: 100, time: null, heartRate: null, cadence: null, power: null, temperature: null, distance, speed: 1 });
  journeyState.current = { currentPosition: point(200), routeDistance: 200, totalDistance: 1000, computedJourney: null, activeTrack: { points: [point(0), point(1000)], totalDistance: 1000 }, routeTimingMode: 'uniform' };
  render(<RouteAnnotationsEditor />);
  const input = screen.getByRole('textbox', { name: 'Position on route' });
  fireEvent.change(input, { target: { value: '0.80' } });
  fireEvent.blur(input);
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Summit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Annotation' }));
  expect(useAppStore.getState().textAnnotations[0]).toMatchObject({ routeDistance: 800, progress: 0.8 });
  expect(useAppStore.getState().textAnnotations[0].lat).toBeCloseTo(42.008);
  fireEvent.click(screen.getAllByText('Add Annotation').find((element) => element.closest('summary'))!.closest('summary')!);
  fireEvent.click(screen.getByRole('button', { name: 'Use playhead' }));
  expect(screen.getByRole('textbox', { name: 'Position on route' })).toHaveValue('0.20');
});
