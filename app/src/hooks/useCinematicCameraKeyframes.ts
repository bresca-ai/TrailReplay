import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getLocalShotHeading } from '@/utils/localShotHeading';
import { buildComputedJourney } from '@/utils/journeyUtils';
import {
  deriveCinematicKeyframeProgress,
  prepareCinematicKeyframeTrack,
  type CinematicCameraKeyframe,
  type PreparedCinematicKeyframe,
} from '@/utils/cinematicCameraPlan';

/**
 * The stored keyframes (anchor-based), sorted and progress-derived against
 * the current journey — ready for `getCinematicCameraPose`. See
 * CINEMATIC_CAMERA_PLAN.md section 4: pose evaluation takes keyframes that
 * are "pre-sorted, progress already derived", so that step happens once
 * here rather than per frame.
 */
export function usePreparedCinematicCameraKeyframes(
  cameraPathCoordinates: number[][],
): PreparedCinematicKeyframe[] {
  const keyframes = useAppStore((state) => state.cinematicCameraKeyframes);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const tracks = useAppStore((state) => state.tracks);
  const routeTimingMode = useAppStore((state) => state.playback.routeTimingMode);
  const totalDurationMs = useAppStore((state) => state.playback.totalDuration);
  const cameraStability = useAppStore((state) => state.cameraSettings.cameraStability);

  return useMemo(() => {
    if (keyframes.length === 0 || cameraPathCoordinates.length === 0) return [];

    const computedJourney = buildComputedJourney(journeySegments, tracks);
    if (!computedJourney) return [];

    const withProgress: Array<{ keyframe: CinematicCameraKeyframe; progress: number }> = [];
    for (const keyframe of keyframes) {
      const progress = deriveCinematicKeyframeProgress(
        keyframe.anchor,
        computedJourney.segmentTimings,
        computedJourney.coordinates,
        routeTimingMode,
      );
      // A keyframe whose segment was deleted has nowhere to go — drop it
      // rather than guess. See CINEMATIC_CAMERA_PLAN.md section 11.
      if (progress !== null) withProgress.push({ keyframe, progress });
    }

    return prepareCinematicKeyframeTrack(withProgress, cameraPathCoordinates,
      (progress) => getLocalShotHeading(cameraPathCoordinates, progress, cameraStability, totalDurationMs));
  }, [keyframes, journeySegments, tracks, routeTimingMode, cameraPathCoordinates, cameraStability, totalDurationMs]);
}
