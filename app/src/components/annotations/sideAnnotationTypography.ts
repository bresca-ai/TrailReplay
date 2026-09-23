import type { AspectRatio } from '@/types';

export interface SideAnnotationTypography {
  eyebrowSize: number;
  codeSize: number;
  titleSize: number;
  metaSize: number;
  detailsLabelSize: number;
  detailsSize: number;
}

const LANDSCAPE_TYPOGRAPHY: SideAnnotationTypography = {
  eyebrowSize: 10,
  codeSize: 15,
  titleSize: 23,
  metaSize: 12,
  detailsLabelSize: 10,
  detailsSize: 12,
};

const NARROW_TYPOGRAPHY: SideAnnotationTypography = {
  eyebrowSize: 12,
  codeSize: 18,
  titleSize: 30,
  metaSize: 16,
  detailsLabelSize: 12,
  detailsSize: 16,
};

/** Larger field-note type keeps square and vertical exports readable on phones. */
export function getSideAnnotationTypography(aspectRatio?: AspectRatio): SideAnnotationTypography {
  return aspectRatio === '1:1' || aspectRatio === '9:16'
    ? NARROW_TYPOGRAPHY
    : LANDSCAPE_TYPOGRAPHY;
}
