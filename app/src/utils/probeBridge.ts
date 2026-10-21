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
 * Read the render-synchronized marker's actual DOM position rather than
 * independently projecting a possibly newer playback coordinate.
 */
function markerScreenPosition(): { x: number; y: number } | null {
  const marker = document.querySelector('.tr-marker');
  const canvas = mapGlobalRef.current?.getCanvas();
  if (!marker || !canvas || (marker as HTMLElement).style.visibility === 'hidden') return null;

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
  const removeRecordingControls = installCameraRecordingControls();
  return () => {
    removeRecordingControls();
    if (window.__trailreplay === bridge) delete window.__trailreplay;
  };
}

/** Opt-in, visible capture controls so a complete replay can be inspected without a console. */
function installCameraRecordingControls(): () => void {
  const samples: object[] = [];
  let recording = false;
  let raf = 0;
  let lastTime = -1;
  let moves = 0;
  let previousMap: maplibregl.Map | null = null;
  const countMove = () => { moves++; };
  const controls = document.createElement('div');
  Object.assign(controls.style, { position: 'fixed', top: '8px', left: '50%', zIndex: '99999', display: 'flex', gap: '8px', background: 'white', color: 'black', padding: '8px' });
  const record = document.createElement('button');
  record.textContent = 'Record camera diagnostics';
  record.onclick = () => { samples.length = 0; lastTime = -1; recording = true; record.textContent = 'Recording camera diagnostics'; };
  const save = document.createElement('button');
  save.textContent = 'Save camera diagnostics';
  save.onclick = () => {
    recording = false;
    record.textContent = 'Record camera diagnostics';
    const blob = new Blob([JSON.stringify({ samples, keyframes: useAppStore.getState().cinematicCameraKeyframes })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'trailreplay-camera-diagnostics.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  controls.append(record, save);
  document.body.appendChild(controls);
  const sample = () => {
    const map = mapGlobalRef.current;
    if (map !== previousMap) {
      previousMap?.off('moveend', countMove);
      map?.on('moveend', countMove);
      previousMap = map;
    }
    const state = useAppStore.getState();
    if (recording && map && state.animationPhase === 'playing' && state.playback.currentTime !== lastTime) {
      lastTime = state.playback.currentTime;
      const center = map.getCenter();
      samples.push({ wallTime: performance.now(), time: lastTime, progress: state.playback.progress,
        elevation: map.getCenterElevation(), pitch: map.getPitch(), maxPitch: map.getMaxPitch(),
        zoom: map.getZoom(), bearing: map.getBearing(), center: [center.lng, center.lat], moves });
      moves = 0;
      if (samples.length >= 20000) recording = false;
    }
    raf = requestAnimationFrame(sample);
  };
  raf = requestAnimationFrame(sample);
  return () => { cancelAnimationFrame(raf); previousMap?.off('moveend', countMove); controls.remove(); };
}
