import type { AspectRatio, SocialShareAspectRatio } from '@/types';

export type CropRatio = AspectRatio | SocialShareAspectRatio;

export type CropPreviewMetrics = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  frameLeft: number;
  frameTop: number;
  frameWidth: number;
  frameHeight: number;
};

export type CropRegion = {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
};

export type CropFitPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const MIN_EXPORT_FIT_MARGIN_PX = 24;
const EXPORT_FIT_MARGIN_RATIO = 0.05;

export function getAspectRatioValue(ratio: CropRatio) {
  if (ratio === '16:9') return 16 / 9;
  if (ratio === '1:1') return 1;
  if (ratio === '4:5') return 4 / 5;
  return 9 / 16;
}

export function getCropPreviewMetrics(
  width: number,
  height: number,
  ratio: CropRatio
): CropPreviewMetrics {
  const containerAspect = width / height;
  const targetAspect = getAspectRatioValue(ratio);

  if (containerAspect > targetAspect) {
    const cropW = height * targetAspect;
    const bar = (width - cropW) / 2;
    return {
      left: bar,
      right: bar,
      top: 0,
      bottom: 0,
      frameLeft: bar,
      frameTop: 0,
      frameWidth: cropW,
      frameHeight: height,
    };
  }

  const cropH = width / targetAspect;
  const bar = (height - cropH) / 2;
  return {
    left: 0,
    right: 0,
    top: bar,
    bottom: bar,
    frameLeft: 0,
    frameTop: bar,
    frameWidth: width,
    frameHeight: cropH,
  };
}

export function getCropRegion(
  containerRect: { width: number; height: number },
  recordW: number,
  recordH: number
): CropRegion {
  const targetAspect = recordW / recordH;
  const containerAspect = containerRect.width / containerRect.height;
  let cropX = 0;
  let cropY = 0;
  let cropW = containerRect.width;
  let cropH = containerRect.height;

  if (targetAspect < containerAspect - 0.01) {
    cropW = containerRect.height * targetAspect;
    cropX = (containerRect.width - cropW) / 2;
  } else if (targetAspect > containerAspect + 0.01) {
    cropH = containerRect.width / targetAspect;
    cropY = (containerRect.height - cropH) / 2;
  }

  return { cropX, cropY, cropW, cropH };
}

/**
 * Converts the centered export crop into MapLibre padding. The crop bars are
 * treated as unavailable map space, while the additional safe margin keeps
 * the route from touching the exported video's edges.
 */
export function getExportFrameFitPadding(
  exportFrame: CropPreviewMetrics,
): CropFitPadding {
  const safeMargin = Math.max(
    MIN_EXPORT_FIT_MARGIN_PX,
    Math.min(exportFrame.frameWidth, exportFrame.frameHeight) * EXPORT_FIT_MARGIN_RATIO,
  );

  return {
    top: exportFrame.top + safeMargin,
    right: exportFrame.right + safeMargin,
    bottom: exportFrame.bottom + safeMargin,
    left: exportFrame.left + safeMargin,
  };
}
