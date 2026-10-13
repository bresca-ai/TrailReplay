import { describe, expect, it } from 'vitest';
import type { ElevationFocusSection } from './elevationSections';
import {
  ELEVATION_FOCUS_TRANSITION_MS,
  getDynamicElevationViewport,
} from './dynamicElevationViewport';

function section(
  overrides: Partial<ElevationFocusSection> = {},
): ElevationFocusSection {
  return {
    id: 'climb-1',
    kind: 'climb',
    startProgress: 0.3,
    endProgress: 0.6,
    startDistance: 3_000,
    endDistance: 6_000,
    distance: 3_000,
    minElevation: 200,
    maxElevation: 400,
    elevationGain: 200,
    elevationLoss: 0,
    segmentIndex: 0,
    ...overrides,
  };
}

const baseInput = {
  totalDurationMs: 10_000,
  fullElevationMin: 100,
  fullElevationMax: 500,
  sections: [section()],
};

describe('dynamic elevation viewport', () => {
  it('stays in the full overview without usable timing or sections', () => {
    expect(getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 1_000,
      totalDurationMs: 0,
    })).toEqual({
      mode: 'overview',
      progressDomain: [0, 1],
      elevationDomain: [100, 500],
      focusAmount: 0,
      activeSection: null,
    });

    expect(getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 1_000,
      sections: [],
    }).mode).toBe('overview');
  });

  it('begins in overview, then enters the section 700ms before it starts', () => {
    expect(ELEVATION_FOCUS_TRANSITION_MS).toBe(700);
    expect(getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 2_299,
    }).mode).toBe('overview');

    const transitionStart = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 2_300,
    });
    expect(transitionStart.mode).toBe('transition-in');
    expect(transitionStart.focusAmount).toBe(0);
    expect(transitionStart.progressDomain).toEqual([0, 1]);
    expect(transitionStart.activeSection?.id).toBe('climb-1');
  });

  it('starts from overview and uses a 700ms entrance when a section begins at zero', () => {
    const fromStart = section({ startProgress: 0, endProgress: 0.2 });
    const firstFrame = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 0,
      sections: [fromStart],
    });
    expect(firstFrame.mode).toBe('overview');
    expect(firstFrame.focusAmount).toBe(0);
    expect(firstFrame.progressDomain).toEqual([0, 1]);
    expect(firstFrame.activeSection).toBeNull();

    const halfway = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 350,
      sections: [fromStart],
    });
    expect(halfway.mode).toBe('transition-in');
    expect(halfway.focusAmount).toBeCloseTo(0.5);

    const entered = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 700,
      sections: [fromStart],
    });
    expect(entered.mode).toBe('focused');
    expect(entered.focusAmount).toBe(1);
  });

  it('uses smoothstep interpolation for zoom-in and padded focus domains', () => {
    const halfway = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 2_650,
    });

    expect(halfway.mode).toBe('transition-in');
    expect(halfway.focusAmount).toBeCloseTo(0.5);
    expect(halfway.progressDomain[0]).toBeCloseTo(0.132);
    expect(halfway.progressDomain[1]).toBeCloseTo(0.818);
    expect(halfway.elevationDomain[0]).toBeCloseTo(138);
    expect(halfway.elevationDomain[1]).toBeCloseTo(462);

    const focused = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 3_000,
    });
    expect(focused.mode).toBe('focused');
    expect(focused.focusAmount).toBe(1);
    expect(focused.progressDomain[0]).toBeCloseTo(0.264);
    expect(focused.progressDomain[1]).toBeCloseTo(0.636);
    expect(focused.elevationDomain).toEqual([176, 424]);
  });

  it('remains focused through the section and smoothly returns to overview', () => {
    expect(getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 6_000,
    }).mode).toBe('focused');

    const halfway = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 6_350,
    });
    expect(halfway.mode).toBe('transition-out');
    expect(halfway.focusAmount).toBeCloseTo(0.5);
    expect(halfway.progressDomain[0]).toBeCloseTo(0.132);
    expect(halfway.progressDomain[1]).toBeCloseTo(0.818);

    const finished = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 6_700,
    });
    expect(finished.mode).toBe('overview');
    expect(finished.focusAmount).toBe(0);
    expect(finished.activeSection).toBeNull();
  });

  it('merges close same-segment sections into a stable visual focus group', () => {
    const first = section({
      id: 'first',
      startProgress: 0.2,
      endProgress: 0.3,
      minElevation: 150,
      maxElevation: 250,
    });
    const second = section({
      id: 'second',
      kind: 'descent',
      startProgress: 0.4,
      endProgress: 0.5,
      minElevation: 180,
      maxElevation: 350,
    });

    const between = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 3_600,
      sections: [second, first],
    });
    expect(between.mode).toBe('focused');
    expect(between.focusAmount).toBe(1);
    expect(between.progressDomain).toEqual([0.164, 0.536]);
    expect(between.elevationDomain).toEqual([126, 374]);
    expect(between.activeSection?.id).toBe('second');
  });

  it('returns to overview between sections whose transitions do not overlap', () => {
    const first = section({ id: 'first', startProgress: 0.1, endProgress: 0.2 });
    const second = section({ id: 'second', startProgress: 0.5, endProgress: 0.6 });

    const between = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 3_500,
      sections: [first, second],
    });
    expect(between.mode).toBe('overview');
    expect(between.activeSection).toBeNull();
  });

  it('does not combine close sections across route segment boundaries', () => {
    const first = section({
      id: 'first',
      startProgress: 0.2,
      endProgress: 0.3,
      segmentIndex: 0,
    });
    const second = section({
      id: 'second',
      startProgress: 0.35,
      endProgress: 0.45,
      segmentIndex: 1,
    });

    const atSecond = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 3_500,
      sections: [first, second],
    });
    expect(atSecond.mode).toBe('focused');
    expect(atSecond.activeSection?.id).toBe('second');
    expect(atSecond.progressDomain[0]).toBeCloseTo(0.338);
    expect(atSecond.progressDomain[1]).toBeCloseTo(0.462);
  });

  it('clamps playback time and focused domains to valid full-profile bounds', () => {
    const edgeSection = section({
      startProgress: -0.1,
      endProgress: 0.05,
      minElevation: 90,
      maxElevation: 520,
    });
    const beforeStart = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: -5_000,
      sections: [edgeSection],
    });
    expect(beforeStart).toEqual(getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 0,
      sections: [edgeSection],
    }));

    const result = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 500,
      sections: [edgeSection],
    });

    expect(result.mode).toBe('focused');
    expect(result.progressDomain[0]).toBe(0);
    expect(result.progressDomain[1]).toBeGreaterThan(0.05);
    expect(result.elevationDomain).toEqual([100, 500]);
  });

  it('normalizes reversed elevation limits and ignores malformed sections', () => {
    const result = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: Number.NaN,
      fullElevationMin: 500,
      fullElevationMax: 100,
      sections: [section({ startProgress: Number.NaN })],
    });

    expect(result).toEqual({
      mode: 'overview',
      progressDomain: [0, 1],
      elevationDomain: [100, 500],
      focusAmount: 0,
      activeSection: null,
    });
  });

  it('is deterministic when scrubbing backward and forward', () => {
    const atFourSeconds = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 4_000,
    });
    getDynamicElevationViewport({ ...baseInput, currentTimeMs: 9_000 });
    getDynamicElevationViewport({ ...baseInput, currentTimeMs: 500 });
    const afterScrubbing = getDynamicElevationViewport({
      ...baseInput,
      currentTimeMs: 4_000,
    });

    expect(afterScrubbing).toEqual(atFourSeconds);
  });
});
