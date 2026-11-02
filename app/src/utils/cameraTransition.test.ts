import { describe, expect, it } from 'vitest';
import { cameraTransitionPose } from './cameraTransition';

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
