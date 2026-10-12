import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export interface Mp4CanvasEncoderOptions {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  /** Upper bound used to reserve Fast Start metadata without retaining media. */
  expectedFrameCount?: number;
}

export interface Mp4CanvasEncoder {
  /** The exact WebCodecs configuration selected after capability probing. */
  readonly config: Readonly<VideoEncoderConfig>;
  /**
   * Encode the current contents of the canvas at the given presentation time
   * (microseconds on the output timeline). Deterministic exports pass the fixed
   * frame timestamp, while the legacy recorder path uses elapsed wall time.
   */
  encodeCanvas(canvas: HTMLCanvasElement, timestampMicros: number, durationMicros?: number): Promise<void>;
  /** Number of frames still queued in the encoder (for backpressure decisions). */
  pendingFrames(): number;
  /** Flush, mux and return the finished MP4 as a Blob. */
  finalize(): Promise<Blob>;
  /** Abort without producing a file (e.g. on cancel). */
  close(): void;
}

// Hardware H.264 encoding produces a clean, seekable MP4 with a real moov/duration,
// which avoids the "freezes after the first fragment" problem of MediaRecorder fMP4.
export function isWebCodecsMp4Supported(): boolean {
  return typeof window !== 'undefined'
    && typeof VideoEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined';
}

interface AvcLevel {
  idc: number;
  maxMacroblocksPerFrame: number;
  maxMacroblocksPerSecond: number;
}

// Windows' native H.264 decoder supports up to Level 5.1. Do not advertise
// 5.2: even when a browser encoder accepts it, the resulting MP4 is not part of
// our Windows compatibility contract.
const WINDOWS_AVC_LEVELS: AvcLevel[] = [
  { idc: 0x1f, maxMacroblocksPerFrame: 3_600, maxMacroblocksPerSecond: 108_000 }, // 3.1
  { idc: 0x20, maxMacroblocksPerFrame: 5_120, maxMacroblocksPerSecond: 216_000 }, // 3.2
  { idc: 0x28, maxMacroblocksPerFrame: 8_192, maxMacroblocksPerSecond: 245_760 }, // 4.0
  { idc: 0x2a, maxMacroblocksPerFrame: 8_704, maxMacroblocksPerSecond: 522_240 }, // 4.2
  { idc: 0x32, maxMacroblocksPerFrame: 22_080, maxMacroblocksPerSecond: 589_824 }, // 5.0
  { idc: 0x33, maxMacroblocksPerFrame: 36_864, maxMacroblocksPerSecond: 983_040 }, // 5.1
];

// H.264 codec strings from the lowest valid level upward, probing High, Main,
// then Constrained Baseline at each level. A request outside Level 5.1 limits
// (notably 4K60) returns no candidates instead of producing a misleading file.
export function getAvcCodecCandidates(width: number, height: number, fps: number): string[] {
  if (![width, height, fps].every((value) => Number.isFinite(value) && value > 0)) return [];

  const macroblocksPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const macroblocksPerSecond = macroblocksPerFrame * fps;
  const firstValidLevel = WINDOWS_AVC_LEVELS.findIndex((level) => (
    macroblocksPerFrame <= level.maxMacroblocksPerFrame
    && macroblocksPerSecond <= level.maxMacroblocksPerSecond
  ));
  if (firstValidLevel < 0) return [];

  return WINDOWS_AVC_LEVELS.slice(firstValidLevel).flatMap(({ idc }) => {
    const level = idc.toString(16).padStart(2, '0').toUpperCase();
    return [`avc1.6400${level}`, `avc1.4D40${level}`, `avc1.42E0${level}`];
  });
}

async function resolveSupportedConfig(
  options: Mp4CanvasEncoderOptions
): Promise<VideoEncoderConfig | null> {
  for (const codec of getAvcCodecCandidates(options.width, options.height, options.fps)) {
    const config: VideoEncoderConfig = {
      codec,
      width: options.width,
      height: options.height,
      bitrate: options.bitrate,
      framerate: options.fps,
      avc: { format: 'avc' },
      // Export is allowed to take longer than playback. Prefer preserving every
      // submitted frame over the low-latency behaviour useful for live video.
      latencyMode: 'quality',
      bitrateMode: 'variable',
      alpha: 'discard',
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return config;
    } catch {
      // Try the next candidate codec.
    }
  }
  return null;
}

