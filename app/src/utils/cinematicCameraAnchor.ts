import {
  METERS_PER_PIXEL_AT_ZOOM_0,
  REFERENCE_VIEWPORT_WIDTH_PX,
} from '@/utils/followBehindCamera';
import { getInterpolatedRouteCoordinate } from '@/utils/replayCameraPlan';

/**
 * Where the cinematic camera looks, as distinct from where the marker is.
 *
 * Follow-behind welds the camera's centre to the marker's exact position, so
 * every switchback and every metre of GPS wobble translates the whole frame.
 * On a compressed replay a switchback is a fraction of a second of video, so
 * what the viewer sees is the picture shaking, not the route turning.
 *
 * A real camera operator cannot fix this, because they do not know where the
 * subject is going next. We do: the whole route is known before the first
 * frame is drawn. That allows a *non-causal* filter — one that averages the
 * route position on both sides of the current moment — and a symmetric filter
 * has zero phase delay. So the camera can fly a smoothed line through the
 * switchbacks without ever falling behind the marker on a straight run, which
 * no real-time stabiliser can do.
 *
 * The marker itself is never moved: it stays exactly on the GPX trace. Only
 * the camera's look-at point is smoothed, so the marker weaves inside the
 * frame while the frame itself glides.
 */

/**
 * Taps in the smoothing kernel. The window is expressed in replay time and
 * can be seconds wide, but the cost per frame stays fixed: the shape of the
 * kernel is what does the smoothing, not how densely it is sampled.
 */
const KERNEL_TAPS = 33;

/**
 * Fraction of the reference viewport width the marker may be offset from the
 * frame centre before the anchor is pulled back toward it.
 *
 * CAMERA.md's first invariant is that the marker stays framed. Smoothing the
 * anchor deliberately lets the marker move within the frame, so it needs a
 * bound: at this fraction of the visible width it is still comfortably inside
 * the picture, well short of the edge.
 */
const MAX_MARKER_OFFSET_VIEWPORT_FRACTION = 0.22;

/**
 * Where in that allowance the pull-back starts. Below it the anchor is left
 * alone; between it and the limit the offset is progressively compressed. The
 * gap exists so the correction ramps in smoothly instead of switching on —
 * a hard threshold is what produced the stick-slip described in CAMERA.md.
 */
const OFFSET_SOFT_ZONE_FRACTION = 0.6;

const METERS_PER_DEGREE_LATITUDE = 111_320;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Smoothstep: 0 below `edge0`, 1 above `edge1`, C1-continuous at both ends. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Metres per degree of longitude at this latitude. Web Mercator aside, the
 * offsets handled here are small enough that a local planar approximation is
 * exact to well under a metre.
 */
function metersPerDegreeLongitude(latitudeDeg: number): number {
  return METERS_PER_DEGREE_LATITUDE * Math.cos((latitudeDeg * Math.PI) / 180);
}

/**
 * How much ground one reference viewport width covers at this zoom, in metres.
 * Uses the same fixed reference width as the distance picker rather than the
 * real canvas, so the bound means the same thing in the preview and in an
 * export at any resolution.
 */
export function visibleWidthMetersAtZoom(zoom: number, latitudeDeg: number): number {
  const safeLatitude = Math.max(-85, Math.min(85, latitudeDeg));
  const metersPerPixel =
    (METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((safeLatitude * Math.PI) / 180)) / Math.pow(2, zoom);
  return metersPerPixel * REFERENCE_VIEWPORT_WIDTH_PX;
}

/**
 * Blackman weight at `offset` taps from the centre of a window `halfTaps`
 * wide.
 *
 * The choice of kernel is the whole game here. A plain boxcar average has
 * large sidelobes: a switchback pattern that lands on one survives the filter
 * almost untouched, so the camera would shake on some routes and not others.
 * A raised cosine is far better but still leaves a low-amplitude ripple —
 * measured on the switchback fixture, the smoothed path was small but never
 * straight, which is its own kind of restlessness. Blackman trades a slightly
 * wider main lobe for roughly thirty more decibels of sidelobe rejection, and
 * that ripple goes with it.
 *
 * What matters most is that it is symmetric: any symmetric normalised kernel
 * returns a straight run's exact midpoint, so none of this costs lag on the
 * straights.
 */
