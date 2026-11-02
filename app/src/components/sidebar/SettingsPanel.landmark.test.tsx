import { act, cleanup, render, screen } from '@testing-library/react';
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
