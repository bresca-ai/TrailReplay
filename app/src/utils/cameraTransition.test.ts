import { describe, expect, it } from 'vitest';
import { arrivalZoomOffset, cameraTransitionPose, transitionCameraPose } from './cameraTransition';

describe('camera transition', () => {
  it('zooms out before panning and zooms back in at the destination', () => {
    const pose = (p: number) => cameraTransitionPose([1, 42], [4, 43], p, 14, 13, 5);
    expect(pose(0)).toEqual({ center: [1, 42], zoom: 14 });
    expect(pose(0.25)).toEqual({ center: [1, 42], zoom: 5 });
    expect(pose(0.5)).toEqual({ center: [2.5, 42.5], zoom: 5 });
    expect(pose(1)).toEqual({ center: [4, 43], zoom: 13 });
  });
  it('crosses the dateline by the short path', () => {
    expect(cameraTransitionPose([179, 0], [-179, 0], 0.5, 14, 14, 2).center[0]).toBe(180);
  });
});


describe('camera pose continuity', () => {
  it('joins the actual outgoing pose and the destination pose smoothly', () => {
    const start = { center: [2, 41] as [number, number], zoom: 15, pitch: 50, bearing: 350 };
    const end = { center: [5, 42] as [number, number], zoom: 13, pitch: 40, bearing: 10 };
    expect(transitionCameraPose(start, end, 0, 8)).toEqual(start);
    const final = transitionCameraPose(start, end, 1, 8);
    expect(final.center).toEqual(end.center);
    expect(final.zoom).toBe(end.zoom);
    expect(final.pitch).toBe(end.pitch);
    expect(final.bearing % 360).toBe(end.bearing);
    for (const boundary of [0, 0.25, 0.5, 0.75, 1]) {
      const before = transitionCameraPose(start, end, boundary - 0.00001, 8);
      const after = transitionCameraPose(start, end, boundary + 0.00001, 8);
      expect(Math.abs(before.zoom - after.zoom)).toBeLessThan(0.001);
      expect(Math.abs(before.pitch - after.pitch)).toBeLessThan(0.01);
      expect(Math.abs(before.bearing - after.bearing)).toBeLessThan(0.01);
      expect(Math.abs(before.center[0] - after.center[0])).toBeLessThan(0.001);
    }
  });
  it('smoothly returns custom arrival zoom to the route camera', () => {
    expect(arrivalZoomOffset(2, 0)).toBe(2);
    expect(arrivalZoomOffset(2, 750)).toBe(1);
    expect(arrivalZoomOffset(2, 1500)).toBe(0);
    expect(arrivalZoomOffset(2, 2000)).toBe(0);
  });
});
