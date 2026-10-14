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
    eyebrowSize: 11,
    codeSize: 17,
    titleSize: 28,
    metaSize: 14,
    detailsSize: 15,
  },
  narrow: {
    eyebrowSize: 12,
    codeSize: 19,
    titleSize: 30,
    metaSize: 16,
    detailsSize: 16,
  },
} as const satisfies Record<'wide' | 'narrow', SideAnnotationTypography>;

/** Keep compact exports legible when they are viewed at phone size. */
export function getSideAnnotationTypography(aspectRatio?: AspectRatio): SideAnnotationTypography {
  return aspectRatio === '1:1' || aspectRatio === '9:16'
    ? SIDE_ANNOTATION_TYPOGRAPHY.narrow
    : SIDE_ANNOTATION_TYPOGRAPHY.wide;
}
