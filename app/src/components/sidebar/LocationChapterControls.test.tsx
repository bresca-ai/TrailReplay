import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { LocationChapterControls } from './LocationChapterControls';

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
