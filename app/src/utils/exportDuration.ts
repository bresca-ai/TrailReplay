import type { PictureAnnotation, TextAnnotation, VideoAnnotation } from '@/types';
import { playbackTimeForRoute } from './annotationTiming';
import { INTRO_DURATION, OUTRO_DELAY, OUTRO_DURATION } from './playbackTiming';

/** Output timeline estimate, excluding render/network latency. Clips without
 * duration metadata can only be measured after their popup decodes at export. */
export function estimateExportDurationMs({
  routeDurationMs,
  annotations,
  pictures,
  videos,
}: {
  routeDurationMs: number;
  annotations: TextAnnotation[];
  pictures: PictureAnnotation[];
  videos: VideoAnnotation[];
}): number {
  if (!Number.isFinite(routeDurationMs) || routeDurationMs <= 0) return 0;
  const onRoute = (item: { progress: number }) => item.progress >= 0 && item.progress <= 1;
  const pictureMs = pictures.filter(onRoute).reduce(
    (total, picture) => total + Math.max(0, picture.displayDuration || 5000), 0,
  );
  const videoMs = videos.filter(onRoute).reduce((total, video) => {
    const seconds = video.durationSeconds;
    return total + (!video.isPlaceholder && typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0);
  }, 0);

  return INTRO_DURATION + OUTRO_DELAY + OUTRO_DURATION
    + playbackTimeForRoute(routeDurationMs, routeDurationMs, annotations)
    + pictureMs + videoMs;
}
