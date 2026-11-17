import { cinematicAnchorSmoothingHalfWindow, cinematicHeadingBaselineHalfWidth } from '@/components/map/cameraUtils';
import { getSmoothedRouteHeadingDeg } from '@/utils/cinematicCameraAnchor';
import { getRouteBearingAtProgress } from '@/utils/replayCameraPlan';

/** Stable route direction for local shots, shared by playback, editing, and warmup. */
export function getLocalShotHeading(coordinates: number[][], progress: number, stability: number, durationMs: number): number {
  const halfWindow = cinematicAnchorSmoothingHalfWindow(stability, durationMs / 1000);
  return getSmoothedRouteHeadingDeg({ coordinates, progress, smoothingHalfWindow: halfWindow,
    baselineHalfWidth: cinematicHeadingBaselineHalfWidth(halfWindow) })
    ?? getRouteBearingAtProgress(coordinates, progress);
}
