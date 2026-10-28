import type { GPXTrack } from '@/types';
import { getRouteComparisonPlan, isRouteSplitAtPrimaryDistance } from './routeComparisonPlayback';

/** A unified marker is shown everywhere that the map does not mark as a split. */
export function areFollowingSamePath(primary: GPXTrack, comparison: GPXTrack, primaryDistance: number, threshold?: number) {
  return !isRouteSplitAtPrimaryDistance(getRouteComparisonPlan(primary, comparison, threshold), primaryDistance, primary.totalDistance);
}
