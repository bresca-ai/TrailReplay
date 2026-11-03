import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { LocationChapterControls } from './LocationChapterControls';
import { useStartLocationLevels } from '@/hooks/useStartLocationLevels';

vi.mock('@/hooks/useComputedJourney', () => ({ useComputedJourney: () => ({ allCoordinates: [[2, 41]] }) }));
vi.mock('@/hooks/useStartLocationLevels', () => ({ useStartLocationLevels: vi.fn(() => ({ hasStart: true, retry: vi.fn(), results: {
  country: { status: 'available', name: 'Spain' }, region: { status: 'available', name: 'Catalonia' },
  adm2: { status: 'available', name: 'Girona' }, adm3: { status: 'available', name: 'Figueres' },
  adm4: { status: 'available', name: 'District' }, adm5: { status: 'available', name: 'Local' },
} })) }));

afterEach(() => { cleanup(); useAppStore.getState().reset(); });
it('lets users choose regional chapters and customize the border and labels', () => {
  render(<LocationChapterControls />);
  fireEvent.change(screen.getByLabelText('Boundary level while moving'), { target: { value: 'region' } });
  expect(useAppStore.getState().settings.locationChapters.level).toBe('region');
  fireEvent.click(screen.getByText('Border and label style'));
  fireEvent.change(screen.getByLabelText('Border color'), { target: { value: '#123456' } });
  fireEvent.change(screen.getByLabelText('Border width'), { target: { value: '5' } });
  fireEvent.click(screen.getByLabelText('Show country flag'));
  expect(useAppStore.getState().settings.locationChapters).toMatchObject({ color: '#123456', width: 5, showFlag: false });
});
it('lets users choose a local level and any combination of opening levels', () => {
  render(<LocationChapterControls />);
  fireEvent.change(screen.getByLabelText('Boundary level while moving'), { target: { value: 'adm3' } });
  expect(useAppStore.getState().settings.locationChapters.level).toBe('adm3');
  fireEvent.click(screen.getByLabelText('Countries (ADM0)'));
  fireEvent.click(screen.getByLabelText('Regions (ADM1)'));
  expect(useAppStore.getState().settings.locationChapters.introLevels).toEqual(expect.arrayContaining(['country', 'region', 'adm3']));
  fireEvent.click(screen.getByLabelText('Administrative level (ADM3)'));
  expect(useAppStore.getState().settings.locationChapters.introLevels).not.toContain('adm3');
  expect(screen.getByLabelText('Minimum time inside (seconds)')).toHaveValue('0');
  fireEvent.change(screen.getByLabelText('Boundary level while moving'), { target: { value: 'country' } });
  expect(useAppStore.getState().settings.locationChapters.introLevels).toEqual(expect.arrayContaining(['country', 'region']));
  expect(screen.getByLabelText('Camera move duration (seconds)')).toHaveValue('10');
  fireEvent.change(screen.getByLabelText('Camera move duration (seconds)'), { target: { value: '14' } });
  expect(useAppStore.getState().settings.locationChapters.zoomDurationSeconds).toBe(14);
  fireEvent.click(screen.getByLabelText('Zoom out when entering a place'));
  expect(screen.queryByLabelText('Camera move duration (seconds)')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Fit places during the opening zoom')).toBeChecked();
});
it('shows start names and offers only levels with a known place for the opening', () => {
  vi.mocked(useStartLocationLevels).mockReturnValueOnce({ hasStart: true, retry: vi.fn(), results: {
    country: { status: 'available', name: 'Spain' }, region: { status: 'available', name: 'Catalonia' },
    adm2: { status: 'unavailable' }, adm3: { status: 'error' }, adm4: { status: 'pending' }, adm5: { status: 'unavailable' },
  } });
  useAppStore.getState().setSettings({ locationChapters: { ...useAppStore.getState().settings.locationChapters, level: 'region' } });
  render(<LocationChapterControls />);
  expect(screen.getByRole('option', { name: 'Countries (ADM0) — Spain' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'ADM2 · Administrative level — Not at start' })).toBeInTheDocument();
  expect(screen.getByText('Catalonia')).toBeInTheDocument();
  expect(screen.getByLabelText('Countries (ADM0)')).toBeInTheDocument();
  expect(screen.queryByLabelText('Administrative level (ADM2)')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Administrative level (ADM3)')).not.toBeInTheDocument();
  expect(screen.getByText('Checking places at the route start…')).toBeInTheDocument();
  expect(screen.getByText(/Some levels could not be checked/)).toBeInTheDocument();
});
