import { describe, expect, it } from 'vitest';
import { OVERLAY_FONT_OPTIONS, overlayCanvasFontFamily, overlayFontFamily, TRADITIONAL_CHINESE_FONT_FAMILY } from './typography';

describe('overlay typography', () => {
  it('uses Traditional Chinese fallbacks in both browser and canvas text for every preset', () => {
    for (const { id } of OVERLAY_FONT_OPTIONS) {
      expect(overlayFontFamily(id)).toContain('PingFang TC');
      expect(overlayFontFamily(id)).toContain('Microsoft JhengHei');
      expect(overlayCanvasFontFamily(id)).toBe(overlayFontFamily(id));
    }
    expect(TRADITIONAL_CHINESE_FONT_FAMILY).toContain('Noto Sans TC');
  });
  it('maps every open-source preset to its self-hosted family', () => {
    expect(overlayFontFamily('modern')).toContain('Inter');
    expect(overlayFontFamily('editorial')).toContain('Source Serif 4');
    expect(overlayFontFamily('technical')).toContain('JetBrains Mono');
    expect(overlayFontFamily('condensed')).toContain('Barlow Condensed');
    expect(overlayFontFamily('geometric')).toContain('Montserrat');
    expect(overlayFontFamily('poster')).toContain('Anton');
    expect(overlayFontFamily('display')).toContain('Bebas Neue');
  });

  it('keeps legacy projects on the original technical style', () => {
    expect(overlayFontFamily(undefined)).toContain('JetBrains Mono');
  });

  it('offers seven distinct open-source font choices', () => {
    expect(OVERLAY_FONT_OPTIONS.map((option) => option.id)).toEqual([
      'modern',
      'editorial',
      'technical',
      'condensed',
      'geometric',
      'poster',
      'display',
    ]);
  });
});
