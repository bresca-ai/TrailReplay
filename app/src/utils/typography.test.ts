import { describe, expect, it } from 'vitest';
import { OVERLAY_FONT_OPTIONS, overlayFontFamily } from './typography';

describe('overlay typography', () => {
  it('maps every open-source preset to its self-hosted family', () => {
    expect(overlayFontFamily('modern')).toContain('Inter');
    expect(overlayFontFamily('editorial')).toContain('Source Serif 4');
    expect(overlayFontFamily('technical')).toContain('JetBrains Mono');
    expect(overlayFontFamily('condensed')).toContain('Barlow Condensed');
    expect(overlayFontFamily('geometric')).toContain('Montserrat');
  });

  it('keeps legacy projects on the original technical style', () => {
    expect(overlayFontFamily(undefined)).toContain('JetBrains Mono');
  });

  it('offers five distinct open-source font choices', () => {
    expect(OVERLAY_FONT_OPTIONS.map((option) => option.id)).toEqual([
      'modern',
      'editorial',
      'technical',
      'condensed',
      'geometric',
    ]);
  });
});
