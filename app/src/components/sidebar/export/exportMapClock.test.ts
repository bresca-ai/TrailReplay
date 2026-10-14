import { describe, expect, it, vi } from 'vitest';
import { createExportMapClock } from './exportMapClock';

describe('createExportMapClock', () => {
  it('anchors output time to MapLibre current time instead of rewinding to zero', () => {
    const setNow = vi.fn();
    const clock = createExportMapClock({ now: () => 42_000, restoreNow: vi.fn(), setNow });

    clock.setOutputTime(0);
    clock.setOutputTime(1000 / 30);

    expect(setNow).toHaveBeenNthCalledWith(1, 42_000);
    expect(setNow).toHaveBeenNthCalledWith(2, 42_000 + (1000 / 30));
  });

  it('keeps one origin until restore, then takes a fresh origin', () => {
    const now = vi.fn()
      .mockReturnValueOnce(10_000)
      .mockReturnValueOnce(90_000);
    const restoreNow = vi.fn();
    const setNow = vi.fn();
    const clock = createExportMapClock({ now, restoreNow, setNow });

    clock.setOutputTime(0);
    clock.setOutputTime(500);
    clock.restore();
    clock.setOutputTime(0);

    expect(now).toHaveBeenCalledTimes(2);
    expect(restoreNow).toHaveBeenCalledOnce();
    expect(setNow.mock.calls).toEqual([[10_000], [10_500], [90_000]]);
  });

  it('does not restore an inactive clock', () => {
    const restoreNow = vi.fn();
    const clock = createExportMapClock({ now: () => 0, restoreNow, setNow: vi.fn() });

    clock.restore();

    expect(restoreNow).not.toHaveBeenCalled();
  });
});
