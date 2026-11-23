/**
 * The camera move between two routes. It follows the same "fly" path as the
 * opening fly-in (MapLibre's `flyTo`, after van Wijk & Nuij): the further it
 * has to travel the higher it climbs, so a short hop barely zooms out and a
 * flight across the country rises until both ends fit. It is computed per
 * frame and applied with `jumpTo`, so live playback and export render the same
 * pose (see components/map/CAMERA.md).
 */

export interface TransitionCameraPose {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface TransitionFlightOptions {
  /** The larger side of the map viewport in CSS pixels. */
  viewportPx: number;
  /** Highest point of the flight as a map zoom; automatic when omitted. */
  peakZoom?: number;
  /** Tilt at the highest point; automatic when omitted. */
  pitch?: number;
}

/** Same curvature as MapLibre's `flyTo` default, so it matches the fly-in. */
const RHO = 1.42;
const TILE = 512;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => { const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const lonOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;

/** The fly path between two views: width-of-view w(s) and distance-along u(s) for s in [0, S]. */
function flightPath(start: TransitionCameraPose, end: TransitionCameraPose, viewportPx: number, peakZoom?: number) {
  const x0 = mercX(start.center[0]), y0 = mercY(start.center[1]);
  const dLon = ((end.center[0] - start.center[0] + 540) % 360) - 180;   // the short way across the dateline
  const dx = dLon / 360, dy = mercY(end.center[1]) - y0;
  const w0 = viewportPx / (TILE * 2 ** start.zoom), w1 = viewportPx / (TILE * 2 ** end.zoom);
  const u1 = Math.hypot(dx, dy);
  let rho = RHO;
  if (peakZoom !== undefined && u1 > 1e-12) {
    const top = Math.min(peakZoom, start.zoom, end.zoom);
    rho = Math.sqrt((viewportPx / (TILE * 2 ** top)) / u1 * 2);
  }
  const rho2 = rho * rho;
  const r = (i: 0 | 1) => {
    const b = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (i ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };
  const r0 = r(0);
  let w = (s: number) => Math.cosh(r0) / Math.cosh(r0 + rho * s);
  let u = (s: number) => w0 * ((Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0)) / rho2) / u1;
  let S = (r(1) - r0) / rho;
  if (u1 < 1e-12 || !Number.isFinite(S)) {
    // Same place: only the zoom changes.
    const k = w1 < w0 ? -1 : 1;
    S = Math.abs(Math.log(w1 / w0)) / rho;
    u = () => 0;
    w = (s: number) => Math.exp(k * rho * s);
  }
  const peakW = S > 0 && -r0 / rho > 0 && -r0 / rho < S ? Math.cosh(r0) : Math.max(1, w(S));
  return { x0, y0, dx, dy, w, u, S, peakZoom: start.zoom - Math.log2(peakW) };
}

/** Tilt at the top of the flight: the higher it climbs the flatter it looks, like the fly-in. */
export function automaticTransitionPitch(climbZoomLevels: number) {
  return Math.round(Math.max(10, Math.min(45, 45 - 5 * climbZoomLevels)));
}

/** The pose `progress` (0–1) of the way through the move. Starts and ends at rest. */
export function transitionCameraPose(start: TransitionCameraPose, end: TransitionCameraPose, progress: number, options: TransitionFlightOptions): TransitionCameraPose {
  const p = clamp01(progress);
  if (p === 0) return { ...start, center: [...start.center] as [number, number] };
  if (p === 1) return { ...end, center: [...end.center] as [number, number] };
  const path = flightPath(start, end, Math.max(1, options.viewportPx), options.peakZoom);
  const k = smooth(p);
  const s = k * path.S;
  const zoom = path.S > 0 ? start.zoom - Math.log2(path.w(s)) : start.zoom + (end.zoom - start.zoom) * k;
  const along = path.S > 0 ? path.u(s) : k;
  const center: [number, number] = [lonOf(path.x0 + path.dx * along), latOf(path.y0 + path.dy * along)];
  // tilt follows altitude: the base blend between the two ends, pulled towards the transition tilt as the camera climbs
  const climb = Math.max(0, Math.min(start.zoom, end.zoom) - path.peakZoom);
  const topPitch = options.pitch ?? automaticTransitionPitch(climb);
  const baseZoom = start.zoom + (end.zoom - start.zoom) * k;
  const height = climb > 0.05 ? clamp01((baseZoom - zoom) / climb) : 0;
  const basePitch = start.pitch + (end.pitch - start.pitch) * k;
  const pitch = basePitch + (topPitch - basePitch) * smooth(height);
  // turn while high up, keeping each end's exact heading
  const bearingDelta = ((end.bearing - start.bearing + 540) % 360) - 180;
  const bearing = start.bearing + bearingDelta * smooth((k - 0.15) / 0.7);
  return { center, zoom, pitch, bearing };
}

/** Where the automatic flight peaks, for showing the defaults in the editor. */
export function automaticTransitionPeak(from: { lat: number; lon: number }, to: { lat: number; lon: number }, routeZoom = 14, viewportPx = 1200) {
  const pose = (c: { lat: number; lon: number }): TransitionCameraPose => ({ center: [c.lon, c.lat], zoom: routeZoom, pitch: 0, bearing: 0 });
  const { peakZoom } = flightPath(pose(from), pose(to), viewportPx);
  const zoom = Math.round(Math.max(0, Math.min(routeZoom, peakZoom)) * 2) / 2;
  return { zoom, pitch: automaticTransitionPitch(routeZoom - peakZoom) };
}

/**
 * The user's overrides, if any. `undefined` means automatic. Early draft
 * projects stored `cameraZoomOut` instead of a zoom.
 */
export function transitionSettings(segment: { cameraTransitionZoom?: number; cameraTransitionPitch?: number; cameraZoomOut?: number }) {
  const zoom = segment.cameraTransitionZoom ?? (segment.cameraZoomOut === undefined ? undefined : 14 - segment.cameraZoomOut);
  const pitch = segment.cameraTransitionPitch;
  return {
    zoom: zoom !== undefined && Number.isFinite(zoom) ? Math.max(0, Math.min(18, zoom)) : undefined,
    pitch: pitch !== undefined && Number.isFinite(pitch) ? Math.max(0, Math.min(60, pitch)) : undefined,
  };
}

/** Default length of a camera move: longer the further it flies, from 2.5 s for a hop to 6 s across a country. */
export function defaultCameraTransitionDurationMs(distanceKm: number) {
  return Math.round(Math.max(2500, Math.min(6000, 2000 + 800 * Math.log2(1 + Math.max(0, distanceKm)))) / 100) * 100;
}
