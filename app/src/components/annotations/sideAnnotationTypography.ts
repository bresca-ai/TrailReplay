import type { AspectRatio } from '@/types';

export interface SideAnnotationTypography {
  eyebrowSize: number;
  codeSize: number;
  titleSize: number;
  metaSize: number;
  detailsSize: number;
}

export const SIDE_ANNOTATION_TYPOGRAPHY = {
  wide: {
    eyebrowSize: 12,
    codeSize: 18,
    titleSize: 30,
    metaSize: 15,
    detailsSize: 16,
  },
  narrow: {
    eyebrowSize: 14,
    codeSize: 22,
    titleSize: 36,
    metaSize: 18,
    detailsSize: 18,
  },
} as const satisfies Record<'wide' | 'narrow', SideAnnotationTypography>;

/** Keep compact exports legible when they are viewed at phone size. */
export function getSideAnnotationTypography(aspectRatio?: AspectRatio): SideAnnotationTypography {
  return aspectRatio === '1:1' || aspectRatio === '9:16'
    ? SIDE_ANNOTATION_TYPOGRAPHY.narrow
    : SIDE_ANNOTATION_TYPOGRAPHY.wide;
}
