import { describe, expect, it } from 'vitest';
import { isMapSettled, waitForSettledFrame, type SettleableMap } from './exportMapSettle';

function createMap(overrides: Partial<Record<keyof SettleableMap, () => never | boolean | void>> = {}) {
  return {
    areTilesLoaded: () => true,
    isMoving: () => false,
    isStyleLoaded: () => true,
    ...overrides,
  } as SettleableMap;
}

describe('isMapSettled', () => {
  it('is settled when tiles are loaded, the style is ready and the map is still', () => {
    expect(isMapSettled(createMap())).toBe(true);
  });

  it('is not settled while tiles are still loading', () => {
    expect(isMapSettled(createMap({ areTilesLoaded: () => false }))).toBe(false);
  });

  it('is not settled while the camera is moving', () => {
    expect(isMapSettled(createMap({ isMoving: () => true }))).toBe(false);
  });

  it('does not accept a void style readiness result', () => {
    expect(isMapSettled(createMap({ isStyleLoaded: () => undefined }))).toBe(false);
  });

  it('is not settled when the style reports false', () => {
    expect(isMapSettled(createMap({ isStyleLoaded: () => false }))).toBe(false);
  });

  it('can accept a moving camera whose animation clock is frozen', () => {
    expect(isMapSettled(createMap({ isMoving: () => true }), { allowMoving: true })).toBe(true);
  });
});

interface Harness {
  map: SettleableMap;
  options: Parameters<typeof waitForSettledFrame>[1];
  renders: () => number;
}

/**
 * `tilesLoadedByRender[n]` is what `areTilesLoaded()` returns after n renders,
 * so a test can describe tiles that arrive partway through the wait.
 */
function createHarness(tilesLoadedByRender: boolean[], timeoutMs = 1000): Harness {
  let renders = 0;
  let clock = 0;
  const map: SettleableMap = {
    areTilesLoaded: () => tilesLoadedByRender[Math.min(renders, tilesLoadedByRender.length - 1)],
    isMoving: () => false,
    isStyleLoaded: () => true,
  };
  return {
    map,
    renders: () => renders,
    options: {
      isCancelled: () => false,
      nextTask: async () => {},
      renderOnce: async () => { renders += 1; clock += 10; },
      now: () => clock,
      timeoutMs,
    },
  };
}

describe('waitForSettledFrame', () => {
  it('does not trust a stale settled reading taken before the new pose rendered', async () => {
    // Tiles read as loaded before any render (the previous pose's state) and
    // only genuinely finish after the third render. Returning early here is the
    // exact bug this guard exists to prevent.
    const harness = createHarness([true, false, false, true]);
    const result = await waitForSettledFrame(harness.map, harness.options);

    expect(result.timedOut).toBe(false);
    expect(harness.renders()).toBeGreaterThanOrEqual(3);
  });

  it('requires the settled state to survive a confirming render', async () => {
    const harness = createHarness([false, true, false, true, true]);
    const result = await waitForSettledFrame(harness.map, harness.options);

    expect(result.timedOut).toBe(false);
    // The reading at render 1 is contradicted at render 2, so the wait must
    // continue rather than encode that frame.
    expect(harness.renders()).toBeGreaterThan(2);
  });

  it('settles transition tiles while the frozen camera still reports moving', async () => {
    let renders = 0;
    const result = await waitForSettledFrame(
      createMap({ isMoving: () => true }),
      {
        allowMoving: true,
        isCancelled: () => false,
        nextTask: async () => {},
        renderOnce: async () => { renders += 1; },
        now: () => renders * 10,
        timeoutMs: 1000,
      },
    );

    expect(result.timedOut).toBe(false);
    expect(renders).toBe(2);
  });

  it('reports a timeout instead of hanging when tiles never arrive', async () => {
    const harness = createHarness([false], 50);
    const result = await waitForSettledFrame(harness.map, harness.options);

    expect(result.timedOut).toBe(true);
    expect(result.waitedMs).toBeGreaterThanOrEqual(50);
  });

  it('stops promptly when the export is cancelled', async () => {
    let renders = 0;
    const result = await waitForSettledFrame(
      { areTilesLoaded: () => false, isMoving: () => false, isStyleLoaded: () => true },
      {
        isCancelled: () => renders >= 2,
        nextTask: async () => {},
        renderOnce: async () => { renders += 1; },
        now: () => 0,
        timeoutMs: 10_000,
      },
    );

    expect(result.timedOut).toBe(false);
    expect(renders).toBeLessThanOrEqual(3);
  });
});
