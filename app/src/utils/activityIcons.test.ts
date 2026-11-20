import { describe, expect, it } from 'vitest';
import { getActivityIconMarkerHtml, getActivityIconOption, isSingleEmoji, MODEL_3D_ICONS, is3DActivityIcon } from './activityIcons';

describe('custom activity icons', () => {
  it('accepts a single emoji including joined and flag sequences', () => {
    expect(isSingleEmoji('👩🏽‍🚒')).toBe(true);
    expect(isSingleEmoji('🇪🇸')).toBe(true);
    expect(isSingleEmoji('1️⃣')).toBe(true);
    expect(isSingleEmoji('🏃🚴')).toBe(false);
    expect(isSingleEmoji('hello')).toBe(false);
  });

  it('renders uploaded PNG data as an image marker', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(getActivityIconOption(png)?.kind).toBe('upload');
    expect(getActivityIconMarkerHtml(png, 32, '#000')).toContain(`<img src="${png}"`);
    expect(getActivityIconOption('data:image/svg+xml;base64,abc')).toBeUndefined();
  });
});


it('registers every built-in 3D model as an available route marker', () => {
  expect(MODEL_3D_ICONS).toHaveLength(19);
  expect(MODEL_3D_ICONS).toEqual(expect.arrayContaining(['3d-motocross', '3d-race-motorbike', '3d-paraglider', '3d-bus', '3d-plane', '3d-train', '3d-boat', '3d-sailboat']));
  for (const value of MODEL_3D_ICONS) {
    expect(is3DActivityIcon(value)).toBe(true);
    expect(getActivityIconOption(value)?.kind).toBe('3d');
    expect(getActivityIconMarkerHtml(value, 28, '#000')).toContain('data-runner-3d');
  }
});
