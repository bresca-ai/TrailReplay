import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const muxerState = vi.hoisted(() => ({
  flushes: 0,
  options: null as { fastStart?: unknown } | null,
  videoFrameInit: null as VideoFrameInit | null,
  probedConfigs: [] as VideoEncoderConfig[],
  configuredConfig: null as VideoEncoderConfig | null,
  emitChunks: true,
}));

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
    muxerState.videoFrameInit = null;
    muxerState.flushes = 0;
    muxerState.probedConfigs = [];
    muxerState.configuredConfig = null;
    muxerState.emitChunks = true;

    class VideoEncoderStub {
      static async isConfigSupported(config: VideoEncoderConfig) {
        muxerState.probedConfigs.push(config);
        return { supported: true, config };
      }

      private readonly init: VideoEncoderInit;
      encodeQueueSize = 0;
      state: CodecState = 'configured';

      constructor(init: VideoEncoderInit) {
        this.init = init;
      }

      configure(config: VideoEncoderConfig) { muxerState.configuredConfig = config; }
      encode() {
        if (muxerState.emitChunks) this.init.output({} as EncodedVideoChunk, {});
      }
      async flush() { muxerState.flushes += 1; }
      close() { this.state = 'closed'; }
    }

    class VideoFrameStub {
      constructor(_source: CanvasImageSource, init: VideoFrameInit) {
        muxerState.videoFrameInit = init;
      }

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

    await encoder?.encodeCanvas({} as HTMLCanvasElement, 0, 200_000);
    expect(muxerState.videoFrameInit?.duration).toBe(200_000);
  });

  it('reserves Fast Start metadata only when a frame-count bound is provided', async () => {
    await createMp4CanvasEncoder({
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 10_000_000,
      expectedFrameCount: 900,
    });

    expect(muxerState.options?.fastStart).toEqual({ expectedVideoChunks: 900 });
  });

  it('requests quality VBR with discarded alpha and exposes the selected config', async () => {
    const encoder = await createMp4CanvasEncoder({
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 30_000_000,
    });

    expect(muxerState.configuredConfig).toMatchObject({
      codec: 'avc1.64002A',
      latencyMode: 'quality',
      bitrateMode: 'variable',
      alpha: 'discard',
      framerate: 60,
    });
    expect(encoder?.config).toEqual(muxerState.configuredConfig);
  });

  it('caps 4K30 at H.264 Level 5.1 and rejects 4K60', async () => {
    const compatible = await createMp4CanvasEncoder({
      width: 3840,
      height: 2160,
      fps: 30,
      bitrate: 60_000_000,
    });
    expect(compatible?.config.codec).toBe('avc1.640033');
    expect(muxerState.probedConfigs.every(({ codec }) => !codec.endsWith('34'))).toBe(true);

    muxerState.probedConfigs = [];
    const unsupported = await createMp4CanvasEncoder({
      width: 3840,
      height: 2160,
      fps: 60,
      bitrate: 120_000_000,
    });
    expect(unsupported).toBeNull();
    expect(muxerState.probedConfigs).toEqual([]);
  });

  it('throws instead of silently skipping duplicate frames', async () => {
    const encoder = await createMp4CanvasEncoder({
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 10_000_000,
    });
    await encoder?.encodeCanvas({} as HTMLCanvasElement, 0);

    await expect(encoder?.encodeCanvas({} as HTMLCanvasElement, 0)).rejects.toThrow(
      'must be greater',
    );
  });

  it('fails finalization when the codec drops a submitted frame', async () => {
    muxerState.emitChunks = false;
    const encoder = await createMp4CanvasEncoder({
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 10_000_000,
    });
    await encoder?.encodeCanvas({} as HTMLCanvasElement, 0);

    await expect(encoder?.finalize()).rejects.toThrow(
      'submitted 1, encoded 0',
    );
  });

  it('flushes internal codec lookahead by raw-frame memory budget', async () => {
    const encoder = await createMp4CanvasEncoder({
      width: 2560,
      height: 1440,
      fps: 30,
      bitrate: 10_000_000,
    });

    // Four 2560x1440 RGBA frames are about 56 MiB; accepting the fourth frame
    // reaches the budget-derived batch size even though encodeQueueSize is 0.
    for (let frame = 1; frame <= 3; frame += 1) {
      await encoder?.encodeCanvas({} as HTMLCanvasElement, (frame - 1) * 1_000);
    }
    expect(muxerState.flushes).toBe(0);

    await encoder?.encodeCanvas({} as HTMLCanvasElement, 3_000);
    expect(muxerState.flushes).toBe(1);
  });
});