function blackmanWeight(offset: number, halfTaps: number): number {
  if (halfTaps <= 0) return 1;
  // Normalised to 0..1 across the half-window, then evaluated over a full
  // Blackman period so the weight reaches zero at both edges.
  const t = clamp01(Math.abs(offset) / halfTaps);
  const angle = Math.PI * (1 - t);
  return 0.42 - 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle);
}

export interface CinematicAnchorOptions {
  /** `cameraPathCoordinates`: the route resampled evenly in *replay time*. */
  coordinates: number[][];
  /** Where the replay is now, 0..1. */
  progress: number;
  /**
   * Half-width of the smoothing window, as a fraction of the whole replay.
   * Because `coordinates` is even in replay time, this is a duration: 0.02 of
   * a 60 s clip is 1.2 s either side.
   */
  smoothingHalfWindow: number;
  /** The marker's true position, which the smoothed anchor is bounded against. */
  markerPosition: [number, number];
  /** Current camera zoom, which sets how far off-centre the marker may go in metres. */
  zoom: number;
}

/** Number of candidate windows blended to keep framing changes continuous. */
const WINDOW_CANDIDATES = 16;

/**
 * Blend smoothed positions at several window widths. A candidate fades out
 * before it reaches the framing limit. Unlike a binary search, this remains
 * continuous when a winding route has several separate windows that fit.
 * Every contributing point is within the framing disc, so their weighted
 * average is within it too. A small marker weight covers the case where no
 * sampled window fits, without a hard switch at the edge.
 */
export function getSmoothedCameraAnchor(options: CinematicAnchorOptions): [number, number] {
  const { coordinates, progress, smoothingHalfWindow, markerPosition, zoom } = options;
  const allowanceMeters =
    visibleWidthMetersAtZoom(zoom, markerPosition[1]) * MAX_MARKER_OFFSET_VIEWPORT_FRACTION;
  if (!Number.isFinite(allowanceMeters) || allowanceMeters <= 0) return markerPosition;

  let weightSum = 0.001;
  let lonSum = markerPosition[0] * weightSum;
  let latSum = markerPosition[1] * weightSum;
  for (let index = 1; index <= WINDOW_CANDIDATES; index++) {
    const scale = index / WINDOW_CANDIDATES;
    const candidate = smoothRoutePosition(coordinates, progress, smoothingHalfWindow * scale);
    if (!candidate) continue;
    const distance = offsetMetersFrom(markerPosition, candidate);
    const fit = 1 - smoothstep(allowanceMeters * 0.4, allowanceMeters, distance);
    const weight = scale ** 4 * fit;
    lonSum += candidate[0] * weight;
    latSum += candidate[1] * weight;
    weightSum += weight;
  }
  return [lonSum / weightSum, latSum / weightSum];
}

/** Ground distance between two lng/lat points, over the short spans used here. */
function offsetMetersFrom(from: [number, number], to: [number, number]): number {
  const lonScale = metersPerDegreeLongitude(from[1]);
  return Math.hypot((to[0] - from[0]) * lonScale, (to[1] - from[1]) * METERS_PER_DEGREE_LATITUDE);
}

/**
 * The symmetric average of the route position around `progress`, with no
 * regard for where the marker is. This is the zero-phase part on its own:
 * useful both as the anchor's starting point and as the endpoints of a
 * heading baseline, which must not be bent back toward the marker.
 */
export function smoothRoutePosition(
  coordinates: number[][],
  progress: number,
  smoothingHalfWindow: number,
): [number, number] | null {
  const lastIndex = coordinates.length - 1;
  if (lastIndex < 0) return null;

  const centreIndex = clamp01(progress) * lastIndex;

  // Shrink the window symmetrically near the ends of the route rather than
  // letting it run off the array. A truncated window is a lopsided one, and a
  // lopsided average is biased toward the side that still has samples — at
  // progress 0 that would put the camera ahead of the marker before it has
  // even started moving.
  const requestedHalfWindow = Math.max(0, smoothingHalfWindow) * lastIndex;
  const halfWindow = Math.min(requestedHalfWindow, centreIndex, lastIndex - centreIndex);

  let lonSum = 0;
  let latSum = 0;
  let weightSum = 0;

  const halfTaps = (KERNEL_TAPS - 1) / 2;
  for (let tap = -halfTaps; tap <= halfTaps; tap++) {
    // Sample positions are fractional and move continuously with `progress`,
    // so the average never steps: see getInterpolatedRouteCoordinate on why a
    // reading that snaps to whole samples reappears as a 10 Hz staircase.
    const sampleIndex = centreIndex + (halfTaps === 0 ? 0 : (tap / halfTaps) * halfWindow);
    const coordinate = getInterpolatedRouteCoordinate(coordinates, sampleIndex);
    if (!coordinate) continue;

    const weight = blackmanWeight(tap, halfTaps);
    lonSum += coordinate[0] * weight;
    latSum += coordinate[1] * weight;
    weightSum += weight;
  }

  if (weightSum <= 0) return null;

  return [lonSum / weightSum, latSum / weightSum];
}

