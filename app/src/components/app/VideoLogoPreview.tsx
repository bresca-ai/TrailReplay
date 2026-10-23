import { useAppStore } from '@/store/useAppStore';
import type { CropPreviewMetrics } from '@/utils/crop';
import { getVideoLogoBox, VIDEO_LOGO_OPACITY, VIDEO_LOGO_URL } from '@/components/sidebar/export/videoExportBrand';

export function VideoLogoPreview({ frame }: { frame: CropPreviewMetrics }) {
  const resolution = useAppStore((state) => state.videoExportSettings.resolution);
  const box = getVideoLogoBox(resolution.width, resolution.height);
  const scaleX = frame.frameWidth / resolution.width;
  const scaleY = frame.frameHeight / resolution.height;

  return (
    <img
      src={VIDEO_LOGO_URL}
      alt="TrailReplay"
      draggable={false}
      className="pointer-events-none absolute z-20 select-none"
      style={{
        left: frame.frameLeft + box.x * scaleX,
        top: frame.frameTop + box.y * scaleY,
        width: box.w * scaleX,
        height: box.h * scaleY,
        opacity: VIDEO_LOGO_OPACITY,
      }}
    />
  );
}
