import type { GPXTrack } from '@/types';
import { buildRouteDivergences, createRouteMatcher } from './routeDivergence';

export interface ProgressWindow { start: number; end: number }
export interface RouteComparisonPlan {
  /** Distances at shared points, in strictly increasing order on both routes. */
  anchors: Array<{ primary: number; comparison: number }>;
  /** Unpadded sections actually highlighted as route splits. */
  splits: ProgressWindow[];
  /** Split sections expanded for the playback slowdown. */
  differences: ProgressWindow[];
}

const planCache = new WeakMap<GPXTrack, WeakMap<GPXTrack, RouteComparisonPlan>>();

function interpolateAnchors(anchors: RouteComparisonPlan['anchors'], distance: number, from: 'primary' | 'comparison') {
  const to = from === 'primary' ? 'comparison' : 'primary';
  let low = 0;
  let high = anchors.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (anchors[mid][from] < distance) low = mid + 1;
    else high = mid;
  }
  const upper = anchors[low];
  const lower = anchors[Math.max(0, low - 1)];
  const span = upper[from] - lower[from];
  const ratio = span > 0 ? Math.max(0, Math.min(1, (distance - lower[from]) / span)) : 0;
  return lower[to] + (upper[to] - lower[to]) * ratio;
}

export function comparisonDistanceAtPrimary(plan: RouteComparisonPlan, primaryDistance: number) {
  return interpolateAnchors(plan.anchors, primaryDistance, 'primary');
}

export function isRouteSplitAtPrimaryDistance(plan: RouteComparisonPlan, distance: number, totalDistance: number) {
  if (totalDistance <= 0) return false;
  const progress = Math.max(0, Math.min(1, distance / totalDistance));
  return plan.splits.some(({ start, end }) => progress >= start && progress < end);
}

export function mergeProgressWindows(windows: ProgressWindow[]): ProgressWindow[] {
  const result: ProgressWindow[] = [];
  for (const window of windows.map(({ start, end }) => ({ start: Math.max(0, start), end: Math.min(1, end) })).filter((window) => window.end > window.start).sort((a, b) => a.start - b.start)) {
    const previous = result.at(-1);
    if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end);
    else result.push({ ...window });
  }
  return result;
}

export function getRouteComparisonPlan(primary: GPXTrack, comparison: GPXTrack): RouteComparisonPlan {
  let cache = planCache.get(primary);
  if (!cache) { cache = new WeakMap(); planCache.set(primary, cache); }
  const cached = cache.get(comparison);
  if (cached) return cached;
  const anchors: RouteComparisonPlan['anchors'] = [{ primary: 0, comparison: 0 }];
  const match = createRouteMatcher(primary.points);
  for (const point of comparison.points) {
    const previous = anchors.at(-1)!;
    const candidate = match(point, previous.primary);
    if (candidate && candidate.distance > previous.primary + 1 && point.distance > previous.comparison + 1
      && candidate.distance < primary.totalDistance - 1 && point.distance < comparison.totalDistance - 1) {
      anchors.push({ primary: candidate.distance, comparison: point.distance });
    }
  }
  anchors.push({ primary: primary.totalDistance, comparison: comparison.totalDistance });
  const splitWindows: ProgressWindow[] = [];
  const windows: ProgressWindow[] = [];
  if (primary.totalDistance > 0) {
    // Highlight and slow down both detours and shortcuts, including parts
    // present only in the primary GPX.
    for (const reverse of [false, true]) {
      const differences = reverse ? buildRouteDivergences(comparison.points, primary.points) : buildRouteDivergences(primary.points, comparison.points);
      for (const feature of differences.features) {
        if (feature.geometry.type !== 'LineString') continue;
        const start = Number(feature.properties?.startDistance ?? 0);
        const end = Number(feature.properties?.endDistance ?? 0);
        const primaryStart = reverse ? start : interpolateAnchors(anchors, start, 'comparison');
        const primaryEnd = reverse ? end : interpolateAnchors(anchors, end, 'comparison');
        splitWindows.push({ start: primaryStart / primary.totalDistance, end: primaryEnd / primary.totalDistance });
        const padding = Math.min(0.015, 50 / primary.totalDistance);
        windows.push({ start: primaryStart / primary.totalDistance - padding, end: primaryEnd / primary.totalDistance + padding });
      }
    }
  }
  const plan = { anchors, splits: mergeProgressWindows(splitWindows), differences: mergeProgressWindows(windows) };
  cache.set(comparison, plan);
  return plan;
}

/** Redistribute the chosen video duration: differing sections receive more
 * time and shared sections less. Pure progress mapping also works for seeks
 * and deterministic exports without changing the user's playback speed. */
export function routeProgressWithSlowdown(progress: number, windows: ProgressWindow[], speed: number) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  if (speed >= 1 || windows.length === 0) return progress;
  const rate = 1 / Math.max(0.1, speed);
  const spans: Array<ProgressWindow & { weight: number }> = [];
  let cursor = 0;
  for (const window of mergeProgressWindows(windows)) {
    if (window.start > cursor) spans.push({ start: cursor, end: window.start, weight: 1 });
    spans.push({ ...window, weight: rate });
    cursor = window.end;
  }
  if (cursor < 1) spans.push({ start: cursor, end: 1, weight: 1 });
  const total = spans.reduce((sum, span) => sum + (span.end - span.start) * span.weight, 0);
  let target = progress * total;
  for (const span of spans) {
    const length = (span.end - span.start) * span.weight;
    if (target <= length) return span.start + target / span.weight;
    target -= length;
  }
  return 1;
}
