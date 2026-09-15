import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoProbeResult } from '@/utils/videoMetadata';
import type { NormalizedPhotoMetadata } from '@/utils/photoMetadata';

const toastError = vi.fn();
const toastWarning = vi.fn();
const readVideoDuration = vi.fn<(url: string) => Promise<VideoProbeResult>>();
const readVideoMetadata = vi.fn<(file: File) => Promise<NormalizedPhotoMetadata>>();

vi.mock('sonner', () => ({
  toast: { error: toastError, warning: toastWarning, success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }));

vi.mock('@/utils/videoMetadata', () => ({
  readVideoDuration: (url: string) => readVideoDuration(url),
  readVideoMetadata: (file: File) => readVideoMetadata(file),
}));

const { useAppStore } = await import('@/store/useAppStore');
const { useVideos } = await import('./useVideos');

/**
 * Issue #104: every clip handed to the Media panel was dropped without an
 * entry, an error, or a loading state. These lock in the two outcomes that
 * replaced that silence — a clip the browser cannot decode says so, and a clip
 * the route cannot place still lands in the replay.
 */
describe('useVideos', () => {
  const initialState = useAppStore.getState();

  beforeEach(() => {
    useAppStore.setState(initialState, true);
    toastError.mockClear();
    toastWarning.mockClear();
    readVideoDuration.mockReset();
    readVideoMetadata.mockReset();
    readVideoMetadata.mockResolvedValue({});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:clip'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a clip the browser cannot decode instead of dropping it silently', async () => {
    readVideoDuration.mockResolvedValue({ status: 'unsupported' });
    const { result } = renderHook(() => useVideos());

    await act(async () => {
      await result.current.addVideos([new File(['x'], 'descent.mp4', { type: 'video/mp4' })]);
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().videos).toHaveLength(0);
  });

  it('keeps a clip the route cannot place, at the playhead, and says so', async () => {
    readVideoDuration.mockResolvedValue({ status: 'ok', durationSeconds: 12 });
    useAppStore.setState((state) => {
      state.playback.progress = 0.42;
    });
    const { result } = renderHook(() => useVideos());

    await act(async () => {
      await result.current.addVideos([new File(['x'], 'summit.mp4', { type: 'video/mp4' })]);
    });

    const [video] = useAppStore.getState().videos;
    expect(video).toMatchObject({
      progress: 0.42,
      placementSource: 'manual',
      durationSeconds: 12,
      isPlaceholder: false,
    });
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  /**
   * A clip whose length the browser has not decoded yet — a hidden tab defers
   * media loading indefinitely — is not a broken clip. It is imported without a
   * duration, which the popup reads back off the element that plays it.
   */
  it('imports a clip whose duration is not known yet', async () => {
    readVideoDuration.mockResolvedValue({ status: 'unknown' });
    const { result } = renderHook(() => useVideos());

    await act(async () => {
      await result.current.addVideos([new File(['x'], 'ridge.mp4', { type: 'video/mp4' })]);
    });

    expect(useAppStore.getState().videos).toHaveLength(1);
    expect(useAppStore.getState().videos[0].durationSeconds).toBeUndefined();
    expect(toastError).not.toHaveBeenCalled();
  });

  /** iOS hands `.mov` over with an empty `file.type` on some platforms. */
  it('accepts a clip the browser gives no MIME type for', async () => {
    readVideoDuration.mockResolvedValue({ status: 'ok', durationSeconds: 3 });
    const { result } = renderHook(() => useVideos());

    await act(async () => {
      await result.current.addVideos([new File(['x'], 'IMG_4312.MOV', { type: '' })]);
    });

    expect(useAppStore.getState().videos).toHaveLength(1);
  });
});
