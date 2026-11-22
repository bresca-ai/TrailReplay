import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { Sidebar } from './Sidebar';
import { MenuDesignContext } from './menuDesign';

vi.mock('./SidebarPanelContent', () => ({ SidebarPanelContent: () => <div>Panel content</div> }));
const resize = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('./useRailMapResize', () => ({ useRailMapResize: () => resize }));

beforeEach(() => { useAppStore.getState().reset(); useAppStore.getState().setSettings({ language: 'en' }); });
afterEach(cleanup);

it('navigates to separate map and camera sections from the desktop rail', () => {
  render(<Sidebar />);
  const navigation = screen.getByRole('navigation', { name: 'Sections' });
  expect(within(navigation).getAllByRole('button')).toHaveLength(7);
  fireEvent.click(within(navigation).getByRole('button', { name: 'Camera' }));
  expect(useAppStore.getState().activePanel).toBe('camera');
  expect(within(navigation).getByRole('button', { name: 'Camera' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(within(navigation).getByRole('button', { name: 'Map' }));
  expect(useAppStore.getState().activePanel).toBe('settings');
});

it('keeps navigation locked to Generate during export', () => {
  render(<Sidebar />);
  act(() => useAppStore.getState().setIsExporting(true));
  const navigation = screen.getByRole('navigation', { name: 'Sections' });
  expect(within(navigation).getByRole('button', { name: 'Camera' })).toBeDisabled();
  expect(within(navigation).getByRole('button', { name: 'Generate' })).toBeEnabled();
  expect(useAppStore.getState().activePanel).toBe('export');
  expect(navigation).not.toHaveClass('hover:w-44');
});

it('clears the selected rail icon while the panel is closed and reopens it on selection', () => {
  render(<Sidebar />);
  const navigation = screen.getByRole('navigation', { name: 'Sections' });
  act(() => useAppStore.getState().setSidebarOpen(false));
  expect(within(navigation).queryByRole('button', { current: 'page' })).not.toBeInTheDocument();
  fireEvent.click(within(navigation).getByRole('button', { name: 'Camera' }));
  expect(useAppStore.getState().isSidebarOpen).toBe(true);
  expect(within(navigation).getByRole('button', { name: 'Camera' })).toHaveAttribute('aria-current', 'page');
});

it('starts and stops map resizing for native width transition events', () => {
  render(<Sidebar />);
  const navigation = screen.getByRole('navigation', { name: 'Sections' });
  const start = new Event('transitionstart', { bubbles: true });
  Object.defineProperty(start, 'propertyName', { value: 'width' });
  const end = new Event('transitionend', { bubbles: true });
  Object.defineProperty(end, 'propertyName', { value: 'width' });
  fireEvent(navigation, start);
  expect(resize.start).toHaveBeenCalled();
  fireEvent(navigation, end);
  expect(resize.stop).toHaveBeenCalled();
});

it('switches layouts without remounting the current panel', () => {
  const view = render(<MenuDesignContext.Provider value="new"><Sidebar /></MenuDesignContext.Provider>);
  const panel = screen.getByText('Panel content');
  view.rerender(<MenuDesignContext.Provider value="previous"><Sidebar /></MenuDesignContext.Provider>);
  expect(screen.getByText('Panel content')).toBe(panel);
  expect(screen.getByRole('button', { name: 'Map & Camera' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Sections', hidden: true })).not.toHaveClass('lg:flex');
});

 it('opens, switches and closes the mobile panel from its icon bar', () => {
  render(<Sidebar />);
  const bar = screen.getByRole('group', { name: 'Sections' });
  act(() => useAppStore.getState().setSidebarOpen(false));
  fireEvent.click(within(bar).getByRole('button', { name: 'Camera' }));
  expect(useAppStore.getState()).toMatchObject({ isSidebarOpen: true, activePanel: 'camera' });
  expect(within(bar).getByRole('button', { name: 'Camera' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(bar).getByRole('button', { name: 'Map' }));
  expect(useAppStore.getState()).toMatchObject({ isSidebarOpen: true, activePanel: 'settings' });
  fireEvent.click(within(bar).getByRole('button', { name: 'Map' }));
  expect(useAppStore.getState().isSidebarOpen).toBe(false);
});
