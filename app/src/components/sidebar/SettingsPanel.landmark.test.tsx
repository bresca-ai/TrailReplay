import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { SettingsPanel } from './SettingsPanel';

it('reveals the landmark editor from map selection, including a repeated selection', () => {
  const state = useAppStore.getState();
  state.reset();
  state.setSettings({ language: 'en' });
  state.addLandmark({ id: 'water', type: 'custom', source: 'user', display: 'subtle', lat: 42, lon: 1, progress: 0.5, title: 'Water', importance: 3 });
  state.setSidebarOpen(false);
  state.setActivePanel('tracks');
  state.revealLandmarkEditor('water');
  expect(useAppStore.getState()).toMatchObject({ isSidebarOpen: true, activePanel: 'settings', selectedLandmarkId: 'water' });

  const scroll = vi.fn();
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = scroll;
  try {
    render(<SettingsPanel />);
    const section = screen.getByText('Route landmarks', { selector: 'summary' }).parentElement as HTMLDetailsElement;
    expect(section.open).toBe(true);
    expect(screen.getByDisplayValue('Water')).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
    section.open = false;
    act(() => useAppStore.getState().revealLandmarkEditor('water'));
    expect(section.open).toBe(true);
  } finally {
    Element.prototype.scrollIntoView = original;
    cleanup();
  }
});

afterEach(() => vi.restoreAllMocks());

it('places the collapsible location chapters between landmarks and overlays', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  render(<SettingsPanel />);
  const landmarks = screen.getByText('Route landmarks', { selector: 'summary' }).parentElement;
  const summary = screen.getByText(/Place & border animations/, { selector: 'summary' });
  const chapters = summary.parentElement as HTMLDetailsElement;
  const overlays = screen.getByText(/Overlays/, { selector: 'summary' }).parentElement;
  expect(chapters.previousElementSibling).toBe(landmarks);
  expect(chapters.nextElementSibling).toBe(overlays);
  expect(chapters.open).toBe(false);
  fireEvent.click(summary);
  expect(chapters.open).toBe(true);
  expect(screen.getByLabelText('Boundary level while moving')).toBeInTheDocument();
  cleanup();
});

it('browses all map styles in the same picker and keeps the selected style visible', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en', mapStyle: 'satellite' });
  const { unmount } = render(<SettingsPanel />);
  expect(screen.queryByText('More map styles')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous map styles' })).toBeDisabled();
  const satellite = screen.getByRole('button', { name: 'Satellite' });
  expect(satellite).toHaveAttribute('aria-pressed', 'true');
  expect(satellite.parentElement).toHaveClass('transition-transform', 'motion-reduce:transition-none');
  fireEvent.click(screen.getByRole('button', { name: 'Next map styles' }));
  expect(satellite).toHaveAttribute('tabindex', '-1');
  expect(satellite.parentElement?.style.transform).toContain('33.333');
  expect(screen.getByRole('button', { name: 'Esri Clarity' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Esri Clarity' }));
  expect(useAppStore.getState().settings.mapStyle).toBe('esri-clarity');
  fireEvent.click(screen.getByRole('button', { name: 'Next map styles' }));
  expect(screen.getByRole('button', { name: 'Wayback' })).toBeInTheDocument();
  unmount();
  render(<SettingsPanel />);
  expect(screen.getByRole('button', { name: 'Esri Clarity' })).toHaveAttribute('aria-pressed', 'true');
  cleanup();
});
