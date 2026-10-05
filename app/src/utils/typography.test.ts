import { describe, expect, it } from 'vitest';
import { applyOverlayTextCase, overlayFontFamily } from './typography';

describe('overlay typography', () => {
  it('maps every open-source preset to its self-hosted family', () => {
    expect(overlayFontFamily('modern')).toContain('Inter');
    expect(overlayFontFamily('editorial')).toContain('Source Serif 4');
    expect(overlayFontFamily('technical')).toContain('JetBrains Mono');
  });

  it('keeps legacy projects on the original technical style', () => {
    expect(overlayFontFamily(undefined)).toContain('JetBrains Mono');
  });

  it('only changes authored casing when uppercase is selected', () => {
    expect(applyOverlayTextCase('Coll de Toses', 'original', 'ca')).toBe('Coll de Toses');
    expect(applyOverlayTextCase('Coll de Toses', 'uppercase', 'ca')).toBe('COLL DE TOSES');
  });
});
