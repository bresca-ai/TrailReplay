import { describe, expect, it } from 'vitest';
import { orbitPoseFromDrag } from '@/utils/cinematicOrbitInteraction';

describe('cinematic orbit dragging', () => {
  it('keeps the current pose when a drag begins', () => {
    expect(orbitPoseFromDrag(120, 55, 0, 0)).toEqual({ bearingDeg: 120, pitchDeg: 55 });
  });

  it('turns horizontally through north and tilts vertically within camera limits', () => {
    expect(orbitPoseFromDrag(350, 40, 40, -20)).toEqual({ bearingDeg: 10, pitchDeg: 30 });
    expect(orbitPoseFromDrag(0, 40, 0, 300).pitchDeg).toBe(85);
    expect(orbitPoseFromDrag(0, 40, 0, -300).pitchDeg).toBe(0);
  });
});
