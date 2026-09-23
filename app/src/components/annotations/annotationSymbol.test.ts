import { describe, expect, it } from 'vitest';
import { LANDMARK_GLYPH_KEYS, PINHEAD_PATHS } from '@/components/map/landmarkGlyphs';
import { annotationMapGlyph, annotationSymbolLabel, annotationSymbolPath, mapAnnotationSymbol } from './annotationSymbol';

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

  it('resolves the Pinhead jug and apple icon and names it for hover text', () => {
    expect(annotationSymbolPath('pinhead:jug_and_apple')).toBe(PINHEAD_PATHS.jug_and_apple);
    expect(annotationSymbolLabel('pinhead:jug_and_apple')).toBe('Jug and apple · aid station');
  });
});
