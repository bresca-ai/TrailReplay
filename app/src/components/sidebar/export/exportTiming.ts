/** Measure the export interval independently of the encoded video's duration. */
export function startExportTiming() {
  const started = performance.now();
  let visibleSince: number | null = document.hidden ? null : started;
  let visibleMs = 0;

  const onVisibilityChange = () => {
    const now = performance.now();
    if (document.hidden && visibleSince !== null) {
      visibleMs += now - visibleSince;
      visibleSince = null;
    } else if (!document.hidden && visibleSince === null) {
      visibleSince = now;
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  let stopped = false;
  return () => {
    if (stopped) return {};
    stopped = true;
    const now = performance.now();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    const elapsedMs = Math.max(0, now - started);
    const foregroundMs = Math.max(0, Math.min(elapsedMs, visibleMs + (visibleSince === null ? 0 : now - visibleSince)));
    return {
      export_elapsed_seconds: Math.round(elapsedMs / 100) / 10,
      export_foreground_seconds: Math.round(foregroundMs / 100) / 10,
    };
  };
}
