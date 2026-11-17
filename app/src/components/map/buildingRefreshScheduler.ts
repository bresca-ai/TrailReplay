/** Refresh building geometry after a rendered camera move, with a timer fallback. */
export function createBuildingRefreshScheduler(rebuild: () => void, now: () => number = () => performance.now()) {
  let dirty = true;
  let disposed = false;
  let lastRefresh = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const refresh = () => {
    if (disposed || !dirty) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    dirty = false;
    lastRefresh = now();
    rebuild();
  };

  return {
    schedule() {
      if (disposed) return;
      dirty = true;
      if (timer === undefined) timer = setTimeout(refresh, 200);
    },
    // Live playback may never pause long enough for an idle event. Refresh
    // after a rendered pose, capped at 10 Hz to avoid rebuilding on every tick.
    onRender() {
      if (dirty && now() - lastRefresh >= 100) refresh();
    },
    // Studio export freezes each output pose and needs it immediately, even
    // when it follows the previous encoded frame by less than 100 ms.
    prepare: refresh,
    isDirty: () => dirty,
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
