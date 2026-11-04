import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlaybackControls } from './PlaybackControls';
import { PlaybackProvider } from './PlaybackProvider';
import { useAppStore } from '@/store/useAppStore';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/ui/slider', () => ({ Slider: () => <div /> }));

afterEach(() => { cleanup(); vi.useRealTimers(); useAppStore.getState().reset(); });

it.each(['playing', 'intro', 'outro', 'ended'] as const)('restarts paused from %s and replays the intro on the next play', (phase) => {
  const store = useAppStore.getState();
  store.reset();
  store.setSettings({ language: 'en' });
  store.setPlayback({ isPlaying: phase === 'playing' || phase === 'intro', progress: 0.6, currentTime: 9000, speed: 2 });
  store.setCinematicPlayed(true);
  store.setAnimationPhase(phase);
  render(<PlaybackProvider><PlaybackControls /></PlaybackProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  expect(useAppStore.getState().playback).toMatchObject({ isPlaying: false, progress: 0, currentTime: 0, speed: 2 });
  expect(useAppStore.getState()).toMatchObject({ animationPhase: 'idle', cinematicPlayed: false });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(useAppStore.getState()).toMatchObject({ animationPhase: 'preloading', cinematicPlayed: false });
});

it('cancels a pending intro transition after restarting', () => {
  vi.useFakeTimers();
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.getState().setAnimationPhase('intro');
  render(<PlaybackProvider><PlaybackControls /></PlaybackProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  act(() => vi.advanceTimersByTime(3000));
  expect(useAppStore.getState()).toMatchObject({ animationPhase: 'idle', cinematicPlayed: false });
});

it('cancels the previous outro and delayed reset when restarted', () => {
  vi.useFakeTimers();
  const store = useAppStore.getState();
  store.reset();
  store.setSettings({ language: 'en' });
  store.setPlayback({ isPlaying: true, currentTime: 14999, progress: 0.999 });
  store.setCinematicPlayed(true);
  store.setAnimationPhase('playing');
  render(<PlaybackProvider><PlaybackControls /></PlaybackProvider>);
  act(() => vi.advanceTimersByTime(100));
  expect(useAppStore.getState().animationPhase).toBe('outro');
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  act(() => vi.advanceTimersByTime(7000));
  expect(useAppStore.getState()).toMatchObject({ animationPhase: 'idle', cinematicPlayed: false });
  expect(useAppStore.getState().playback).toMatchObject({ isPlaying: false, progress: 0 });
});
