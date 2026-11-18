import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { MenuFeedback } from './MenuFeedback';
import { MENU_FEEDBACK_KEY } from './menuDesign';

const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/utils/analytics', () => analytics);
vi.mock('./useDesktopSidebar', () => ({ useDesktopViewport: () => true }));

beforeEach(() => { localStorage.removeItem(MENU_FEEDBACK_KEY); useAppStore.getState().reset(); useAppStore.getState().setSettings({ language: 'en' }); vi.useFakeTimers(); analytics.trackEvent.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.removeItem(MENU_FEEDBACK_KEY); });

it('lets the user compare menus and records one permanent vote', () => {
  const onSwitch = vi.fn();
  const view = render(<MenuFeedback design="new" onSwitch={onSwitch} />);
  expect(screen.queryByText('Which do you prefer?')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(8000));
  expect(analytics.trackEvent).toHaveBeenCalledWith('menu_feedback_shown');
  fireEvent.click(screen.getByRole('button', { name: 'Try previous menu' }));
  expect(onSwitch).toHaveBeenCalledWith('previous');
  expect(analytics.trackEvent).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Previous menu' }));
  expect(localStorage.getItem(MENU_FEEDBACK_KEY)).toBe('vote:previous');
  expect(analytics.trackEvent).toHaveBeenCalledWith('menu_vote_previous');
  expect(screen.queryByText('Which do you prefer?')).not.toBeInTheDocument();
  view.unmount();
  render(<MenuFeedback design="previous" onSwitch={onSwitch} />);
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.queryByText('Which do you prefer?')).not.toBeInTheDocument();
  expect(analytics.trackEvent).toHaveBeenCalledTimes(2);
});

it('does not show the prompt again after dismissal', () => {
  const view = render(<MenuFeedback design="new" onSwitch={() => {}} />);
  act(() => vi.advanceTimersByTime(8000));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss menu feedback' }));
  view.unmount();
  render(<MenuFeedback design="new" onSwitch={() => {}} />);
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.queryByText('Which do you prefer?')).not.toBeInTheDocument();
});
