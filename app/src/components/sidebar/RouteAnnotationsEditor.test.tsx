import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  expect(screen.getByText('Appears at the bottom right; slows playback for reading.')).toBeInTheDocument();
  expect(screen.getByText('Appears at the map location; slows playback for reading.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Map caption/ }));
  expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Fill marker' })).toBeInTheDocument();
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

it('saves and edits the matching-routes option on a single moment', () => {
  render(<RouteAnnotationsEditor />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Water' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Show on matching routes/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Annotation' }));
  expect(useAppStore.getState().textAnnotations).toHaveLength(1);
  expect(useAppStore.getState().textAnnotations[0].showOnMatchingRoutes).toBe(true);
  fireEvent.click(screen.getByText('Water').closest('summary')!);
  const editor = screen.getByText('Water').closest('details')!;
  fireEvent.click(editor.querySelector('input[type=checkbox]')!);
  expect(useAppStore.getState().textAnnotations[0].showOnMatchingRoutes).toBe(false);
});


it('preserves spaces and allows every field of an existing annotation to be cleared', () => {
  useAppStore.getState().addTextAnnotation({ id: 'edit', progress: 0, lat: 42, lon: 1, title: 'Old title', subtitle: 'Old subtitle', code: 'A1', meta: 'Old meta', description: 'Old description', eyebrow: 'Old heading', color: '#fff', displayDuration: 4000, presentation: 'side-panel' });
  render(<RouteAnnotationsEditor />);
  fireEvent.click(screen.getByText('Old title').closest('summary')!);
  const editor = screen.getByText('Old title').closest('details')!;
  const title = within(editor).getByRole('textbox', { name: 'Title' });
  const heading = within(editor).getByPlaceholderText('Route moment');
  const description = within(editor).getByLabelText('Description');
  expect(within(editor).queryByLabelText('Station code')).not.toBeInTheDocument();
  expect(within(editor).queryByLabelText(/Route details/)).not.toBeInTheDocument();
  expect(heading).toHaveValue('Old heading · A1');
  expect(description).toHaveValue('Old meta\nOld description');
  for (const input of [title, heading, description]) {
    fireEvent.change(input, { target: { value: 'Two ' } });
    expect(input).toHaveValue('Two ');
    fireEvent.change(input, { target: { value: 'Two words' } });
    expect(input).toHaveValue('Two words');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
  }
  expect(useAppStore.getState().textAnnotations[0].code).toBe('');
  expect(useAppStore.getState().textAnnotations[0].translations?.en).toMatchObject({ title: '', eyebrow: '', meta: '', description: '' });
});

it('allows creating an annotation without a title', () => {
  render(<RouteAnnotationsEditor />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Annotation' }));
  expect(useAppStore.getState().textAnnotations[0].title).toBe('');
});


it('preserves spaces and empty wording when editing a map caption', () => {
  useAppStore.getState().addTextAnnotation({ id: 'map', progress: 0, lat: 42, lon: 1, title: 'Caption', subtitle: 'Details', color: '#fff', displayDuration: 4000, presentation: 'map-card' });
  render(<RouteAnnotationsEditor />);
  fireEvent.click(screen.getByText('Caption').closest('summary')!);
  const editor = screen.getByText('Caption').closest('details')!;
  const title = within(editor).getByRole('textbox', { name: 'Title' });
  const subtitle = within(editor).getByRole('textbox', { name: 'Description' });
  for (const input of [title, subtitle]) {
    fireEvent.change(input, { target: { value: 'New ' } });
    expect(input).toHaveValue('New ');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
  }
  expect(useAppStore.getState().textAnnotations[0].translations?.en).toMatchObject({ title: '', description: '' });
});

it('saves the fill choice for both annotation types', () => {
  render(<RouteAnnotationsEditor />);
  fireEvent.click(screen.getByRole('button', { name: /Map caption/ }));
  expect(screen.getByRole('checkbox', { name: 'Fill marker' })).toBeChecked();
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Water' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Annotation' }));
  expect(useAppStore.getState().textAnnotations[0]).toMatchObject({ presentation: 'map-card', markerFilled: true });
  fireEvent.click(screen.getByText('Water').closest('summary')!);
  const editor = screen.getByText('Water').closest('details')!;
  fireEvent.click(within(editor).getByRole('checkbox', { name: 'Fill marker' }));
  expect(useAppStore.getState().textAnnotations[0].markerFilled).toBe(false);
});

it('updates marker and annotation text sizes independently', () => {
  render(<RouteAnnotationsEditor />);
  fireEvent.change(screen.getByRole('slider', { name: 'Marker size' }), { target: { value: '1.5' } });
  expect(useAppStore.getState().settings.annotationMarkerScale).toBe(1.5);
  expect(useAppStore.getState().settings.annotationTextScale).toBe(1.2);
  fireEvent.change(screen.getByRole('slider', { name: 'Annotation text size' }), { target: { value: '0.7' } });
  expect(useAppStore.getState().settings.annotationTextScale).toBe(0.7);
  expect(screen.getByText('150%')).toBeInTheDocument();
});

it('uses shared timing defaults and allows an individual override to be cleared', () => {
  render(<RouteAnnotationsEditor />);
  fireEvent.change(screen.getByLabelText('Pin appears before (sec)'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Slowdown (sec)'), { target: { value: '8' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Spring' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Annotation' }));
  expect(useAppStore.getState().textAnnotations[0].holdDuration).toBeUndefined();
  expect(useAppStore.getState().settings.annotationHoldDuration).toBe(8000);
  fireEvent.click(screen.getByText('Spring').closest('summary')!);
  const editor = screen.getByText('Spring').closest('details')!;
  const lead = within(editor).getByLabelText('Pin lead override (sec)');
  const hold = within(editor).getByLabelText('Slowdown override (sec)');
  expect(lead).toHaveAttribute('placeholder', '12');
  expect(hold).toHaveAttribute('placeholder', '8');
  fireEvent.change(lead, { target: { value: '3' } });
  fireEvent.change(hold, { target: { value: '0' } });
  expect(useAppStore.getState().textAnnotations[0]).toMatchObject({ pinLeadDuration: 3000, holdDuration: 0 });
  fireEvent.change(lead, { target: { value: '' } });
  fireEvent.change(hold, { target: { value: '' } });
  expect(useAppStore.getState().textAnnotations[0].pinLeadDuration).toBeUndefined();
  expect(useAppStore.getState().textAnnotations[0].holdDuration).toBeUndefined();
});
