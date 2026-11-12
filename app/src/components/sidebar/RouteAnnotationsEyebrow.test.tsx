import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { RouteAnnotationsEditor } from './RouteAnnotationsEditor';

vi.mock('@/hooks/useComputedJourney', () => ({ useComputedJourney: () => ({ routeDistance: 0 }) }));
vi.mock('@/components/ui/slider', () => ({ Slider: () => <div /> }));
vi.mock('@/components/sidebar/AnnotationSymbolPicker', () => ({ AnnotationSymbolPicker: () => <div /> }));
afterEach(cleanup);

it('retains a trailing space while editing the route heading', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.getState().addTextAnnotation({ id: 'heading', progress: 0, lat: 42, lon: 1, title: 'Course', color: '#ffffff', displayDuration: 4000, presentation: 'side-panel' });
  render(<RouteAnnotationsEditor />);
  fireEvent.click(screen.getByText('Course').closest('summary')!);
  const input = screen.getAllByPlaceholderText('Route moment')[0];
  fireEvent.change(input, { target: { value: 'Ruta ' } });
  expect(input).toHaveValue('Ruta ');
  fireEvent.change(input, { target: { value: 'Ruta 1' } });
  expect(input).toHaveValue('Ruta 1');
});
