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
  const width = QUALITY_LONG_EDGE[quality] ?? QUALITY_LONG_EDGE.medium;
  const height = Math.round(width * 9 / 16);
  // All formats are crops of the same 16:9 frame. H.264 encoders generally
  // require even dimensions, so round the narrow edge to the nearest pair.
  const even = (value: number) => Math.round(value / 2) * 2;
  switch (aspectRatio) {
    case '16:9': return { width, height };
    case '1:1': return { width: height, height };
    case '4:5': return { width: even(height * 4 / 5), height };
    case '9:16': return { width: even(height * 9 / 16), height };
  }
}

export function getQualityOptionLabel(quality: VideoQuality, aspectRatio: AspectRatio): string {
  const { width, height } = getResolution(quality, aspectRatio);
  const label = quality === 'ultra' && aspectRatio !== '16:9'
    ? '2160p'
    : QUALITY_OPTIONS.find((option) => option.value === quality)?.label ?? quality;
  return `${label} · ${width}×${height}`;
}

/** Upgrade saved portrait presets from the old long-edge scheme; retain custom sizes. */
export function normalizeVideoExportResolution(settings: VideoExportSettings): VideoExportSettings {
  const edge = QUALITY_LONG_EDGE[settings.quality];
  if (!edge || (settings.aspectRatio !== '4:5' && settings.aspectRatio !== '9:16')) return settings;
  const oldWidth = Math.round(edge * (settings.aspectRatio === '4:5' ? 4 / 5 : 9 / 16));
  if (settings.resolution?.width !== oldWidth || settings.resolution?.height !== edge) return settings;
  return { ...settings, resolution: getResolution(settings.quality, settings.aspectRatio) };
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
