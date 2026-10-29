/**
 * Readiness predicate for studio-quality export frames.
 *
 * Standard export waits for a single `render` event per frame, which only
 * proves MapLibre drew *something* — measured on a 60s satellite replay, 80% of
 * those frames were drawn while their tiles were still in flight, so the video
 * showed overscaled z12 tiles from the fallback pyramid instead of the detail
 * basemap. Studio export waits on this predicate instead.
 */

export interface SettleableMap {
  areTilesLoaded: () => boolean;
  isMoving: () => boolean;
  isStyleLoaded: () => boolean | void;
}

export interface MapSettlePredicateOptions {
  /**
   * A frozen MapLibre animation still reports `isMoving() === true`. Its pose
   * is nevertheless stable until `setNow()` advances the export clock, so
   * transition frames may ignore that flag while retaining every other
   * readiness requirement.
   */
  allowMoving?: boolean;
}

export function isMapSettled(
  map: SettleableMap,
  options: MapSettlePredicateOptions = {},
): boolean {
  // MapLibre types this as `boolean | void`; `undefined` occurs while a style
  // is being replaced and is not strong enough evidence for a Studio frame.
  if (map.isStyleLoaded() !== true) return false;
  if (!options.allowMoving && map.isMoving()) return false;
  return map.areTilesLoaded();
}

export interface StudioWaitOptions {
  /** Aborts the wait (cancelled export). */
  isCancelled: () => boolean;
  /** Advances the map by exactly one rendered frame. */
  renderOnce: () => Promise<void>;
  /** Yields to the browser so React can commit the new replay state. */
  nextTask: () => Promise<void>;
  now: () => number;
  timeoutMs: number;
  /** See MapSettlePredicateOptions.allowMoving. */
  allowMoving?: boolean;
  /** Optional resources owned outside MapLibre, prepared for the current pose. */
  additionalReady?: () => boolean;
}

export interface StudioWaitResult {
  timedOut: boolean;
  waitedMs: number;
}

/**
 * Waits until the map has finished loading every tile for the *current* pose.
 *
 * The trap this is built around: the export loop sets replay state, React
 * commits it, and only then does the camera hook call `jumpTo`. Any
 * `areTilesLoaded()` read before that lands still describes the *previous*
 * pose — and since the previous pose just finished settling, it reads `true`.
 * A naive check therefore returns immediately and encodes exactly the
 * half-loaded frame this is meant to prevent, silently producing
 * standard-quality output while the UI claims studio quality.
 *
 * Two guards close that hole: render once at the new pose before reading
 * anything, and require the settled state to survive a second render before
 * trusting it.
 */
export async function waitForSettledFrame(
  map: SettleableMap,
  options: StudioWaitOptions,
): Promise<StudioWaitResult> {
  const start = options.now();

  await options.nextTask();
  await options.renderOnce();

  while (!options.isCancelled()) {
    if (isMapSettled(map, options) && (options.additionalReady?.() ?? true)) {
      await options.renderOnce();
      if (isMapSettled(map, options) && (options.additionalReady?.() ?? true)) break;
    }

    if (options.now() - start >= options.timeoutMs) {
      return { timedOut: true, waitedMs: options.now() - start };
    }

    await options.renderOnce();
  }

  return { timedOut: false, waitedMs: options.now() - start };
}
