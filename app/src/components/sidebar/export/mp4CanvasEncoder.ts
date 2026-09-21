import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export interface Mp4CanvasEncoderOptions {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export interface Mp4CanvasEncoder {
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

// H.264 codec strings from most to least capable. Higher resolutions need higher
// levels; we probe support and fall back so the export still works on machines
// whose encoder only offers baseline/main profiles.
function avcCandidates(width: number, height: number): string[] {
  const area = width * height;
  if (area > 1920 * 1080) {
    // 1440p / 4K: prefer High profile at level 5.1/5.2.
    return ['avc1.640034', 'avc1.640033', 'avc1.640028', 'avc1.4D4028', 'avc1.42E01E'];
  }
  return ['avc1.640028', 'avc1.4D4028', 'avc1.42E01E', 'avc1.640033'];
}

async function resolveSupportedConfig(
  options: Mp4CanvasEncoderOptions
): Promise<VideoEncoderConfig | null> {
  for (const codec of avcCandidates(options.width, options.height)) {
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

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: options.width,
      height: options.height,
      // No frameRate: timestamps are real elapsed time (variable spacing), so we
      // don't want the muxer snapping them to a fixed fps grid.
    },
    // The export is delivered as a complete Blob, so progressive-download Fast
    // Start buys us nothing here. `in-memory` also retains every encoded media
    // chunk until finalize; annotation slowdowns add hundreds of frames apiece,
    // which made later annotations increasingly expensive as memory pressure
    // and garbage collection grew. Writing media into the target immediately
    // keeps only the output buffer and lightweight sample metadata alive. The
    // resulting regular MP4 remains seekable once the Blob is complete.
    fastStart: false,
    firstTimestampBehavior: 'offset',
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      encoderError = error instanceof Error ? error : new Error(String(error));
    },
  });
  encoder.configure(config);

  const frameDurationMicros = Math.round(1_000_000 / options.fps);
  const keyFrameIntervalMicros = 2_000_000; // Force a keyframe at least every 2s.
  let lastTimestampMicros = -1;
  let lastKeyframeMicros = -keyFrameIntervalMicros;
  let finalized = false;

  return {
    async encodeCanvas(canvas, timestampMicros, durationMicros = frameDurationMicros) {
      if (finalized || encoderError || encoder.state !== 'configured') return;

      // Timestamps must be strictly increasing; skip any non-advancing frame.
      const timestamp = Math.max(0, Math.round(timestampMicros));
      if (timestamp <= lastTimestampMicros) return;
      lastTimestampMicros = timestamp;

      const keyFrame = timestamp - lastKeyframeMicros >= keyFrameIntervalMicros;
      if (keyFrame) lastKeyframeMicros = timestamp;

      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: Math.max(1, Math.round(durationMicros)),
      });
      try {
        encoder.encode(frame, { keyFrame });
      } finally {
        frame.close();
      }

      // A fixed-frame export must never turn encoder pressure into a missing
      // output frame. Apply backpressure here and let export take longer.
      if (encoder.encodeQueueSize >= 8) {
        await encoder.flush();
        if (encoderError) throw encoderError;
      }
    },
    pendingFrames() {
      return encoder.encodeQueueSize;
    },
    async finalize() {
      finalized = true;
      await encoder.flush();
      if (encoderError) throw encoderError;
      muxer.finalize();
      if (encoder.state !== 'closed') encoder.close();
      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
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
