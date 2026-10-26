import { describe, expect, it } from 'vitest';
import { advanceRouteComparisonCamera, markersFitInViewport, routeSplitCameraTarget, type RouteComparisonCameraPose } from './routeComparisonCameraMotion';

describe('route comparison camera motion', () => {
  const close: RouteComparisonCameraPose = { center: [0, 0], zoom: 17, pitch: 45, bearing: 350 };
  const wide: RouteComparisonCameraPose = { center: [0.01, 0.01], zoom: 12, pitch: 0, bearing: 10 };

  it('limits zoom changes in both directions and eases the whole pose', () => {
    const zoomingOut = advanceRouteComparisonCamera(close, wide, 1000);
    expect(zoomingOut.zoom).toBeCloseTo(16.6875);
    expect(zoomingOut.center[0]).toBeGreaterThan(0);
    expect(zoomingOut.center[0]).toBeLessThan(wide.center[0]);
    expect(zoomingOut.pitch).toBeGreaterThan(0);
    expect(zoomingOut.bearing).toBeGreaterThan(350);

    const zoomingIn = advanceRouteComparisonCamera(wide, close, 1000);
    expect(zoomingIn.zoom).toBeCloseTo(12.3125);
    expect(zoomingIn.center[0]).toBeGreaterThan(0);
    expect(zoomingIn.center[0]).toBeLessThan(wide.center[0]);
  });

  it('settles on the target through simulated frames', () => {
    let pose = close;
    for (let frame = 0; frame < 360; frame++) pose = advanceRouteComparisonCamera(pose, wide, 1000 / 60);
    expect(pose.zoom).toBeCloseTo(wide.zoom);
    expect(pose.center[0]).toBeCloseTo(wide.center[0], 4);
    expect(Math.abs(pose.pitch - wide.pitch)).toBeLessThan(0.01);
  });

  it('retains the Follow Behind pitch and heading while widening and panning toward the primary marker', () => {
    const base: RouteComparisonCameraPose = { center: [1, 42], zoom: 16, pitch: 55, bearing: 135 };
    const split = routeSplitCameraTarget(base, { center: [1.01, 42.01], zoom: 15 }, [1, 42]);
    expect(split.pitch).toBe(55);
    expect(split.bearing).toBe(135);
    expect(split.zoom).toBeLessThan(15);
    expect(split.center[0]).toBeCloseTo(1.008);
    expect(split.center[1]).toBeCloseTo(42.008);

    const topDown = routeSplitCameraTarget({ ...base, pitch: 0 }, { center: [1.01, 42.01], zoom: 15 }, [1, 42]);
    expect(topDown.zoom).toBe(15);

    const panOnly = routeSplitCameraTarget(base, { center: [1.01, 42.01], zoom: base.zoom }, [1, 42]);
    expect(panOnly.zoom).toBe(base.zoom);
  });

  it('keeps the normal camera when both moving markers fit in the visible viewport', () => {
    expect(markersFitInViewport([[400, 500], [700, 490]], 1000, 700, 32)).toBe(true);
    expect(markersFitInViewport([[400, 500], [975, 490]], 1000, 700, 32)).toBe(false);
    expect(markersFitInViewport([[400, 500], [700, -1]], 1000, 700, 32)).toBe(false);
  });
});
