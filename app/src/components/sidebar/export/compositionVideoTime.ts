import type { VideoConfig } from './replayComposition';

export function getCompositionVideoTime({
  config,
  duration,
  progress,
  timelineSeconds,
}: {
  config: VideoConfig;
  duration: number;
  progress: number;
  timelineSeconds: number;
}) {
  const start = Math.max(0, Math.min(duration || Number.POSITIVE_INFINITY, config.trim?.start ?? 0));
  const requestedEnd = config.trim?.end ?? duration;
  const end = Math.max(start, Math.min(duration || requestedEnd, requestedEnd));
  const span = Math.max(0, end - start);
  if (span === 0) return start;
  if (config.sync === 'manual') return start;
  if (config.sync === 'route') return start + Math.max(0, Math.min(1, progress)) * span;
  return start + (((Math.max(0, timelineSeconds) % span) + span) % span);
}
