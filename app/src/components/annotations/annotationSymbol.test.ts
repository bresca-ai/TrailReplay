import { describe, expect, it } from 'vitest';
import { LANDMARK_GLYPH_KEYS, PINHEAD_PATHS } from '@/components/map/landmarkGlyphs';
import { annotationMapGlyph, annotationSymbolPath, mapAnnotationSymbol } from './annotationSymbol';

describe('annotation symbols', () => {
  it('offers every map glyph through a stable value', () => {
    LANDMARK_GLYPH_KEYS.forEach((glyph) => {
      const value = mapAnnotationSymbol(glyph);
      expect(annotationMapGlyph(value)).toBe(glyph);
      expect(annotationSymbolPath(value)).toBe(PINHEAD_PATHS[glyph]);
    });
  });

  it('preserves existing emoji and rejects unknown map glyphs', () => {
    expect(annotationMapGlyph('🚰')).toBeNull();
    expect(annotationSymbolPath('🚰')).toBeNull();
    expect(annotationMapGlyph('map:unknown')).toBeNull();
  });
});
