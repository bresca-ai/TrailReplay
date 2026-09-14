import { describe, expect, it } from 'vitest';
import {
  calculateTerrainAwareAdjustments,
  cameraCenterChaseDurationFromStability,
  cameraReactivityFromStability,
  shouldBypassProceduralCameraSmoothing,
  frameTimeMultiplierFromDeltaMs,
  smoothBearing,
  smoothCoordinate,
  limitRateOfChange,
  MAX_CENTER_ELEVATION_RATE_M_PER_S,
  smoothPitch,
  smoothZoom,
  smoothZoomTarget,
  TERRAIN_CAMERA_SETTINGS,
  TERRAIN_SAMPLE_INDEX_OFFSETS,
} from './cameraUtils';

describe('camera utilities', () => {
  it('stabilizes cinematic fallback poses but preserves authored keyframes exactly', () => {
    expect(shouldBypassProceduralCameraSmoothing('cinematic', 0)).toBe(false);
    expect(shouldBypassProceduralCameraSmoothing('cinematic', 1)).toBe(true);
    expect(shouldBypassProceduralCameraSmoothing('follow-behind', 0)).toBe(false);
    expect(shouldBypassProceduralCameraSmoothing('follow', 0)).toBe(true);
  });

  it('holds the heading for small route wiggles', () => {
    expect(smoothBearing(90, 93)).toBe(90);
    expect(smoothBearing(359, 1)).toBe(359);
  });

  it('still turns smoothly once the route makes a meaningful turn', () => {
    expect(smoothBearing(90, 100, 0.1)).toBeCloseTo(90.85);
  });

  it('caps a sharp camera turn so it enters the frame progressively', () => {
    expect(smoothBearing(0, 150)).toBeCloseTo(0.85);
  });

  it('still widens the deadband at low stability, ignoring a turn the baseline would follow', () => {
    // Lowest stability (reactivity 0.25) widens the deadband, but only to
    // 4 * 1.5 = 6 degrees. A 5-degree wiggle the baseline would follow is
    // still ignored here.
    expect(smoothBearing(90, 95, undefined, undefined, 0.25)).toBe(90);
  });

  it('answers a real turn at low stability by easing, not by holding then swinging', () => {
    // A 10-degree turn used to sit inside the 16-degree dead zone and move the
    // camera not at all, until enough error banked up to escape it and the
    // camera swung through the lot. It now starts turning immediately, and
    // gently: a fraction of a degree on this frame.
    const eased = smoothBearing(90, 100, undefined, undefined, 0.25);
    expect(eased).toBeGreaterThan(90);
    expect(eased - 90).toBeLessThan(0.5);
  });

  it('turns faster at low stability than naively scaling speed by reactivity would', () => {
    // Low stability (reactivity 0.25) used to also cap turn speed at 0.25x
    // baseline (maxChange 0.85 * 0.25 = 0.2125/frame) — slow enough that on
    // a curvy route the camera's facing direction permanently fell behind
    // the route's real heading, breaking the follow-behind chase-camera
    // illusion. It should now turn noticeably faster than that old cap,
    // while still slower than the reactivity-1 baseline.
    const oldNaiveMaxChange = 0.85 * 0.25;
    const baselineMaxChange = 0.85 * 1;
    const result = smoothBearing(0, 90, undefined, undefined, 0.25);
    expect(result).toBeGreaterThan(oldNaiveMaxChange);
    expect(result).toBeLessThan(baselineMaxChange);
    expect(result).toBeCloseTo(0.53125, 5);
  });

  it('holds zoom steady for tiny terrain-estimation changes', () => {
    expect(smoothZoom(15, 15.02)).toBe(15);
  });

  it('zooms in gradually but opens the frame faster when terrain requires it', () => {
    expect(smoothZoom(15, 16)).toBeCloseTo(15.035);
    expect(smoothZoom(15, 10)).toBeCloseTo(14.88);
  });

  it('holds pitch steady for small terrain changes and opens the view progressively', () => {
    expect(smoothPitch(45, 44.8)).toBe(45);
    expect(smoothPitch(45, 30)).toBe(44.4);
  });

  it('uses climb above the route low point rather than absolute altitude', () => {
    const flatHighRoute = [{ elevation: 1800 }, { elevation: 1820 }];
    expect(calculateTerrainAwareAdjustments(1800, flatHighRoute, 0).zoomAdjust).toBe(0);

    // A climb still opens the frame, but altitude alone is a scene-scaling
    // hint rather than the safety mechanism (the playback camera pins its
    // centre to the terrain surface), so it may not spend the whole budget.
    const climbingRoute = [{ elevation: 600 }, { elevation: 1800 }];
    const climbAdjust = calculateTerrainAwareAdjustments(1800, climbingRoute, 1).zoomAdjust;
    expect(climbAdjust).toBeGreaterThan(0);
    expect(climbAdjust).toBeLessThanOrEqual(
      TERRAIN_CAMERA_SETTINGS.MAX_ZOOM_OUT * TERRAIN_CAMERA_SETTINGS.ELEVATION_RISK_WEIGHT,
    );
  });

  it('reads terrain as a gradient so route length does not change the framing', () => {
    // Two routes made of the identical 8% climb-and-descend sawtooth, one
    // 10 km long and one 200 km long. Identical terrain and identical
    // elevation range, so the camera must frame them the same way.
    //
    // The terrain window is a fraction of playback progress (a camera move
    // should take a couple of seconds of video whatever the route), which on
    // the long route spans 20 km of ground and on the short one 1 km. Reading
    // that window as a raw elevation *change* therefore measured route length,
    // not terrain: the long route saturated the pull-back while the short one
    // barely triggered it.
    const sawtooth = (totalMeters: number) => {
      const period = 5000;
      const points = [];
      for (let distance = 0; distance <= totalMeters; distance += 100) {
        const phase = (distance % period) / period;
        const elevation = 1000 + (phase < 0.5 ? phase * 2 : (1 - phase) * 2) * 200;
        points.push({ distance, elevation });
      }
      return points;
    };

    const short = calculateTerrainAwareAdjustments(1100, sawtooth(10_000), 0.5).zoomAdjust;
    const long = calculateTerrainAwareAdjustments(1100, sawtooth(200_000), 0.5).zoomAdjust;

    // The two windows still cover different amounts of ground, so the readings
    // are not identical - but they must land within a fraction of a zoom level
    // of each other rather than at opposite ends of the budget.
    expect(Math.abs(long - short)).toBeLessThan(0.2);
    // And an 8% sawtooth is real but moderate terrain: it should use part of
    // the pull-back budget, not all of it.
    expect(short).toBeGreaterThan(0);
    expect(short).toBeLessThan(TERRAIN_CAMERA_SETTINGS.MAX_ZOOM_OUT);
  });

  it('maps the stability slider to a reactivity multiplier centered on the tuned defaults', () => {
    expect(cameraReactivityFromStability(0.5)).toBeCloseTo(1);
    expect(cameraReactivityFromStability(0)).toBeCloseTo(0.25);
    expect(cameraReactivityFromStability(1)).toBeCloseTo(1.75);
    expect(cameraReactivityFromStability(Number.NaN)).toBeCloseTo(1);
  });

  it('turns the stable endpoint into a cinematic centre glide', () => {
    expect(cameraCenterChaseDurationFromStability(0)).toBe(900);
    expect(cameraCenterChaseDurationFromStability(0.25)).toBe(300);
    expect(cameraCenterChaseDurationFromStability(0.5)).toBe(100);
    expect(cameraCenterChaseDurationFromStability(1)).toBe(55);
    expect(cameraCenterChaseDurationFromStability(Number.NaN)).toBe(100);
  });

  it('filters positional corrections much more strongly at maximum stability', () => {
    const target: [number, number] = [10, 0];
    const cinematic = smoothCoordinate(
      [0, 0],
      target,
      1000 / 60,
      cameraCenterChaseDurationFromStability(0),
    );
    const defaultCamera = smoothCoordinate(
      [0, 0],
      target,
      1000 / 60,
      cameraCenterChaseDurationFromStability(0.5),
    );

    expect(cinematic[0]).toBeLessThan(defaultCamera[0] / 5);
  });

  it('a low reactivity holds the heading through bigger route wiggles than the default', () => {
    // 5 degrees is past the tuned 4-degree deadband but inside the widened
    // 6-degree one, so the stable end ignores a wiggle the default follows.
    expect(smoothBearing(90, 95, undefined, undefined, 0.25)).toBe(90);
    expect(smoothBearing(90, 95)).not.toBe(90);
  });

  it('samples terrain symmetrically around the marker so a slope is unbiased', () => {
    // The mean of a straight slope is its midpoint, so averaging these offsets
    // must not shift the look-at height on constant gradient - that is what
    // lets the bob be smoothed without the camera sitting behind on a climb.
    const sum = TERRAIN_SAMPLE_INDEX_OFFSETS.reduce<number>((total, offset) => total + offset, 0);
    expect(sum).toBe(0);
    expect(TERRAIN_SAMPLE_INDEX_OFFSETS.length).toBeGreaterThan(1);
  });

  it('passes through normal terrain movement but clips tile-refresh spikes', () => {
    // 400 m/s over a 16.7ms frame allows ~6.7 m: real ground moves less than
    // that, so the value is untouched...
    expect(limitRateOfChange(1000, 1004, 1000 / 60, MAX_CENTER_ELEVATION_RATE_M_PER_S)).toBe(1004);
    // ...while a 900 m single-frame jump from a refining tile is clipped.
    const clipped = limitRateOfChange(1000, 1900, 1000 / 60, MAX_CENTER_ELEVATION_RATE_M_PER_S);
    expect(clipped).toBeGreaterThan(1000);
    expect(clipped).toBeLessThan(1010);
    // Direction is preserved downward too.
    expect(limitRateOfChange(1000, 100, 1000 / 60, MAX_CENTER_ELEVATION_RATE_M_PER_S)).toBeLessThan(1000);
    // No usable elapsed time, or no previous value: adopt the target.
    expect(limitRateOfChange(1000, 1900, 0, MAX_CENTER_ELEVATION_RATE_M_PER_S)).toBe(1900);
    expect(limitRateOfChange(Number.NaN, 1900, 1000 / 60, MAX_CENTER_ELEVATION_RATE_M_PER_S)).toBe(1900);
  });

  it('a high reactivity turns and zooms faster than the default', () => {
    const stableChange = smoothBearing(0, 150, undefined, undefined, 0.25) - 0;
    const reactiveChange = smoothBearing(0, 150, undefined, undefined, 1.75) - 0;
    expect(reactiveChange).toBeGreaterThan(stableChange);

    const stableZoom = smoothZoom(15, 16, undefined, undefined, 0.25);
    const reactiveZoom = smoothZoom(15, 16, undefined, undefined, 1.75);
    expect(reactiveZoom - 15).toBeGreaterThan(stableZoom - 15);
  });

  it('preserves terrain zoom targets at the default and reactive settings', () => {
    expect(smoothZoomTarget(15, 13, 16, 0.5)).toBe(13);
    expect(smoothZoomTarget(15, 13, 16, 1)).toBe(13);
  });

  it('holds small terrain zoom reversals in cinematic mode', () => {
    expect(smoothZoomTarget(14, 14.25, 100, 0)).toBe(14);
    expect(smoothZoomTarget(14, 13.75, 100, 0)).toBe(14);
  });

  it('opens the cinematic frame faster than it zooms back in', () => {
    const zoomedOut = smoothZoomTarget(15, 13, 100, 0);
    const zoomedIn = smoothZoomTarget(15, 17, 100, 0);

    expect(15 - zoomedOut).toBeGreaterThan((zoomedIn - 15) * 3);
    expect(zoomedOut).toBeGreaterThan(13);
    expect(zoomedIn).toBeLessThan(17);
  });

  it('maps elapsed time to a frame-time multiplier centered on a 60fps reference frame', () => {
    expect(frameTimeMultiplierFromDeltaMs(1000 / 60)).toBeCloseTo(1);
    expect(frameTimeMultiplierFromDeltaMs(1000 / 30)).toBeCloseTo(2);
    expect(frameTimeMultiplierFromDeltaMs(1000 / 120)).toBeCloseTo(0.5);
    // Non-finite or non-positive deltas (first frame, clock hiccups) fall back to neutral.
    expect(frameTimeMultiplierFromDeltaMs(0)).toBe(1);
    expect(frameTimeMultiplierFromDeltaMs(Number.NaN)).toBe(1);
    // A huge gap (e.g. a backgrounded tab) is clamped rather than flinging the camera.
    expect(frameTimeMultiplierFromDeltaMs(10_000)).toBeCloseTo(4);
  });

  it('produces the same total camera movement over a fixed clip regardless of export fps', () => {
    // Simulates exporting the same 1-second turn at 30fps vs 60fps: without
    // frame-time compensation, 60fps calls the smoothing function twice as
    // often and the camera would travel roughly twice as far in that second.
    const runFrames = (frameCount: number, deltaMs: number) => {
      let bearing = 0;
      for (let i = 0; i < frameCount; i += 1) {
        const multiplier = frameTimeMultiplierFromDeltaMs(deltaMs);
        bearing = smoothBearing(bearing, 90, undefined, undefined, 1, multiplier);
      }
      return bearing;
    };

    const after30fps = runFrames(30, 1000 / 30);
    const after60fps = runFrames(60, 1000 / 60);
    expect(after60fps).toBeCloseTo(after30fps, 1);
  });

  it('smoothCoordinate snaps straight to target on the first call', () => {
    expect(smoothCoordinate([0, 0], [1, 2], -1)).toEqual([1, 2]);
    expect(smoothCoordinate([0, 0], [1, 2], 0)).toEqual([1, 2]);
  });

  it('smoothCoordinate reaches the target once elapsed time covers the chase duration', () => {
    expect(smoothCoordinate([0, 0], [1, 2], 100, 100)).toEqual([1, 2]);
    expect(smoothCoordinate([0, 0], [1, 2], 500, 100)).toEqual([1, 2]);
  });

  it('smoothCoordinate advances proportionally to elapsed time for a partial step', () => {
    expect(smoothCoordinate([0, 0], [10, 20], 25, 100)).toEqual([2.5, 5]);
  });

  it('smoothCoordinate keeps narrowing the gap to a fixed target over repeated small steps', () => {
    let position: [number, number] = [0, 0];
    let previousGap = 10;
    for (let i = 0; i < 10; i += 1) {
      position = smoothCoordinate(position, [10, 0], 10, 100);
      const gap = 10 - position[0];
      expect(gap).toBeLessThan(previousGap);
      expect(gap).toBeGreaterThan(0);
      previousGap = gap;
    }
  });
});
