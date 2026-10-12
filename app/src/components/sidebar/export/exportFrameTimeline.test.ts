import { describe, expect, it } from 'vitest';
import { getDeterministicHoldFrames, getDeterministicPhaseFrames } from './exportFrameTimeline';

describe('getDeterministicPhaseFrames', () => {
  it('includes time zero for the opening phase', () => {
    const frames = getDeterministicPhaseFrames(100, 0, 30, true);

    expect(frames[0]).toEqual({ elapsedMs: 0, timestampMs: 0 });
    expect(frames.at(-1)?.timestampMs).toBeCloseTo(100);
  });

  it('excludes a boundary timestamp already owned by the prior phase', () => {
    const previousTimestampMs = 1500;
    const frames = getDeterministicPhaseFrames(3000, previousTimestampMs, 30, false);

    expect(frames[0].timestampMs).toBeGreaterThan(previousTimestampMs);
    expect(frames[0].elapsedMs).toBeCloseTo(1000 / 30);
    expect(frames.at(-1)?.timestampMs).toBeCloseTo(4500);
  });

  it('keeps every timestamp strictly increasing', () => {
    const frames = getDeterministicPhaseFrames(1550, 4200, 60, false);

    frames.slice(1).forEach((frame, index) => {
      expect(frame.timestampMs).toBeGreaterThan(frames[index].timestampMs);
    });
  });
});

describe('getDeterministicHoldFrames', () => {
  it('starts visual media at zero without duplicating the preceding timestamp', () => {
    const frames = getDeterministicHoldFrames(3000, 5000, 30);

    expect(frames[0].visualElapsedMs).toBe(0);
    expect(frames[0].timestampMs).toBeGreaterThan(5000);
    expect(frames[0].timestampMs).toBeCloseTo(5000 + (1000 / 30));
  });

  it('ends on the media endpoint and advances encoded duration to its last frame', () => {
    const frames = getDeterministicHoldFrames(3010, 5000, 30);

    expect(frames.at(-1)?.visualElapsedMs).toBe(3010);
    expect(frames.at(-1)?.elapsedMs).toBeCloseTo(Math.ceil(3010 / (1000 / 30)) * (1000 / 30));
  });
});
