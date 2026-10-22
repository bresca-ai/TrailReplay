import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { buildComputedJourney } from '@/utils/journeyUtils';
import { terrainContextFingerprint } from '@/utils/terrainCamera/context';
import {
  deriveCinematicKeyframeProgress,
  prepareCinematicKeyframeTrack,
  type CinematicCameraKeyframe,
  type PreparedCinematicKeyframe,
} from '@/utils/cinematicCameraPlan';

/** Preview only changes the rendered camera. Exports always use accepted shots. */
export function useCinematicCameraKeyframes(): CinematicCameraKeyframe[] {
  const accepted = useAppStore((state) => state.cinematicCameraKeyframes);
  const review = useAppStore((state) => state.cameraPlanReview);
  const tracks = useAppStore((state) => state.tracks);
  const segments = useAppStore((state) => state.journeySegments);
  const timing = useAppStore((state) => state.playback.routeTimingMode);
  const exporting = useAppStore((state) => state.isExporting);
  const hasReview = review !== null;
  const fingerprint = useMemo(() => hasReview ? terrainContextFingerprint(tracks, segments, timing) : '', [hasReview, tracks, segments, timing]);
  return !exporting && review?.previewing && review.contextFingerprint === fingerprint ? review.frames : accepted;
}

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
  const keyframes = useCinematicCameraKeyframes();
  const journeySegments = useAppStore((state) => state.journeySegments);
  const tracks = useAppStore((state) => state.tracks);
  const routeTimingMode = useAppStore((state) => state.playback.routeTimingMode);

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

    return prepareCinematicKeyframeTrack(withProgress, cameraPathCoordinates);
  }, [keyframes, journeySegments, tracks, routeTimingMode, cameraPathCoordinates]);
}
