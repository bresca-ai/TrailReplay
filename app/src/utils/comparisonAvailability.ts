import type { GPXTrack } from '@/types';
import { createRouteMatcher } from './routeDivergence';
import { buildTrackTimeIndex } from './trackPositionAtTime';

export type ComparisonMode = 'time' | 'route';
export type ComparisonIssue = 'missingTiming' | 'noSharedRoute';

export interface ComparisonAvailability {
  time: boolean;
  route: boolean;
  timeIssue: ComparisonIssue | null;
  routeIssue: ComparisonIssue | null;
}

const sharedRouteCache = new WeakMap<GPXTrack, WeakMap<GPXTrack, boolean>>();

/** A common point is allowed 35 m of GPS error, matching route playback's anchor search. */
export function hasSharedRoutePoint(primary: GPXTrack, comparison: GPXTrack): boolean {
  let cache = sharedRouteCache.get(primary);
  if (!cache) {
    cache = new WeakMap();
    sharedRouteCache.set(primary, cache);
  }
  const cached = cache.get(comparison);
  if (cached !== undefined) return cached;

  const valid = primary.points.length >= 2 && comparison.points.length >= 2
    && primary.totalDistance > 0 && comparison.totalDistance > 0;
  let shared = false;
  if (valid) {
    const matchPrimary = createRouteMatcher(primary.points);
    shared = comparison.points.some((point) => matchPrimary(point) !== null);
    if (!shared) {
      const matchComparison = createRouteMatcher(comparison.points);
      shared = primary.points.some((point) => matchComparison(point) !== null);
    }
  }
  cache.set(comparison, shared);
  return shared;
}

function hasUsableTiming(track: GPXTrack): boolean {
  const index = buildTrackTimeIndex(track);
  return !!index && Number.isFinite(index.times[0]) && Number.isFinite(index.times.at(-1))
    && index.times.at(-1)! > index.times[0];
}

export function getComparisonAvailability(primary: GPXTrack | null | undefined, comparisons: readonly GPXTrack[]): ComparisonAvailability {
  if (!primary || comparisons.length === 0) {
    return { time: false, route: false, timeIssue: null, routeIssue: null };
  }
  const time = hasUsableTiming(primary) && comparisons.every(hasUsableTiming);
  const route = comparisons.every((track) => hasSharedRoutePoint(primary, track));
  return {
    time,
    route,
    timeIssue: time ? null : 'missingTiming',
    routeIssue: route ? null : 'noSharedRoute',
  };
}

export function comparisonIssueForMode(availability: ComparisonAvailability, mode: ComparisonMode): ComparisonIssue | null {
  return mode === 'time' ? availability.timeIssue : availability.routeIssue;
}
