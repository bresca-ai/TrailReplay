import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const muxerState = vi.hoisted(() => ({ options: null as { fastStart?: unknown } | null }));

vi.mock('mp4-muxer', () => {
  class ArrayBufferTarget {
    buffer = new ArrayBuffer(0);
  }

  class Muxer {
    target: ArrayBufferTarget;

    constructor(options: { target: ArrayBufferTarget; fastStart?: unknown }) {
      muxerState.options = options;
      this.target = options.target;
    }

    addVideoChunk() {}
    finalize() {}
  }

  return { ArrayBufferTarget, Muxer };
});

import { createMp4CanvasEncoder } from './mp4CanvasEncoder';

describe('createMp4CanvasEncoder', () => {
  beforeEach(() => {
    muxerState.options = null;

    class VideoEncoderStub {
      static async isConfigSupported(config: VideoEncoderConfig) {
        return { supported: true, config };
      }

      encodeQueueSize = 0;
      state: CodecState = 'configured';
      configure() {}
      encode() {}
      async flush() {}
      close() { this.state = 'closed'; }
    }

    class VideoFrameStub {
      close() {}
    }

    vi.stubGlobal('VideoEncoder', VideoEncoderStub);
    vi.stubGlobal('VideoFrame', VideoFrameStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes chunks immediately instead of retaining the whole export for Fast Start', async () => {
    const encoder = await createMp4CanvasEncoder({
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 10_000_000,
    });

    expect(encoder).not.toBeNull();
    expect(muxerState.options?.fastStart).toBe(false);
  });
});
