import type {
  AspectRatio,
  VideoExportSettings,
  VideoFormat,
  VideoQuality,
  VideoQualityMode,
} from '@/types';

export const MP4_MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
  'video/mp4;codecs=avc1.64001E,mp4a.40.2',
  'video/mp4;codecs=h264',
  'video/mp4',
];

export const WEBM_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export const QUALITY_OPTIONS: Array<{ value: VideoQuality; label: string }> = [
  { value: 'low', label: '720p' },
  { value: 'medium', label: '1080p' },
  { value: 'high', label: '1440p' },
  { value: 'ultra', label: '4K' },
];

const QUALITY_LONG_EDGE: Record<VideoQuality, number> = {
  low: 1280,
  medium: 1920,
  high: 2560,
  ultra: 3840,
};

export const ASPECT_RATIO_OPTIONS: Array<{
  id: AspectRatio;
  label: string;
  icon: string;
  descriptionKey: string;
}> = [
  { id: '16:9', label: '16:9', icon: '▬', descriptionKey: 'export.aspectLandscape' },
  { id: '4:5', label: '4:5', icon: '▮', descriptionKey: 'export.aspectPortrait' },
  { id: '1:1', label: '1:1', icon: '■', descriptionKey: 'export.aspectSquare' },
  { id: '9:16', label: '9:16', icon: '▮', descriptionKey: 'export.aspectPortrait' },
];

export const FPS_OPTIONS = [24, 30, 60] as const;

export function getSupportedMimeType(format: VideoFormat): {
  mimeType: string;
  actualFormat: VideoFormat;
} {
  if (format === 'mp4') {
    const mp4 = MP4_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (mp4) return { mimeType: mp4, actualFormat: 'mp4' };

    const webm = WEBM_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
    return { mimeType: webm, actualFormat: 'webm' };
  }

  const webm = WEBM_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
  return { mimeType: webm, actualFormat: 'webm' };
}

export function getResolution(
  quality: VideoQuality,
  aspectRatio: AspectRatio
): VideoExportSettings['resolution'] {
  const longEdge = QUALITY_LONG_EDGE[quality] ?? QUALITY_LONG_EDGE.medium;

  switch (aspectRatio) {
    case '16:9':
      return { width: longEdge, height: Math.round((longEdge * 9) / 16) };
    case '1:1': {
      const size = Math.round((longEdge * 9) / 16);
      return { width: size, height: size };
    }
    case '4:5': {
      const height = longEdge;
      const width = Math.round((longEdge * 4) / 5);
      return { width, height };
    }
    case '9:16': {
      const height = longEdge;
      const width = Math.round((longEdge * 9) / 16);
      return { width, height };
    }
  }
}

export interface VideoBitrateOptions {
  width: number;
  height: number;
  fps: number;
  qualityMode: VideoQualityMode;
}

/**
 * Map exports contain far more high-frequency detail than typical camera
 * footage. Size the bitrate from the actual pixel rate instead of only the
 * quality label so portrait/square exports and 24/60 fps exports are not
 * under- or over-provisioned. Studio uses three times the bits per pixel of
 * Standard to preserve satellite labels and terrain during camera movement.
 */
export function getVideoBitrate({
  width,
  height,
  fps,
  qualityMode,
}: VideoBitrateOptions): number {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const safeFps = Math.max(1, fps);
  const bitsPerPixel = qualityMode === 'studio' ? 0.24 : 0.08;
  const calculated = safeWidth * safeHeight * safeFps * bitsPerPixel;

  // Stable half-megabit steps make the selected profile easier to inspect and
  // avoid meaningless bitrate differences caused by aspect-ratio rounding.
  return Math.max(1_000_000, Math.round(calculated / 500_000) * 500_000);
}
