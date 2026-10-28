import type { VideoExportSettings } from '@/types';
import { getVideoBitrate } from '@/components/sidebar/export/exportConfig';

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
