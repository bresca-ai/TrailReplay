import { describe, expect, it, vi } from 'vitest';
import { drawActionVideo, getBlockPixelRect, getObjectFitDrawRect, sortBlocksForRender } from './replayCanvas';

describe('replay canvas helpers', () => {
  it('maps normalized blocks to clipped pixel rectangles', () => {
    expect(getBlockPixelRect({ x: -1, y: 0.25, width: 2, height: 2 }, 1000, 800)).toEqual({ x: 0, y: 200, width: 1000, height: 600 });
  });

  it('computes centered contain geometry and centered cover source cropping', () => {
    expect(getObjectFitDrawRect(1920, 1080, { x: 10, y: 20, width: 400, height: 400 }, 'contain')).toMatchObject({ x: 10, y: 107.5, width: 400, height: 225, sourceX: 0, sourceWidth: 1920 });
    expect(getObjectFitDrawRect(1920, 1080, { x: 0, y: 0, width: 400, height: 200 }, 'cover')).toMatchObject({ sourceX: 0, sourceY: 60, sourceWidth: 1920, sourceHeight: 960, width: 400, height: 200 });
  });

  it('sorts by z-index while preserving source order for ties', () => {
    const blocks = [{ id: 'a', zIndex: 2 }, { id: 'b', zIndex: 1 }, { id: 'c', zIndex: 2 }];
    expect(sortBlocksForRender(blocks).map((block) => block.id)).toEqual(['b', 'a', 'c']);
  });

  it('clips and paints the current video frame, with an optional background', () => {
    const calls: unknown[][] = [];
    const context = {
      save: vi.fn(() => calls.push(['save'])),
      restore: vi.fn(() => calls.push(['restore'])),
      beginPath: vi.fn(() => calls.push(['beginPath'])),
      rect: vi.fn((...args: number[]) => calls.push(['rect', ...args])),
      clip: vi.fn(() => calls.push(['clip'])),
      fillRect: vi.fn((...args: number[]) => calls.push(['fillRect', ...args])),
      drawImage: vi.fn((...args: unknown[]) => calls.push(['drawImage', ...args])),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    const video = { readyState: 4, videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;

    expect(drawActionVideo(context, video, { x: 5, y: 10, width: 400, height: 200 }, { background: '#000' })).toBe(true);
    expect(calls.map(([name]) => name)).toEqual(['save', 'fillRect', 'beginPath', 'rect', 'clip', 'drawImage', 'restore']);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 60, 1920, 960, 5, 10, 400, 200);
  });

  it('does not touch the context before a video has a decoded frame', () => {
    const context = { save: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(drawActionVideo(context, { readyState: 1, videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement, { x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    expect(context.save).not.toHaveBeenCalled();
  });
});
