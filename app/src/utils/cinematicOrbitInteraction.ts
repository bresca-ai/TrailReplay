import { REPLAY_CAMERA_MAX_PITCH } from '@/utils/cameraLimits';

/** Change the view relative to the drag's starting pose, without jumping on press. */
export function orbitPoseFromDrag(bearingDeg: number, pitchDeg: number, dx: number, dy: number) {
  return {
    bearingDeg: (((bearingDeg + dx * 0.5) % 360) + 360) % 360,
    pitchDeg: Math.max(0, Math.min(REPLAY_CAMERA_MAX_PITCH, pitchDeg + dy * 0.5)),
  };
}
