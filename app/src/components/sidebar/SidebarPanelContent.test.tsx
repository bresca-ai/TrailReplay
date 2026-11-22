import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { SidebarPanelContent } from './SidebarPanelContent';
import { MenuDesignContext } from './menuDesign';

vi.mock('./SettingsPanel', () => ({ SettingsPanel: ({ section }: { section: string }) => <div>Settings section: {section}</div> }));
vi.mock('./WorkflowGuide', () => ({ WorkflowGuide: () => null }));

beforeEach(() => { useAppStore.getState().reset(); useAppStore.getState().setSettings({ language: 'en' }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('separates map and camera on desktop', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  useAppStore.getState().setActivePanel('settings');
  render(<SidebarPanelContent />);
  expect(await screen.findByText('Settings section: map')).toBeInTheDocument();
  act(() => useAppStore.getState().setActivePanel('camera'));
  expect(await screen.findByText('Settings section: camera')).toBeInTheDocument();
});

it('keeps map and camera together on mobile', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  useAppStore.getState().setActivePanel('settings');
  render(<MenuDesignContext.Provider value="previous"><SidebarPanelContent /></MenuDesignContext.Provider>);
  expect(await screen.findByText('Settings section: all')).toBeInTheDocument();
  act(() => useAppStore.getState().setActivePanel('camera'));
  expect(await screen.findByText('Settings section: all')).toBeInTheDocument();
});