export async function createMp4CanvasEncoder(
  options: Mp4CanvasEncoderOptions
): Promise<Mp4CanvasEncoder | null> {
  if (!isWebCodecsMp4Supported()) return null;

  const config = await resolveSupportedConfig(options);
  if (!config) return null;

  const expectedFrameCount = options.expectedFrameCount;
  const fastStart = Number.isSafeInteger(expectedFrameCount) && expectedFrameCount! > 0
    ? { expectedVideoChunks: expectedFrameCount }
    : false;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: options.width,
      height: options.height,
      // No frameRate: timestamps are real elapsed time (variable spacing), so we
      // don't want the muxer snapping them to a fixed fps grid.
    },
    // Never use `in-memory`: it retains every media chunk and previously caused
    // severe memory pressure on long exports. When the caller can provide a
    // safe chunk-count upper bound, mp4-muxer reserves only lightweight moov
    // metadata at the front; otherwise this remains a regular, seekable MP4
    // with moov at the end.
    fastStart,
    // Deterministic exports own their media clock and must begin at zero. Strict
    // mode catches timeline regressions instead of hiding them in the muxer.
    firstTimestampBehavior: 'strict',
  });

  let encoderError: Error | null = null;
  let submittedFrameCount = 0;
  let encodedChunkCount = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
        encodedChunkCount += 1;
      } catch (error) {
        encoderError = error instanceof Error ? error : new Error(String(error));
      }
    },
    error: (error) => {
      encoderError = error instanceof Error ? error : new Error(String(error));
    },
  });
  encoder.configure(config);

  const frameDurationMicros = Math.round(1_000_000 / options.fps);
  const keyFrameIntervalMicros = 2_000_000; // Force a keyframe at least every 2s.
  // `encodeQueueSize` only counts encode requests that the codec has not yet
  // accepted. It does not count raw frames retained inside the hardware
  // encoder for quality-mode lookahead. Those frames keep their GPU-backed
  // canvas copies alive even after our VideoFrame wrapper is closed. Bound
  // that hidden pipeline by flushing after roughly 64 MiB of submitted RGBA
  // pixels (and at least every eight frames for smaller exports).
  const rawFrameBytes = options.width * options.height * 4;
  const maxFramesBetweenFlushes = Math.max(
    1,
    Math.min(8, Math.floor((64 * 1024 * 1024) / rawFrameBytes)),
  );
  let lastTimestampMicros = -1;
  let lastKeyframeMicros = -keyFrameIntervalMicros;
  let framesSinceFlush = 0;
  let finalized = false;

  return {
    config: Object.freeze({ ...config }),
    async encodeCanvas(canvas, timestampMicros, durationMicros = frameDurationMicros) {
      if (finalized) throw new Error('Cannot encode a frame after the MP4 encoder has finished');
      if (encoderError) throw encoderError;
      if (encoder.state !== 'configured') {
        throw new Error(`Cannot encode a frame while the video encoder is ${encoder.state}`);
      }

      if (!Number.isFinite(timestampMicros)) throw new Error('Frame timestamp must be finite');
      if (!Number.isFinite(durationMicros) || durationMicros <= 0) {
        throw new Error('Frame duration must be a positive finite number');
      }
      const timestamp = Math.max(0, Math.round(timestampMicros));
      if (timestamp <= lastTimestampMicros) {
        throw new Error(`Frame timestamp ${timestamp} must be greater than ${lastTimestampMicros}`);
      }

      const keyFrame = timestamp - lastKeyframeMicros >= keyFrameIntervalMicros;

      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: Math.max(1, Math.round(durationMicros)),
      });
      try {
        encoder.encode(frame, { keyFrame });
        lastTimestampMicros = timestamp;
        if (keyFrame) lastKeyframeMicros = timestamp;
        submittedFrameCount += 1;
      } finally {
        frame.close();
      }
      framesSinceFlush += 1;

      // A fixed-frame export must never turn encoder pressure into a missing
      // output frame. `flush()` emits internal pending output as well as queued
      // requests, releasing the codec's references to the submitted canvases.
      // The queue-size condition remains useful on unusually slow encoders;
      // the frame budget handles fast-accepting encoders with deep lookahead.
      if (encoder.encodeQueueSize >= 8 || framesSinceFlush >= maxFramesBetweenFlushes) {
        await encoder.flush();
        framesSinceFlush = 0;
        if (encoderError) throw encoderError;
      }
    },
    pendingFrames() {
      return encoder.encodeQueueSize;
    },
    async finalize() {
      if (finalized) throw new Error('The MP4 encoder has already finished');
      finalized = true;
      try {
        await encoder.flush();
        if (encoderError) throw encoderError;
        if (encodedChunkCount !== submittedFrameCount) {
          throw new Error(
            `Video encoder dropped frames: submitted ${submittedFrameCount}, encoded ${encodedChunkCount}`,
          );
        }
        muxer.finalize();
        return new Blob([muxer.target.buffer], { type: 'video/mp4' });
      } finally {
        if (encoder.state !== 'closed') encoder.close();
      }
    },
    close() {
      finalized = true;
      try {
        if (encoder.state !== 'closed') encoder.close();
      } catch {
        // Already closed.
      }
    },
  };
}
