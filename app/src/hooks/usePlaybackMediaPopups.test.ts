import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { PictureAnnotation, VideoAnnotation } from '@/types';
import { usePlaybackMediaPopups } from './usePlaybackMediaPopups';

const picture: PictureAnnotation = {
  id: 'photo-1', file: null, url: 'blob:photo-1', isPlaceholder: false, progress: 0.5, position: 0.5, displayDuration: 3000,
};
const clip: VideoAnnotation = { id: 'video-1', file: null, url: 'blob:video-1', isPlaceholder: false, progress: 0.5 };
const originalPlay = useAppStore.getState().play;

beforeEach(() => useAppStore.getState().reset());
afterEach(() => { cleanup(); useAppStore.setState({ play: originalPlay }); });

function moveTo(progress: number, isPlaying = useAppStore.getState().playback.isPlaying) {
  act(() => useAppStore.setState((state) => ({ playback: { ...state.playback, progress, isPlaying } })));
}

describe('cancelHolds', () => {
  it('ends a photo and clip hold without ever resuming playback', () => {
    const play = vi.fn();
    useAppStore.setState({ pictures: [picture], videos: [clip], animationPhase: 'playing', play });
    moveTo(0.4, true);
    const { result } = renderHook(() => usePlaybackMediaPopups());

    moveTo(0.51);
    expect(result.current.activePicture?.id).toBe('photo-1');
    expect(useAppStore.getState().selectedVideoId).toBe('video-1');
    expect(useAppStore.getState().playback.isPlaying).toBe(false);

    act(() => result.current.cancelHolds());
    expect(result.current.activePicture).toBeUndefined();
    expect(result.current.activeVideo).toBeUndefined();
    expect(useAppStore.getState().selectedVideoId).toBeNull();

    act(() => { result.current.closeActivePicture(); result.current.closeActiveVideo(); });
    expect(play).not.toHaveBeenCalled();
    expect(useAppStore.getState().playback.isPlaying).toBe(false);
  });

  it('drops queued photos, so the next photo shown is the next one reached', () => {
    const at = (id: string, progress: number) => ({ ...picture, id, url: `blob:${id}`, progress, position: progress });
    useAppStore.setState({ pictures: [at('photo-1', 0.5), at('photo-2', 0.5), at('photo-3', 0.7)], animationPhase: 'playing', play: vi.fn() });
    moveTo(0.4, true);
    const { result } = renderHook(() => usePlaybackMediaPopups());

    moveTo(0.51);
    expect(result.current.activePicture?.id).toBe('photo-1');
    act(() => result.current.cancelHolds());

    moveTo(0.69, true);
    moveTo(0.71);
    expect(result.current.activePicture?.id).toBe('photo-3');
  });

  it('drops queued clips, so the next clip shown is the next one reached', () => {
    const at = (id: string, progress: number) => ({ ...clip, id, url: `blob:${id}`, progress });
    useAppStore.setState({ videos: [at('video-1', 0.5), at('video-2', 0.5), at('video-3', 0.7)], animationPhase: 'playing', play: vi.fn() });
    moveTo(0.4, true);
    const { result } = renderHook(() => usePlaybackMediaPopups());

    moveTo(0.51);
    expect(result.current.activeVideo?.id).toBe('video-1');
    act(() => result.current.cancelHolds());

    moveTo(0.69, true);
    moveTo(0.71);
    expect(result.current.activeVideo?.id).toBe('video-3');
  });

  it('closes a photo the user opened and does not treat a clip opened later by hand as a hold', () => {
    useAppStore.setState({ videos: [clip], animationPhase: 'playing', play: vi.fn() });
    moveTo(0.4, true);
    const { result } = renderHook(() => usePlaybackMediaPopups());
    moveTo(0.51);
    expect(result.current.autoVideoId).toBe('video-1');
    act(() => useAppStore.setState({ pictures: [picture], selectedPictureId: 'photo-1' }));
    expect(result.current.activePicture?.id).toBe('photo-1');

    act(() => result.current.cancelHolds());
    expect(result.current.activePicture).toBeUndefined();

    act(() => useAppStore.getState().setSelectedVideoId('video-1'));
    expect(result.current.activeVideo?.id).toBe('video-1');
    expect(result.current.autoVideoId).toBeNull();
  });
});
