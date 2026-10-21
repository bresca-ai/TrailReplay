import { describe, expect, it } from 'vitest';
import {
  resolvePlaybackMarkerColor,
  shouldRenderPlaybackAdornment,
  updatePlaybackMarkerElement,
} from './useTrailPlaybackCamera';

describe('playback marker presentation', () => {
  it('preserves the icon, pulse, and label nodes during unchanged playback updates', () => {
    const element = document.createElement('div');
    const html = '<span class="pulse">runner</span>';
    const label = { color: '#123456', fontFamily: 'Inter', text: 'Race' };
    updatePlaybackMarkerElement(element, html, label);
    const iconNode = element.firstChild;
    const labelNode = element.lastChild;
    updatePlaybackMarkerElement(element, html, { ...label });
    expect(element.firstChild).toBe(iconNode);
    expect(element.lastChild).toBe(labelNode);
    updatePlaybackMarkerElement(element, html, { ...label, text: 'Second leg' });
    expect(element.querySelector('.tr-marker-label')?.textContent).toBe('Second leg');
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

  it('never renders the moving marker or label over an active track annotation', () => {
    expect(shouldRenderPlaybackAdornment({
      activeTextAnnotationId: 'annotation-1',
      animationPhase: 'playing',
      playbackProgress: 0.5,
      showMarker: true,
      showTrackLabels: true,
    })).toBe(false);

    expect(shouldRenderPlaybackAdornment({
      activeTextAnnotationId: null,
      animationPhase: 'playing',
      playbackProgress: 0.5,
      showMarker: true,
      showTrackLabels: true,
    })).toBe(true);
  });

  it('shows the start marker during the intro without showing it during tile preloading', () => {
    const options = {
      activeTextAnnotationId: null,
      playbackProgress: 0,
      showMarker: true,
      showTrackLabels: false,
    };

    expect(shouldRenderPlaybackAdornment({ ...options, animationPhase: 'preloading' })).toBe(false);
    expect(shouldRenderPlaybackAdornment({ ...options, animationPhase: 'intro' })).toBe(true);
  });
});
