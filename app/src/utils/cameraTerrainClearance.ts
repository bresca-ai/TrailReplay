import type * as maplibregl from 'maplibre-gl';

/**
 * Keeps the camera above the ground.
 *
 * With 3D terrain on, nothing stops the camera being pushed inside a
 * mountain: tilt far enough on a slope and the viewpoint ends up below the
 * surface, showing the inside of a hillside. It is reachable by ordinary
 * navigation in every camera mode, and it is never what anyone wanted.
 *
 * The remedy is a ceiling on pitch rather than a correction after the fact.
 * Tilting is what lowers the camera, so a pitch limit stops the gesture at
 * the surface instead of letting it through and yanking it back — and a limit
 * that moves smoothly cannot produce the snap that a corrective jump would.
 */

/**
 * How far above the ground the camera is kept, in metres.
 *
 * Enough to clear the terrain mesh's own coarseness — the rendered surface is
 * interpolated from DEM tiles and is not exact — without noticeably reducing
 * how low a shot can sit.
 */
export const MIN_CAMERA_GROUND_CLEARANCE_METERS = 40;

/**
 * Clearance must exceed the minimum by this much before the limit is allowed
 * to relax again. Without the gap, a camera sitting exactly at the limit
 * would alternate between tightening and relaxing every frame.
 */
const RELAX_HYSTERESIS_METERS = 60;

/** Degrees per second the limit may tighten by. Fast enough to escape promptly, slow enough to read as a glide. */
const TIGHTEN_RATE_DEG_PER_S = 45;

/** Degrees per second the limit recovers by once clear. Slower, so terrain passing underneath doesn't pump the limit. */
const RELAX_RATE_DEG_PER_S = 12;

/**
 * The transform members this needs sit outside the documented `Map` surface.
 * MapLibre v6 moved the transform under `_camera`; keep the coupling in this
 * one place and fail open if its shape changes in a later version.
 */
interface CameraTransform {
  getCameraAltitude: () => number;
  getCameraLngLat: () => maplibregl.LngLat;
}

function readCameraTransform(map: maplibregl.Map): CameraTransform | null {
  const transform = (map as unknown as { _camera?: { transform?: Partial<CameraTransform> } })._camera?.transform;
  if (typeof transform?.getCameraAltitude !== 'function') return null;
  if (typeof transform?.getCameraLngLat !== 'function') return null;
  return transform as CameraTransform;
}

/**
 * Metres between the camera and the ground directly beneath it, or null when
 * that cannot be known — terrain switched off, or no elevation data loaded
 * for where the camera is.
 *
 * Null is deliberately distinct from zero: it means "no opinion", and callers
 * must fail open rather than clamping against an elevation of nothing. It is
 * the reason this is a strong preference and not a guarantee.
 */
export function readCameraGroundClearanceMeters(map: maplibregl.Map): number | null {
  const transform = readCameraTransform(map);
  if (!transform) return null;

  const cameraLngLat = transform.getCameraLngLat();
  const cameraAltitude = transform.getCameraAltitude();
  if (!Number.isFinite(cameraAltitude)) return null;

  const groundElevation = map.queryTerrainElevation(cameraLngLat);
  if (typeof groundElevation !== 'number' || !Number.isFinite(groundElevation)) return null;

  return cameraAltitude - groundElevation;
}

export interface PitchLimitStep {
  /** The limit currently applied. */
  currentLimitDeg: number;
  /** Where the camera is actually pitched right now. */
  pitchDeg: number;
  /** From `readCameraGroundClearanceMeters`; null means unknown. */
  clearanceMeters: number | null;
  /** The map's own maximum pitch, which the limit never exceeds. */
  ceilingDeg: number;
  /**
   * The map's own minimum pitch, which the limit never goes below.
   *
   * Not cosmetic: `setMaxPitch` throws outright when handed a value under the
   * map's `minPitch`, so the servo has to stop where the map does.
   */
  floorDeg?: number;
  elapsedMs: number;
}

/**
 * The pitch ceiling for this frame.
 *
 * A servo rather than a solved angle: it tightens while the camera is too low
 * and eases back once it is clear. Solving for the exact safe pitch would
 * need the terrain profile the camera would sweep through on the way, which
 * is a lot of queries for a value that is about to change anyway — whereas
 * feeding back a little each frame converges on it and is naturally smooth.
 */
export function nextPitchLimitDeg(step: PitchLimitStep): number {
  const { currentLimitDeg, pitchDeg, clearanceMeters, ceilingDeg, elapsedMs } = step;
  const seconds = Math.max(0, elapsedMs) / 1000;
  const floorDeg = Math.min(step.floorDeg ?? 0, ceilingDeg);

  const clamp = (deg: number) => Math.min(ceilingDeg, Math.max(floorDeg, deg));

  // No reading: give the limit back. Refusing to relax here would leave the
  // camera permanently restricted wherever terrain data is missing.
  if (clearanceMeters === null) {
    return clamp(currentLimitDeg + RELAX_RATE_DEG_PER_S * seconds);
  }

  if (clearanceMeters < MIN_CAMERA_GROUND_CLEARANCE_METERS) {
    // Tighten from wherever the camera actually is, not from the old limit:
    // if the camera got below ground some other way — a jump, a keyframe —
    // the limit may be far above it and would take seconds to catch up.
    const from = Math.min(currentLimitDeg, pitchDeg);
    return clamp(from - TIGHTEN_RATE_DEG_PER_S * seconds);
  }

  if (clearanceMeters > MIN_CAMERA_GROUND_CLEARANCE_METERS + RELAX_HYSTERESIS_METERS) {
    return clamp(currentLimitDeg + RELAX_RATE_DEG_PER_S * seconds);
  }

  // Inside the hysteresis band: clear, but not clear enough to trust yet.
  return clamp(currentLimitDeg);
}
