import { describe, expect, it } from 'vitest';
import { getSideAnnotationTypography } from './sideAnnotationTypography';

describe('side annotation typography', () => {
  it('keeps the landscape defaults', () => {
    expect(getSideAnnotationTypography('16:9').titleSize).toBe(23);
    expect(getSideAnnotationTypography('16:9').detailsSize).toBe(12);
  });

  it('uses larger type for square and vertical video exports', () => {
    const landscape = getSideAnnotationTypography('16:9');
    expect(getSideAnnotationTypography('1:1').titleSize).toBeGreaterThan(landscape.titleSize);
    expect(getSideAnnotationTypography('9:16').detailsSize).toBeGreaterThan(landscape.detailsSize);
  });
});
