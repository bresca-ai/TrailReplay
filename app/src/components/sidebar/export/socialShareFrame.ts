export interface PosterFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FrameCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampPosterFrame(frame: PosterFrame, minWidth = 0.12, minHeight = 0.1): PosterFrame {
  const w = clamp(frame.w, minWidth, 1);
  const h = clamp(frame.h, minHeight, 1);
  return { x: clamp(frame.x, 0, 1 - w), y: clamp(frame.y, 0, 1 - h), w, h };
}

export function movePosterFrame(frame: PosterFrame, dx: number, dy: number): PosterFrame {
  return clampPosterFrame({ ...frame, x: frame.x + dx, y: frame.y + dy });
}

export function resizePosterFrame(
  frame: PosterFrame,
  corner: FrameCorner,
  dx: number,
  dy: number,
  minWidth = 0.12,
  minHeight = 0.1,
): PosterFrame {
  const fromLeft = corner.includes('left');
  const fromTop = corner.includes('top');
  const w = clamp(frame.w + (fromLeft ? -dx : dx), minWidth, 1);
  const h = clamp(frame.h + (fromTop ? -dy : dy), minHeight, 1);
  // Once the dragged corner reaches an edge, slide the opposite edge instead.
  // This lets an inset grow all the way to the poster width or height.
  const x = clamp(fromLeft ? frame.x + frame.w - w : frame.x, 0, 1 - w);
  const y = clamp(fromTop ? frame.y + frame.h - h : frame.y, 0, 1 - h);
  return { x, y, w, h };
}
