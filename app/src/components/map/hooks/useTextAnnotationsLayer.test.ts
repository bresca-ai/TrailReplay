import { describe, expect, it } from 'vitest';
import { annotationTextOnLeft } from './useTextAnnotationsLayer';

describe('map annotation text placement', () => {
  it('moves text to the side with room while leaving the pin anchored', () => {
    expect(annotationTextOnLeft(150, 0, 300, 150, 20)).toBe(false);
    expect(annotationTextOnLeft(230, 0, 300, 150, 20)).toBe(true);
    expect(annotationTextOnLeft(40, 0, 300, 150, 20)).toBe(false);
  });
});
