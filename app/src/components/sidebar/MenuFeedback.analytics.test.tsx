import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { MenuFeedback } from './MenuFeedback';
import { MENU_FEEDBACK_KEY } from './menuDesign';

vi.mock('@/config/analytics', () => ({
  GA4_DEBUG_MODE: false, RELEASE_ID: 'test-release', GA4_MEASUREMENT_ID: 'G-TEST',
  shouldEnableAnalytics: () => true,
}));
vi.mock('./useDesktopSidebar', () => ({ useDesktopViewport: () => true }));

beforeEach(() => {
  localStorage.removeItem(MENU_FEEDBACK_KEY);
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  window.gtag = vi.fn();
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.removeItem(MENU_FEEDBACK_KEY); window.gtag = undefined; });

it.each([
  ['New menu', 'menu_vote_new'],
  ['Previous menu', 'menu_vote_previous'],
])('sends exactly one %s vote to GA4 and does not prompt again', (label, event) => {
  const view = render(<MenuFeedback design="new" onSwitch={() => {}} />);
  act(() => vi.advanceTimersByTime(8000));
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(window.gtag).toHaveBeenCalledWith('event', event, { app_name: 'TrailReplay', app_release: 'test-release' });
  expect(vi.mocked(window.gtag!).mock.calls.filter(call => call[1] === event)).toHaveLength(1);
  view.unmount();
  render(<MenuFeedback design="new" onSwitch={() => {}} />);
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
  expect(vi.mocked(window.gtag!).mock.calls.filter(call => call[1] === event)).toHaveLength(1);
});
