import { useEffect, useState, type RefObject } from 'react';
import { getCropPreviewMetrics, type CropRatio } from '@/utils/crop';
import { useI18n } from '@/i18n/useI18n';

export function CropPreviewBars({
  ratio,
  containerRef,
}: {
  ratio: CropRatio;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const [cropPreview, setCropPreview] = useState<{
    left: number;
    right: number;
    top: number;
    bottom: number;
    frameLeft: number;
    frameTop: number;
    frameWidth: number;
    frameHeight: number;
  } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      setCropPreview(getCropPreviewMetrics(element.clientWidth, element.clientHeight, ratio));
    };

    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [containerRef, ratio]);

  if (!cropPreview) return null;

  return (
    <>
      {cropPreview.left > 0 && <>
        <div className="absolute inset-y-0 left-0 bg-black/55 z-30 pointer-events-none" style={{ width: cropPreview.left }} />
        <div className="absolute inset-y-0 right-0 bg-black/55 z-30 pointer-events-none" style={{ width: cropPreview.right }} />
      </>}
      {cropPreview.top > 0 && <>
        <div className="absolute inset-x-0 top-0 bg-black/55 z-30 pointer-events-none" style={{ height: cropPreview.top }} />
        <div className="absolute inset-x-0 bottom-0 bg-black/55 z-30 pointer-events-none" style={{ height: cropPreview.bottom }} />
      </>}
      <div
        className="absolute z-30 pointer-events-none rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.08)]"
        style={{
          left: cropPreview.frameLeft,
          top: cropPreview.frameTop,
          width: cropPreview.frameWidth,
          height: cropPreview.frameHeight,
        }}
      />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-black/70 text-white text-xs px-2 py-0.5 rounded">
        {t('interface.exportCrop')} {ratio}
      </div>
    </>
  );
}
