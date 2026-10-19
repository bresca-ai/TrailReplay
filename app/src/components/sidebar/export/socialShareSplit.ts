import type { SocialShareSettings } from '@/types';

export type SplitMapFrame = NonNullable<SocialShareSettings['splitMapFrame']>;

/** Shared poster geometry for the inset map, editor handle, and export. */
export function getSplitMapFrame(width: number, height: number, frame?: SplitMapFrame): SplitMapFrame {
  const wide = width > height;
  const fallback = wide
    ? { x: 0.35, y: 0.45, w: 0.30, h: 0.27 }
    : { x: 0.24, y: 0.53, w: 0.52, h: 0.20 };
  const source = frame ?? fallback;
  const w = Math.max(0.18, Math.min(0.9, source.w));
  const h = Math.max(0.12, Math.min(0.7, source.h));
  return {
    x: Math.max(0, Math.min(1 - w, source.x)),
    y: Math.max(0, Math.min(1 - h, source.y)),
    w,
    h,
  };
}

export function getSplitMapBox(width: number, height: number, frame?: SplitMapFrame) {
  const normalized = getSplitMapFrame(width, height, frame);
  return {
    x: normalized.x * width,
    y: normalized.y * height,
    w: normalized.w * width,
    h: normalized.h * height,
  };
}
