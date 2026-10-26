import type { GPXTrack } from '@/types';
import { getRouteComparisonPlan, isRouteSplitAtPrimaryDistance } from './routeComparisonPlayback';

/** A unified marker is shown everywhere that the map does not mark as a split. */
export function areFollowingSamePath(primary: GPXTrack, comparison: GPXTrack, primaryDistance: number) {
  return !isRouteSplitAtPrimaryDistance(getRouteComparisonPlan(primary, comparison), primaryDistance, primary.totalDistance);
}
