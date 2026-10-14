export interface ExportMapClockDependencies {
  now: () => number;
  restoreNow: () => void;
  setNow: (timestampMs: number) => void;
}

/**
 * Maps the video's zero-based timestamps onto MapLibre's existing clock epoch.
 * Rewinding MapLibre itself to zero can strand internal placement timestamps
 * in the future, preventing labels and symbols from reaching a stable frame.
 */
export function createExportMapClock(dependencies: ExportMapClockDependencies) {
  let originMs: number | null = null;

  return {
    setOutputTime(outputTimestampMs: number) {
      if (originMs === null) originMs = dependencies.now();
      dependencies.setNow(originMs + outputTimestampMs);
    },
    restore() {
      if (originMs === null) return;
      dependencies.restoreNow();
      originMs = null;
    },
  };
}
