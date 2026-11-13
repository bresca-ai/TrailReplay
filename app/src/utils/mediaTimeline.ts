import type { PictureAnnotation, TextAnnotation, VideoAnnotation } from '@/types';
import { playbackTimeForRoute, routeTimeForPlayback } from '@/utils/annotationTiming';

export type TimelineMedia = { kind: 'picture' | 'video'; id: string; progress: number; durationMs: number };
export type TimelineBlock = TimelineMedia & { startMs: number; endMs: number };

/** Route playback pauses for each photo/clip; annotation slowdowns also add output time. */
export function buildMediaTimeline(routeDuration: number, annotations: TextAnnotation[], pictures: PictureAnnotation[], videos: VideoAnnotation[]) {
  const media: TimelineMedia[] = [
    ...pictures.map((p) => ({ kind: 'picture' as const, id: p.id, progress: p.progress, durationMs: p.displayDuration || 3000 })),
    ...videos.map((v) => ({ kind: 'video' as const, id: v.id, progress: v.progress, durationMs: v.isPlaceholder ? 0 : (v.durationSeconds ?? 0) * 1000 })),
  ].sort((a, b) => a.progress - b.progress);
  let accumulated = 0;
  const blocks: TimelineBlock[] = media.map((item) => {
    const startMs = playbackTimeForRoute(item.progress * routeDuration, routeDuration, annotations) + accumulated;
    accumulated += Math.max(0, item.durationMs);
    return { ...item, startMs, endMs: startMs + Math.max(0, item.durationMs) };
  });
  return { blocks, totalMs: playbackTimeForRoute(routeDuration, routeDuration, annotations) + accumulated };
}

/** Convert an output time to route progress, stopping on the route during media holds. */
export function timelineTimeToProgress(timeMs: number, routeDuration: number, annotations: TextAnnotation[], blocks: TimelineBlock[]): number {
  if (routeDuration <= 0) return 0;
  let remaining = Math.max(0, timeMs);
  let elapsedHolds = 0;
  for (const block of blocks) {
    if (remaining < block.startMs) break;
    if (remaining <= block.endMs) return Math.max(0, Math.min(1, block.progress));
    elapsedHolds += block.durationMs;
  }
  remaining -= elapsedHolds;
  return Math.max(0, Math.min(1, routeTimeForPlayback(remaining, routeDuration, annotations) / routeDuration));
}

export function progressToTimelineTime(progress: number, routeDuration: number, annotations: TextAnnotation[], blocks: TimelineBlock[]): number {
  return playbackTimeForRoute(Math.max(0, Math.min(1, progress)) * routeDuration, routeDuration, annotations)
    + blocks.filter((block) => block.progress < progress).reduce((sum, block) => sum + block.durationMs, 0);
}
