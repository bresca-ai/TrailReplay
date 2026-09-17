import type * as maplibregl from 'maplibre-gl';
import { mapGlobalRef } from '@/utils/mapRef';
import { useAppStore } from '@/store/useAppStore';
import type { AppState } from '@/store/storeTypes';

/**
 * A read-and-drive handle on the running app, for measuring a replay from
 * outside the browser.
 *
 * An agent that authors a replay cannot watch it, and neither can a test: the
 * things that make a replay feel wrong — the camera lurching, the marker
 * leaving frame — live in the rendered map, not in any pure function. This
 * exposes just enough for `scripts/probe-replay.mjs` to drive a replay and
 * sample it per frame, using the metrics in components/map/CAMERA.md.
 *
 * It is off unless the page is opened with `?probe=1`, so it costs nothing and
 * appears nowhere by default. Everything it exposes is already in the page; it
 * adds no capability, only a stable name for reaching it. A stable name matters:
 * CAMERA.md's alternative is walking the React fiber tree to find the map, which
 * breaks silently on a React upgrade.
 */

export const PROBE_QUERY_FLAG = 'probe';
export const PROBE_VERSION = 1;

export interface ProbeBridge {
  version: number;
  /** The live MapLibre instance, or null before the map has initialised. */
  getMap: () => maplibregl.Map | null;
  getState: () => AppState;
  /** Everything the last dropped recipe resolved to, including its warnings. */
  getReport: () => AppState['recipeReport'];
  play: () => void;
  pause: () => void;
  seekToProgress: (progress: number) => void;
  /** Screen position of the playback marker, as a fraction of the canvas. */
  getMarkerScreenPosition: () => { x: number; y: number } | null;
}

declare global {
  interface Window {
    __trailreplay?: ProbeBridge;
  }
}

export function isProbeEnabled(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get(PROBE_QUERY_FLAG) === '1';
}

/**
 * The marker is a MapLibre Marker, so its transform is the browser's own answer
 * to "where is it on screen" — more faithful than re-projecting its coordinate,
 * which would miss anything the map does to the element afterwards.
 */
function markerScreenPosition(): { x: number; y: number } | null {
  const marker = document.querySelector('.tr-marker');
  const canvas = mapGlobalRef.current?.getCanvas();
  if (!marker || !canvas) return null;

  const markerBox = marker.getBoundingClientRect();
  const canvasBox = canvas.getBoundingClientRect();
  if (canvasBox.width === 0 || canvasBox.height === 0) return null;

  return {
    x: (markerBox.left + markerBox.width / 2 - canvasBox.left) / canvasBox.width,
    y: (markerBox.top + markerBox.height / 2 - canvasBox.top) / canvasBox.height,
  };
}

export function installProbeBridge(): () => void {
  const bridge: ProbeBridge = {
    version: PROBE_VERSION,
    getMap: () => mapGlobalRef.current,
    getState: () => useAppStore.getState(),
    getReport: () => useAppStore.getState().recipeReport,
    play: () => useAppStore.getState().play(),
    pause: () => useAppStore.getState().pause(),
    seekToProgress: (progress) => useAppStore.getState().seekToProgress(progress),
    getMarkerScreenPosition: markerScreenPosition,
  };

  window.__trailreplay = bridge;
  return () => {
    if (window.__trailreplay === bridge) delete window.__trailreplay;
  };
}
