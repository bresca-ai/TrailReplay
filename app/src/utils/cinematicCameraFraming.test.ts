import { describe, expect, it } from 'vitest';
import { getSmoothedCameraAnchor, visibleWidthMetersAtZoom } from './cinematicCameraAnchor';
import { getInterpolatedRouteCoordinate } from './replayCameraPlan';

describe('cinematic framing on a winding route', () => {
  it('changes continuously as zoom crosses competing window-fit solutions', () => {
    const coordinates = Array.from({ length: 601 }, (_, i) => [
      0.015 * Math.sin(i / 15) + 0.007 * Math.sin(i / 4), 45 + 0.00003 * i,
    ]);
    const progress = 0.82;
    const markerPosition = getInterpolatedRouteCoordinate(coordinates, progress * 600)!;
    const anchor = (zoom: number) => getSmoothedCameraAnchor({
      coordinates, progress, smoothingHalfWindow: 0.0625, markerPosition, zoom,
    });
    let previous = anchor(17.79);
    for (let i = 1; i <= 20; i++) {
      const zoom = 17.79 + i * 0.001;
      const current = anchor(zoom);
      const distance = (a: number[], b: number[]) => Math.hypot(
        (a[0] - b[0]) * 78715, (a[1] - b[1]) * 111320,
      );
      expect(distance(previous, current)).toBeLessThan(1);
      expect(distance(markerPosition, current)).toBeLessThanOrEqual(
        visibleWidthMetersAtZoom(zoom, markerPosition[1]) * 0.22 + 0.01,
      );
      previous = current;
    }
  });
});
