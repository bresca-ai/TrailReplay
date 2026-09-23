import { describe, expect, it } from 'vitest';
import { LANDMARK_GLYPH_KEYS, PINHEAD_PATHS } from '@/components/map/landmarkGlyphs';
import {
  annotationMapGlyph,
  annotationPinheadId,
  annotationSymbolLabel,
  annotationSymbolPath,
  mapAnnotationSymbol,
  needsPinheadIcons,
  pinheadAnnotationSymbol,
} from './annotationSymbol';

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

  it('keeps library icons apart from built-in glyphs that share a name', () => {
    expect(annotationPinheadId(pinheadAnnotationSymbol('pin'))).toBe('pin');
    expect(annotationMapGlyph(pinheadAnnotationSymbol('pin'))).toBeNull();
    expect(annotationPinheadId(mapAnnotationSymbol('pin'))).toBeNull();
  });

  it('draws the pin, not raw text, for an icon it cannot resolve yet', () => {
    expect(annotationSymbolPath(pinheadAnnotationSymbol('mountain'))).toBe(PINHEAD_PATHS.pin);
    expect(annotationSymbolPath('map:unknown')).toBe(PINHEAD_PATHS.pin);
  });

  it('only asks for the library when a library icon is used', () => {
    expect(needsPinheadIcons([mapAnnotationSymbol('summit'), '🚰', undefined])).toBe(false);
    expect(needsPinheadIcons([undefined, pinheadAnnotationSymbol('mountain')])).toBe(true);
  });

  it('names Pinhead icons for hover text', () => {
    expect(annotationSymbolLabel(pinheadAnnotationSymbol('jug_and_apple'))).toBe('jug and apple');
  });
});
