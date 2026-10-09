import { describe, expect, it } from 'vitest';
import {
  lastPaintedCoordinate,
  resolvePlaybackMarkerColor,
  updatePlaybackMarkerElement,
} from './useTrailPlaybackCamera';

describe('playback marker presentation', () => {
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

  it('places the marker at the final coordinate painted by the completed trail', () => {
    expect(lastPaintedCoordinate({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { color: '#111111' },
          geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
        },
        {
          type: 'Feature',
          properties: { color: '#222222' },
          geometry: { type: 'LineString', coordinates: [[3, 4], [5, 6]] },
        },
      ],
    })).toEqual([5, 6]);
  });
});
