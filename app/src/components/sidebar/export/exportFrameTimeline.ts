export interface DeterministicPhaseFrame {
  elapsedMs: number;
  timestampMs: number;
}

export interface DeterministicHoldFrame extends DeterministicPhaseFrame {
  visualElapsedMs: number;
}

/**
 * Builds the fixed output-time grid for a camera phase.
 *
 * The first export phase owns its zero timestamp. Later phases exclude their
 * zero because it is already represented by the preceding phase's final
 * frame. That makes timestamps strictly increasing across phase boundaries.
 */
export function getDeterministicPhaseFrames(
  durationMs: number,
  timestampOffsetMs: number,
  fps: number,
  includeStartFrame: boolean,
): DeterministicPhaseFrame[] {
  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.ceil(durationMs / frameDurationMs));
  const firstFrameIndex = includeStartFrame ? 0 : 1;

  return Array.from(
    { length: frameCount - firstFrameIndex + 1 },
    (_, index) => {
      const elapsedMs = (firstFrameIndex + index) * frameDurationMs;
      return { elapsedMs, timestampMs: timestampOffsetMs + elapsedMs };
    },
  );
}

/**
 * Builds frames for a media hold following an already-encoded route frame.
 * Visual time may begin at zero, but encoded time begins one frame later so
 * the hold never reuses the route frame's timestamp.
 */
export function getDeterministicHoldFrames(
  durationMs: number,
  timestampOffsetMs: number,
  fps: number,
): DeterministicHoldFrame[] {
  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.ceil(durationMs / frameDurationMs));

  return Array.from({ length: frameCount }, (_, frameIndex) => {
    const elapsedMs = (frameIndex + 1) * frameDurationMs;
    const visualElapsedMs = frameCount === 1
      ? 0
      : (durationMs * frameIndex) / (frameCount - 1);
    return {
      elapsedMs,
      timestampMs: timestampOffsetMs + elapsedMs,
      visualElapsedMs,
    };
  });
}