/**
 * Compresses the anchor's offset from the marker so the marker stays framed.
 *
 * The offset is left untouched inside the soft zone and then eased toward the
 * limit, so the transition is gradual in both directions. The mapping from
 * true offset to applied offset is continuous and monotone, which is what
 * keeps this from sticking and slipping the way a hard clamp would.
 */
export function boundAnchorToMarker(
  anchor: [number, number],
  markerPosition: [number, number],
  zoom: number,
): [number, number] {
  const maxOffsetMeters =
    visibleWidthMetersAtZoom(zoom, markerPosition[1]) * MAX_MARKER_OFFSET_VIEWPORT_FRACTION;
  if (!Number.isFinite(maxOffsetMeters) || maxOffsetMeters <= 0) return markerPosition;

  const lonScale = metersPerDegreeLongitude(markerPosition[1]);
  const eastMeters = (anchor[0] - markerPosition[0]) * lonScale;
  const northMeters = (anchor[1] - markerPosition[1]) * METERS_PER_DEGREE_LATITUDE;
  const offsetMeters = Math.hypot(eastMeters, northMeters);
  if (offsetMeters <= 0) return anchor;

  const softZoneMeters = maxOffsetMeters * OFFSET_SOFT_ZONE_FRACTION;
  if (offsetMeters <= softZoneMeters) return anchor;

  const easedBeyondSoftZone = smoothstep(softZoneMeters, maxOffsetMeters, offsetMeters);
  const allowedMeters =
    softZoneMeters + (maxOffsetMeters - softZoneMeters) * easedBeyondSoftZone;
  const scale = allowedMeters / offsetMeters;

  return [
    markerPosition[0] + (eastMeters * scale) / lonScale,
    markerPosition[1] + (northMeters * scale) / METERS_PER_DEGREE_LATITUDE,
  ];
}

/**
 * Heading of the route around `progress`, measured between two smoothed
 * anchors a long baseline apart.
 *
 * `getRouteBearingAtProgress` averages both ends of a sixteen-sample chord,
 * which was enough to stop follow-behind chasing GPS jitter, but it still
 * reports every real switchback — and a route-framed cinematic shot that
 * turns with each one is exactly the shake this mode exists to avoid. Reading
 * the heading between points seconds apart on the *smoothed* line reports
 * where the route is actually going, not which way this hairpin points.
 */
export function getSmoothedRouteHeadingDeg(options: {
  coordinates: number[][];
  progress: number;
  smoothingHalfWindow: number;
  /** Separation between the two readings, as a fraction of the whole replay. */
  baselineHalfWidth: number;
}): number | null {
  const { coordinates, progress, smoothingHalfWindow, baselineHalfWidth } = options;
  if (coordinates.length < 2) return null;

  const behindProgress = clamp01(progress - baselineHalfWidth);
  const aheadProgress = clamp01(progress + baselineHalfWidth);
  if (aheadProgress <= behindProgress) return null;

  // Measured on the smoothed line, and deliberately not bounded to the marker:
  // the bound exists to keep the marker framed, and applying it here would
  // bend the reading back toward the very wobble this is measuring past.
  const behind = smoothRoutePosition(coordinates, behindProgress, smoothingHalfWindow);
  const ahead = smoothRoutePosition(coordinates, aheadProgress, smoothingHalfWindow);
  if (!behind || !ahead) return null;

  const lonScale = metersPerDegreeLongitude(behind[1]);
  const eastMeters = (ahead[0] - behind[0]) * lonScale;
  const northMeters = (ahead[1] - behind[1]) * METERS_PER_DEGREE_LATITUDE;
  if (eastMeters === 0 && northMeters === 0) return null;

  const bearingDeg = (Math.atan2(eastMeters, northMeters) * 180) / Math.PI;
  return ((bearingDeg % 360) + 360) % 360;
}
