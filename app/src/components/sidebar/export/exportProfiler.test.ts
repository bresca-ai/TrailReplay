import { describe, expect, it } from 'vitest';
import { exportProfilerTestUtils } from './exportProfiler';

describe('export profiler statistics', () => {
  it('returns stable zeroes for an empty stage', () => {
    expect(exportProfilerTestUtils.stageStats([])).toEqual({
      count: 0,
      meanMs: 0,
      p95Ms: 0,
      totalMs: 0,
    });
  });

  it('reports total, mean and nearest-rank p95', () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(exportProfilerTestUtils.stageStats(values)).toEqual({
      count: 20,
      meanMs: 10.5,
      p95Ms: 19,
      totalMs: 210,
    });
  });

  it('clamps percentile requests to the available sample', () => {
    expect(exportProfilerTestUtils.percentile([3, 1, 2], 2)).toBe(3);
    expect(exportProfilerTestUtils.percentile([3, 1, 2], -1)).toBe(1);
  });
});
