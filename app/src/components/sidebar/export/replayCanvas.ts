import type { ReplayBlock, ReplayRect } from './replayComposition';

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDrawRect extends PixelRect {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Convert a normalized composition rectangle into a safe pixel rectangle. */
export function getBlockPixelRect(
  block: Pick<ReplayRect, 'x' | 'y' | 'width' | 'height'>,
  canvasWidth: number,
  canvasHeight: number,
): PixelRect {
  const width = Math.max(0, finiteOr(canvasWidth, 0));
  const height = Math.max(0, finiteOr(canvasHeight, 0));
  const x = Math.min(1, Math.max(0, finiteOr(block.x, 0)));
  const y = Math.min(1, Math.max(0, finiteOr(block.y, 0)));
  const normalizedWidth = Math.min(1 - x, Math.max(0, finiteOr(block.width, 0)));
  const normalizedHeight = Math.min(1 - y, Math.max(0, finiteOr(block.height, 0)));
  return { x: x * width, y: y * height, width: normalizedWidth * width, height: normalizedHeight * height };
}

/** Sort blocks from back to front without changing the order of equal z-indexes. */
export function sortBlocksForRender<T extends Pick<ReplayBlock, 'zIndex'>>(blocks: readonly T[]): T[] {
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => {
      const z = finiteOr(a.block.zIndex, 0) - finiteOr(b.block.zIndex, 0);
      return z || a.index - b.index;
    })
    .map(({ block }) => block);
}

/**
 * Resolve object-fit geometry for a source image/video and a target box.
 * Cover crops the source; contain preserves the complete source and centers it.
 */
export function getObjectFitDrawRect(
  sourceWidth: number,
  sourceHeight: number,
  target: PixelRect,
  fit: 'cover' | 'contain' = 'cover',
): ImageDrawRect {
  const sw = Math.max(0, finiteOr(sourceWidth, 0));
  const sh = Math.max(0, finiteOr(sourceHeight, 0));
  const tw = Math.max(0, finiteOr(target.width, 0));
  const th = Math.max(0, finiteOr(target.height, 0));
  if (!sw || !sh || !tw || !th) {
    return { ...target, width: tw, height: th, sourceX: 0, sourceY: 0, sourceWidth: sw, sourceHeight: sh };
  }

  const sourceAspect = sw / sh;
  const targetAspect = tw / th;
  if (fit === 'contain') {
    const scale = Math.min(tw / sw, th / sh);
    const drawWidth = sw * scale;
    const drawHeight = sh * scale;
    return {
      x: target.x + (tw - drawWidth) / 2,
      y: target.y + (th - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: sw,
      sourceHeight: sh,
    };
  }

  if (sourceAspect > targetAspect) {
    const sourceWidth = sh * targetAspect;
    return { ...target, sourceX: (sw - sourceWidth) / 2, sourceY: 0, sourceWidth, sourceHeight: sh };
  }
  const croppedSourceHeight = sw / targetAspect;
  return { ...target, sourceX: 0, sourceY: (sh - croppedSourceHeight) / 2, sourceWidth: sw, sourceHeight: croppedSourceHeight };
}

export interface DrawActionVideoOptions {
  fit?: 'cover' | 'contain';
  background?: string;
}

/** Paint a persistent action-video element into a clipped composition block. */
export function drawActionVideo(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement | null | undefined,
  target: PixelRect,
  options: DrawActionVideoOptions = {},
): boolean {
  if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0 || target.width <= 0 || target.height <= 0) {
    return false;
  }

  context.save();
  try {
    if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(target.x, target.y, target.width, target.height);
    }
    context.beginPath();
    context.rect(target.x, target.y, target.width, target.height);
    context.clip();
    const draw = getObjectFitDrawRect(video.videoWidth, video.videoHeight, target, options.fit ?? 'cover');
    context.drawImage(video, draw.sourceX, draw.sourceY, draw.sourceWidth, draw.sourceHeight, draw.x, draw.y, draw.width, draw.height);
  } finally {
    context.restore();
  }
  return true;
}

// Short aliases keep call sites expressive without duplicating the geometry implementation.
export const normalizedBlockToPixelRect = getBlockPixelRect;
export const getObjectFitSourceRect = getObjectFitDrawRect;
export const drawPersistentActionVideo = drawActionVideo;
