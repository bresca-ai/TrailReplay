import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { PictureAnnotation } from '@/types';
import { useStoryPreview } from '@/components/story/storyPreview';
import { northbound } from '@/utils/story/storyTestFixtures';
import App from './App';

// Stand-ins for what needs WebGL or a real layout; the wiring under test is App's own.
vi.mock('@/components/map/TrailMap', () => ({ TrailMap: () => null }));
vi.mock('@/components/sidebar/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/playback/PlaybackProvider', () => ({ PlaybackProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/story/view/StoryView', () => ({ StoryView: () => <div tabIndex={0} data-story-scroller="" data-testid="scroller" /> }));
vi.mock('@/components/annotations/PicturePopup', () => ({ PicturePopup: ({ picture }: { picture: PictureAnnotation }) => <p>holding {picture.id}</p> }));

const originalPlay = useAppStore.getState().play;
const photo: PictureAnnotation = {
  id: 'photo-1', file: null, url: 'blob:photo-1', isPlaceholder: false, progress: 0.5, position: 0.5, displayDuration: 3000,
};

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().addTrack(northbound('Ridge', 42, 1));
  useStoryPreview.setState({ isOpen: false, trigger: null });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useAppStore.setState({ play: originalPlay }); });

const setPlayback = (progress: number, isPlaying: boolean) =>
  act(() => useAppStore.setState((state) => ({ playback: { ...state.playback, progress, isPlaying } })));

it('pauses playback and ends a photo hold when the story preview opens, and never resumes it', async () => {
  const play = vi.fn();
  useAppStore.setState({ pictures: [photo], animationPhase: 'playing', play });
  render(<App />);

  setPlayback(0.4, true);
  act(() => useStoryPreview.getState().open(document.body));
  await screen.findByTestId('scroller');
  expect(useAppStore.getState().playback.isPlaying).toBe(false);
  act(() => useStoryPreview.getState().close());

  setPlayback(0.4, true);
  setPlayback(0.51, true);
  expect(screen.getByText('holding photo-1')).toBeInTheDocument();
  act(() => useStoryPreview.getState().open(document.body));
  await screen.findByTestId('scroller');
  expect(screen.queryByText('holding photo-1')).toBeNull();
  act(() => useStoryPreview.getState().close());

  expect(play).not.toHaveBeenCalled();
  expect(useAppStore.getState().playback.isPlaying).toBe(false);
});
