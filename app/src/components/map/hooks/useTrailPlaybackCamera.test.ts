import { describe, expect, it } from 'vitest';
import {
  PLAYBACK_MARKER_OPTIONS,
  resolvePlaybackMarkerColor,
  updatePlaybackMarkerElement,
} from './useTrailPlaybackCamera';

describe('playback marker presentation', () => {
  it('keeps the moving marker at subpixel precision', () => {
    expect(PLAYBACK_MARKER_OPTIONS).toEqual({
      anchor: 'center',
      subpixelPositioning: true,
    });
  });

  it('uses each journey track color while the marker color remains linked to the active track', () => {
    expect(resolvePlaybackMarkerColor('#C1652F', '#c1652f', '#3B82F6')).toBe('#3B82F6');
    expect(resolvePlaybackMarkerColor('#111111', '#C1652F', '#3B82F6')).toBe('#111111');
  });

  it('keeps the label in the marker element and treats imported names as text', () => {
    const element = document.createElement('div');
    updatePlaybackMarkerElement(
      element,
      '<span data-testid="marker-center"></span>',
      { color: '#3B82F6', fontFamily: "'Inter', sans-serif", text: '<img src=x onerror=alert(1)>' },
    );

    expect(element.querySelector('[data-testid="marker-center"]')).not.toBeNull();
    expect(element.querySelector('.tr-marker-label')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect((element.querySelector('.tr-marker-label') as HTMLElement).style.fontFamily).toContain('Inter');
    expect(element.querySelector('.tr-marker-label img')).toBeNull();
  });
});
