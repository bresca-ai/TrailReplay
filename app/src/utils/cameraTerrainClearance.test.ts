import { describe, expect, it } from 'vitest';
import {
  MIN_CAMERA_GROUND_CLEARANCE_METERS,
  nextPitchLimitDeg,
  readCameraGroundClearanceMeters,
} from './cameraTerrainClearance';
import type { Map } from 'maplibre-gl';

const CEILING = 85;
const FRAME_MS = 1000 / 60;

describe('readCameraGroundClearanceMeters', () => {
  it('reads the v6 camera position and compares it to the terrain directly below', () => {
    const cameraLngLat = { lng: 2.1, lat: 42.3 };
    const map = {
      _camera: { transform: {
        getCameraLngLat: () => cameraLngLat,
        getCameraAltitude: () => 500,
      } },
      queryTerrainElevation: (point: unknown) => point === cameraLngLat ? 380 : null,
    } as unknown as Map;

    expect(readCameraGroundClearanceMeters(map)).toBe(120);
  });

  it('does not invent a clearance when camera internals or terrain are unavailable', () => {
    expect(readCameraGroundClearanceMeters({ queryTerrainElevation: () => 0 } as unknown as Map)).toBeNull();
    const map = {
      _camera: { transform: {
        getCameraLngLat: () => ({ lng: 2.1, lat: 42.3 }),
        getCameraAltitude: () => 500,
      } },
      queryTerrainElevation: () => null,
    } as unknown as Map;
    expect(readCameraGroundClearanceMeters(map)).toBeNull();
  });
});

function step(overrides: Partial<Parameters<typeof nextPitchLimitDeg>[0]> = {}) {
  return nextPitchLimitDeg({
    currentLimitDeg: CEILING,
    pitchDeg: 70,
    clearanceMeters: 500,
    ceilingDeg: CEILING,
    elapsedMs: FRAME_MS,
    ...overrides,
  });
}

/** Runs the servo forward, holding the camera pitched at whatever the limit allows. */
function settle(options: {
  clearanceFor: (pitchDeg: number) => number | null;
  frames: number;
  startLimit?: number;
}): number {
  let limit = options.startLimit ?? CEILING;
  for (let frame = 0; frame < options.frames; frame++) {
    const pitchDeg = Math.min(CEILING, limit);
    limit = nextPitchLimitDeg({
      currentLimitDeg: limit,
      pitchDeg,
      clearanceMeters: options.clearanceFor(pitchDeg),
      ceilingDeg: CEILING,
      elapsedMs: FRAME_MS,
    });
  }
  return limit;
}

describe('nextPitchLimitDeg', () => {
  it('leaves the limit wide open when the camera is well clear', () => {
    expect(step({ clearanceMeters: 800 })).toBe(CEILING);
  });

  it('tightens when the camera is below the ground', () => {
    // Underground: a negative clearance means the viewpoint is inside terrain.
    expect(step({ clearanceMeters: -20 })).toBeLessThan(CEILING);
  });

  it('tightens when the camera is above ground but too close to it', () => {
    expect(step({ clearanceMeters: MIN_CAMERA_GROUND_CLEARANCE_METERS - 1 })).toBeLessThan(CEILING);
  });

  it('tightens gradually rather than snapping', () => {
    // A single frame must not lurch the camera. The whole point of a limit
    // that moves is that it cannot produce the jump a correction would.
    const afterOneFrame = step({ clearanceMeters: -100, currentLimitDeg: 80, pitchDeg: 80 });
    expect(80 - afterOneFrame).toBeLessThan(2);
    expect(afterOneFrame).toBeLessThan(80);
  });

  it('catches up to a camera that got underground some other way', () => {
    // A keyframe or a jumpTo can place the camera far below the standing
    // limit. Tightening from the old limit would take seconds to reach it, so
    // it tightens from where the camera actually is.
    const limit = step({ currentLimitDeg: 85, pitchDeg: 30, clearanceMeters: -500 });
    expect(limit).toBeLessThan(30);
  });

  it('escapes the ground within a fraction of a second', () => {
    // Steeper pitch means a lower camera; clearance crosses zero at 60 degrees.
    const settled = settle({ frames: 60, clearanceFor: (pitch) => (60 - pitch) * 20 });
    expect(settled).toBeLessThanOrEqual(60);
    expect(settled).toBeGreaterThan(40);
  });

  it('recovers the full range once the camera is clear again', () => {
    const recovered = settle({ startLimit: 20, frames: 600, clearanceFor: () => 900 });
    expect(recovered).toBe(CEILING);
  });

  it('does not relax while only marginally clear, so it cannot oscillate', () => {
    // Just above the minimum is inside the hysteresis band: hold, do not
    // hand the range back only to take it away again next frame.
    const held = step({
      currentLimitDeg: 50,
      clearanceMeters: MIN_CAMERA_GROUND_CLEARANCE_METERS + 1,
    });
    expect(held).toBe(50);
  });

  it('gives the range back when the ground is unknown, rather than staying clamped', () => {
    // Terrain off, or no elevation tile loaded. Refusing to relax would leave
    // the camera restricted wherever data is missing.
    expect(step({ currentLimitDeg: 40, clearanceMeters: null })).toBeGreaterThan(40);
    expect(settle({ startLimit: 10, frames: 600, clearanceFor: () => null })).toBe(CEILING);
  });

  it('stops at the map’s own minimum pitch rather than below it', () => {
    // `Map.setMaxPitch` throws when handed a value under the map's minPitch,
    // so a map configured with a floor must never be driven past it however
    // deep underground the camera gets.
    const limit = step({ currentLimitDeg: 25, pitchDeg: 25, clearanceMeters: -5000, floorDeg: 20 });
    expect(limit).toBeGreaterThanOrEqual(20);

    let settled = 20;
    for (let frame = 0; frame < 600; frame++) {
      settled = nextPitchLimitDeg({
        currentLimitDeg: settled,
        pitchDeg: settled,
        clearanceMeters: -5000,
        ceilingDeg: CEILING,
        floorDeg: 20,
        elapsedMs: FRAME_MS,
      });
    }
    expect(settled).toBe(20);
  });

  it('never exceeds the map’s own maximum or goes below flat', () => {
    expect(step({ currentLimitDeg: CEILING, clearanceMeters: 5000 })).toBe(CEILING);
    expect(settle({ startLimit: 5, frames: 600, clearanceFor: () => -1000 })).toBe(0);
  });
});
