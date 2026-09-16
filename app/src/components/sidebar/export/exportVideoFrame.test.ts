import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExportOverlayCapture } from './useExportOverlayCapture';

/**
 * A clip in an exported video used to come out as a still.
 *
 * Its decoded frame was baked into the html2canvas snapshot that carries the
 * popup chrome, and that snapshot is refreshed at most 12 times a second —
 * less whenever a capture is still running, which on the deterministic path
 * meant the awaited refresh returned immediately and the *previous* frame's
 * bitmap was reused. Whole holds were encoded from one decoded frame.
 *
 * The clip is now painted directly onto every encoded frame instead, so these
 * check that the draw happens per frame and never lands in the snapshot.
 */
describe('drawVideoFrame', () => {
  function renderCapture() {
    return renderHook(() => useExportOverlayCapture({
      elevationData: [],
      getStatsValues: () => ({}),
      includeElevation: false,
      includeStats: false,
    }));
  }

  function mountVideoPopup({ readyState = 4, videoWidth = 1920, videoHeight = 1080 } = {}) {
    const popup = document.createElement('div');
    popup.className = 'tr-video-popup';
    popup.getBoundingClientRect = () => new DOMRect(100, 100, 400, 300);
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: readyState, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: videoWidth, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: videoHeight, configurable: true });
    video.getBoundingClientRect = () => new DOMRect(100, 100, 400, 300);
    popup.appendChild(video);
    document.body.appendChild(popup);
    return { popup, video };
  }

  function fakeContext() {
    const drawn: unknown[] = [];
    return {
      drawn,
      context: { drawImage: (source: unknown) => drawn.push(source) } as unknown as CanvasRenderingContext2D,
    };
  }

  const metrics = {
    containerRect: new DOMRect(0, 0, 1000, 800),
    cropX: 0,
    cropY: 0,
    scaleToRecording: 2,
  };

  afterEach(() => {
    document.querySelectorAll('.tr-video-popup').forEach((element) => element.remove());
    vi.restoreAllMocks();
  });

  it('draws the clip element itself, so every encoded frame gets the current picture', () => {
    const { video } = mountVideoPopup();
    const { result } = renderCapture();
    const { context, drawn } = fakeContext();

    result.current.drawVideoFrame(context, metrics);

    expect(drawn).toEqual([video]);
  });

  it('draws again on the next call rather than reusing anything', () => {
    mountVideoPopup();
    const { result } = renderCapture();
    const { context, drawn } = fakeContext();

    result.current.drawVideoFrame(context, metrics);
    result.current.drawVideoFrame(context, metrics);

    expect(drawn).toHaveLength(2);
  });

  it('leaves the chrome alone when no frame has been decoded yet', () => {
    mountVideoPopup({ readyState: 0, videoWidth: 0 });
    const { result } = renderCapture();
    const { context, drawn } = fakeContext();

    result.current.drawVideoFrame(context, metrics);

    expect(drawn).toEqual([]);
  });

  it('does nothing when no clip is on screen', () => {
    const { result } = renderCapture();
    const { context, drawn } = fakeContext();

    result.current.drawVideoFrame(context, metrics);

    expect(drawn).toEqual([]);
  });

  /**
   * html2canvas would otherwise rasterize a black box where the clip is, and
   * a stale bitmap of it would sit under the live frame drawn on top.
   */
  it('keeps the clip out of the cached chrome snapshot', async () => {
    const { popup } = mountVideoPopup();
    const ignoredTags: string[] = [];
    const capture = vi.fn(async (_element: HTMLElement, options: { ignoreElements?: (element: Element) => boolean }) => {
      popup.querySelectorAll('*').forEach((child) => {
        if (options.ignoreElements?.(child)) ignoredTags.push(child.tagName);
      });
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      return canvas;
    });
    vi.stubGlobal('html2canvas', capture);
    // jsdom has no 2d context, and the overlay bails out without one.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      { drawImage: () => {} } as unknown as CanvasRenderingContext2D,
    );

    const container = document.createElement('div');
    container.id = 'map-capture-container';
    container.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);
    document.body.appendChild(container);

    const { result } = renderCapture();
    await result.current.updateOverlayAsync(1920, 1080);

    expect(ignoredTags).toContain('VIDEO');
    container.remove();
    vi.unstubAllGlobals();
  });
});
