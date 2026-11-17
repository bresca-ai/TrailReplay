import { useEffect } from 'react';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { installProbeBridge } from '@/utils/probeBridge';
import { northbound } from '@/utils/story/storyTestFixtures';
import { StoryPreviewHost } from './StoryPreviewHost';
import { useStoryPreview } from './storyPreview';
import type { StoryViewProps } from './view/StoryView';

const reader = vi.hoisted(() => ({ fails: false }));

vi.mock('./view/StoryView', () => ({
  StoryView: ({ story, onExit, onDebugFrame }: StoryViewProps) => {
    if (reader.fails) throw new Error('WebGL is not available');
    useEffect(() => { onDebugFrame?.({ ms: 1 } as never); }, [onDebugFrame]);
    return (
      <div>
        <div tabIndex={0} data-story-scroller="" data-testid="scroller">{story.title}</div>
        <button type="button" onClick={onExit}>Exit story</button>
      </div>
    );
  },
}));

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ language: 'en' });
  useAppStore.getState().addTrack(northbound('Ridge', 42, 1));
  useAppStore.getState().updateStory({ type: 'setCover', title: 'Ridge day' });
  useStoryPreview.setState({ isOpen: false, trigger: null });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  reader.fails = false;
  vi.restoreAllMocks();
});

async function openFrom(trigger: HTMLElement) {
  act(() => useStoryPreview.getState().open(trigger));
  return screen.findByTestId('scroller');
}

describe('story preview host', () => {
  it('opens the reader on its scroller, closes on Escape and returns focus to the trigger', async () => {
    const onOpen = vi.fn();
    render(<><button type="button">Preview story</button><StoryPreviewHost onOpen={onOpen} /></>);
    const trigger = screen.getByRole('button', { name: 'Preview story' });

    const scroller = await openFrom(trigger);
    expect(onOpen).toHaveBeenCalled();
    expect(scroller).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Ridge day' })).toHaveAttribute('open');

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(useStoryPreview.getState().isOpen).toBe(false);
    expect(screen.queryByTestId('scroller')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes from the exit button', async () => {
    render(<><button type="button">Preview story</button><StoryPreviewHost onOpen={() => {}} /></>);
    await openFrom(screen.getByRole('button', { name: 'Preview story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit story' }));
    expect(screen.queryByTestId('scroller')).toBeNull();
  });

  it('keeps keys and file drops inside the dialog away from window and document listeners', async () => {
    const windowKeys = vi.fn();
    const documentDrops = vi.fn();
    window.addEventListener('keydown', windowKeys);
    document.addEventListener('drop', documentDrops);
    render(<><button type="button">Preview story</button><StoryPreviewHost onOpen={() => {}} /></>);
    const trigger = screen.getByRole('button', { name: 'Preview story' });
    const scroller = await openFrom(trigger);

    fireEvent.keyDown(scroller, { key: ' ' });
    fireEvent.keyDown(scroller, { key: 'z', metaKey: true });
    expect(windowKeys).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(windowKeys).toHaveBeenCalledTimes(1);

    for (const make of [createEvent.dragOver, createEvent.drop]) {
      const event = make(scroller);
      fireEvent(scroller, event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(documentDrops).not.toHaveBeenCalled();
    window.removeEventListener('keydown', windowKeys);
    document.removeEventListener('drop', documentDrops);
  });

  it('closes the preview with a notice when the reader fails, leaving the editor mounted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notice = vi.spyOn(toast, 'error');
    reader.fails = true;
    render(<><p>Editor with unsaved work</p><button type="button">Preview story</button><StoryPreviewHost onOpen={() => {}} /></>);

    act(() => useStoryPreview.getState().open(screen.getByRole('button', { name: 'Preview story' })));
    await vi.waitFor(() => expect(useStoryPreview.getState().isOpen).toBe(false));
    expect(notice).toHaveBeenCalledWith('The story preview could not be opened.', expect.anything());
    expect(screen.getByText('Editor with unsaved work')).toBeInTheDocument();

    reader.fails = false;
    act(() => useStoryPreview.getState().open(screen.getByRole('button', { name: 'Preview story' })));
    expect(await screen.findByTestId('scroller')).toBeInTheDocument();
  });

  it('pauses again once the reader shows, because playback can restart while its chunk loads', async () => {
    // A fresh module graph, so React.lazy has not cached the dialog chunk and its import is really pending.
    vi.resetModules();
    const [{ StoryPreviewHost: FreshHost }, { useStoryPreview: freshPreview }, { useAppStore: freshStore }] = await Promise.all([
      import('./StoryPreviewHost'), import('./storyPreview'), import('@/store/useAppStore'),
    ]);
    freshStore.getState().addTrack(northbound('Ridge', 42, 1));
    let playing = true;
    render(<FreshHost onOpen={() => { playing = false; }} />);

    act(() => freshPreview.getState().open(document.body));
    expect(playing).toBe(false);
    expect(screen.queryByTestId('scroller')).toBeNull();
    playing = true;
    await screen.findByTestId('scroller');
    expect(playing).toBe(false);
  });

  it('exposes the preview on the probe bridge under ?probe=1, even when the bridge installs after the host', async () => {
    window.history.replaceState(null, '', '/?probe=1');
    render(<StoryPreviewHost onOpen={() => {}} />);
    const uninstall = installProbeBridge();
    const probe = window.__trailreplay?.story;

    expect(probe?.isOpen()).toBe(false);
    act(() => probe?.open());
    const scroller = await screen.findByTestId('scroller');
    expect(probe?.isOpen()).toBe(true);
    expect(probe?.last()).toMatchObject({ ms: 1, scroller });
    act(() => probe?.close());
    expect(screen.queryByTestId('scroller')).toBeNull();
    uninstall();
  });
});
