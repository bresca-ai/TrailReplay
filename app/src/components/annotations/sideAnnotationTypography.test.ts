import { describe, expect, it } from 'vitest';
import {
  getSideAnnotationTypography,
  SIDE_ANNOTATION_TYPOGRAPHY,
} from './sideAnnotationTypography';

describe('side annotation typography', () => {
  it('uses the larger baseline for the map and landscape exports', () => {
    expect(getSideAnnotationTypography()).toBe(SIDE_ANNOTATION_TYPOGRAPHY.wide);
    expect(getSideAnnotationTypography('16:9')).toBe(SIDE_ANNOTATION_TYPOGRAPHY.wide);
    expect(getSideAnnotationTypography('16:9')).toMatchObject({
      titleSize: 30,
      detailsSize: 16,
    });
  });

  it.each(['1:1', '9:16'] as const)('uses the phone-readable scale for %s exports', (aspectRatio) => {
    const typography = getSideAnnotationTypography(aspectRatio);

    expect(typography).toBe(SIDE_ANNOTATION_TYPOGRAPHY.narrow);
    expect(typography.titleSize).toBeGreaterThan(getSideAnnotationTypography('16:9').titleSize);
    expect(typography.detailsSize).toBeGreaterThan(getSideAnnotationTypography('16:9').detailsSize);
  });
});
