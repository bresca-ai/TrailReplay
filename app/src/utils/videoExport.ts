import type { PictureAnnotation, TextAnnotation, VideoAnnotation, VideoExportSettings } from '@/types';
import { getVideoBitrate } from '@/components/sidebar/export/exportConfig';
import { playbackTimeForRoute } from './annotationTiming';

export function estimateVideoDuration({ routeDuration, annotations, annotationHoldDuration, introDuration, outroDuration, includeCover, pictures, videos }: {
  routeDuration: number; annotations: TextAnnotation[]; annotationHoldDuration: number;
  introDuration: number; outroDuration: number; includeCover: boolean;
  pictures: PictureAnnotation[]; videos: VideoAnnotation[];
}): number {
  const mediaDuration = pictures.reduce((total, picture) => total + (picture.progress >= 0 && picture.progress <= 1 ? (picture.displayDuration || 3000) : 0), 0)
    + videos.reduce((total, video) => total + (!video.isPlaceholder && video.progress >= 0 && video.progress <= 1 ? Math.max(0, video.durationSeconds ?? 0) * 1000 : 0), 0);
  return playbackTimeForRoute(routeDuration, routeDuration, annotations, annotationHoldDuration)
    + introDuration + outroDuration + (includeCover ? 1000 : 0) + mediaDuration;
}

// Calculate estimated file size for the configured export settings.
export function estimateFileSize(
  duration: number,
  settings: VideoExportSettings
): string {
  const bitrate = getVideoBitrate({
    width: settings.resolution.width,
    height: settings.resolution.height,
    fps: settings.fps,
    qualityMode: settings.qualityMode,
  });

  const sizeInBytes = (duration / 1000) * bitrate / 8;
  const sizeInMB = sizeInBytes / (1024 * 1024);

  if (sizeInMB >= 1024) {
    return `${(sizeInMB / 1024).toFixed(2)} GB`;
  } else {
    return `${sizeInMB.toFixed(1)} MB`;
  }
}
