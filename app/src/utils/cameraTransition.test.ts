import { describe, expect, it } from 'vitest';
import { automaticTransitionPeak, defaultCameraTransitionDurationMs, transitionCameraPose, transitionSettings } from './cameraTransition';

const at = (lon: number, lat: number, zoom = 14, pitch = 50, bearing = 0) => ({ center: [lon, lat] as [number, number], zoom, pitch, bearing });
const view = { viewportPx: 1200 };
const peak = (start: ReturnType<typeof at>, end: ReturnType<typeof at>, options = view) => {
  let lowest = Infinity;
  for (let i = 0; i <= 200; i++) lowest = Math.min(lowest, transitionCameraPose(start, end, i / 200, options).zoom);
  return lowest;
};

describe('camera transition flight', () => {
  it('climbs higher the further it has to fly', () => {
    const hop = peak(at(2, 41.4), at(2.03, 41.4));          // ~2.5 km
    const region = peak(at(2, 41.4), at(2.8, 41.6));        // ~70 km
    const country = peak(at(2, 41.4), at(-3.7, 40.4));      // ~500 km
    expect(hop).toBeGreaterThan(11);
    expect(region).toBeLessThan(hop - 2);
    expect(country).toBeLessThan(region - 2);
    expect(automaticTransitionPeak({ lat: 41.4, lon: 2 }, { lat: 40.4, lon: -3.7 }).zoom).toBeLessThan(automaticTransitionPeak({ lat: 41.4, lon: 2 }, { lat: 41.4, lon: 2.03 }).zoom);
  });

  it('starts and ends exactly on the route cameras, at rest', () => {
    const start = at(2, 41, 15, 50, 350), end = at(5, 42, 13, 40, 10);
    expect(transitionCameraPose(start, end, 0, view)).toEqual(start);
    expect(transitionCameraPose(start, end, 1, view)).toEqual(end);
    // velocity eases to zero at both ends, like the opening fly-in
    for (const [a, b] of [[0, 0.002], [0.998, 1]]) {
      const p = transitionCameraPose(start, end, a, view), q = transitionCameraPose(start, end, b, view);
      expect(Math.abs(p.zoom - q.zoom)).toBeLessThan(0.002);
      expect(Math.abs(p.center[0] - q.center[0])).toBeLessThan(0.001);
    }
  });

  it('moves continuously, with no jumps in any channel', () => {
    const start = at(2, 41, 15, 50, 350), end = at(5, 42, 13, 40, 10);
    let prev = transitionCameraPose(start, end, 0, view);
    for (let i = 1; i <= 400; i++) {
      const next = transitionCameraPose(start, end, i / 400, view);
      expect(Math.abs(next.zoom - prev.zoom)).toBeLessThan(0.1);
      expect(Math.abs(next.pitch - prev.pitch)).toBeLessThan(1);
      expect(Math.abs(((next.bearing - prev.bearing + 540) % 360) - 180)).toBeLessThan(1.5);
      expect(Math.abs(next.center[0] - prev.center[0])).toBeLessThan(0.06);
      prev = next;
    }
  });

  it('honours a zoom and tilt set by hand', () => {
    const start = at(2, 41.4), end = at(2.03, 41.4);
    expect(peak(start, end, { viewportPx: 1200, peakZoom: 8 } as typeof view)).toBeCloseTo(8, 1);
    const mid = transitionCameraPose(start, end, 0.5, { viewportPx: 1200, peakZoom: 8, pitch: 20 });
    expect(mid.pitch).toBeCloseTo(20, 0);
  });

  it('crosses the dateline by the short path', () => {
    const mid = transitionCameraPose(at(179, 0), at(-179, 0), 0.5, view);
    expect(Math.abs(Math.abs(mid.center[0]) - 180)).toBeLessThan(0.01);
  });
});

describe('camera transition settings', () => {
  it('is automatic unless set, and reads saved draft zoom settings', () => {
    expect(transitionSettings({})).toEqual({ zoom: undefined, pitch: undefined });
    expect(transitionSettings({ cameraZoomOut: 6 })).toEqual({ zoom: 8, pitch: undefined });
    expect(transitionSettings({ cameraTransitionZoom: 7, cameraTransitionPitch: 45 })).toEqual({ zoom: 7, pitch: 45 });
  });

  it('gives longer flights more time', () => {
    expect(defaultCameraTransitionDurationMs(0.2)).toBe(2500);
    expect(defaultCameraTransitionDurationMs(3)).toBeGreaterThan(3000);
    expect(defaultCameraTransitionDurationMs(10)).toBeLessThan(5000);
    expect(defaultCameraTransitionDurationMs(500)).toBe(6000);
  });
});
