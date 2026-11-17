import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildingRefreshScheduler } from './buildingRefreshScheduler';

afterEach(() => vi.useRealTimers());

describe('building refresh during replay and export', () => {
  it('refreshes after rendered moving poses and throttles live updates', () => {
    vi.useFakeTimers();
    let time = 0;
    const rebuild = vi.fn();
    const scheduler = createBuildingRefreshScheduler(rebuild, () => time);
    scheduler.schedule();
    scheduler.onRender();
    expect(rebuild).toHaveBeenCalledTimes(1);
    scheduler.schedule();
    time = 50;
    scheduler.onRender();
    expect(rebuild).toHaveBeenCalledTimes(1);
    time = 100;
    scheduler.onRender();
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(scheduler.isDirty()).toBe(false);
    scheduler.dispose();
  });

  it('prepares every new frozen studio frame without waiting for the live throttle', () => {
    vi.useFakeTimers();
    const rebuild = vi.fn();
    const scheduler = createBuildingRefreshScheduler(rebuild, () => 0);
    scheduler.schedule();
    scheduler.onRender();
    scheduler.schedule();
    scheduler.prepare();
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(scheduler.isDirty()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(rebuild).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });
});
