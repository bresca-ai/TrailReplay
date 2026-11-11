import { describe, expect, it } from 'vitest';
import {
  getAerialFollowBearing,
  getFlatTerrainBlend,
  getPlannedAerialBearing,
  getIntroCameraPose,
  getOpeningPreloadProgresses,
  getPredictivePlaybackPoses,
  getPlaybackCameraPose,
  getRouteBearingAtProgress,
  getRouteCoordinateAtProgress,
  resolveReplayCameraMode,
} from './replayCameraPlan';
import { createDefaultCameraSettings, createDefaultSettings } from '@/store/defaults';

const coordinates = [[0, 0], [0.01, 0], [0.02, 0]];
const options = {
  coordinates,
  elevationData: [],
  followBehindZoomLevel: 100,
  progress: 0,
};

describe('replay camera plan', () => {
  it('defaults to an automatic cinematic flight with natural terrain and supports authored shots', () => {
    expect(createDefaultCameraSettings().mode).toBe('cinematic');
    expect(createDefaultSettings().cameraMode).toBe(createDefaultCameraSettings().mode);
    expect(createDefaultSettings().terrainExaggeration).toBe(1);
    expect(resolveReplayCameraMode('cinematic', 0)).toBe('aerial-follow');
    expect(resolveReplayCameraMode('cinematic', 1)).toBe('cinematic');
    expect(resolveReplayCameraMode('aerial-follow', 1)).toBe('cinematic');
    expect(resolveReplayCameraMode('follow-behind', 0)).toBe('follow-behind');
  });
  it('plans a turn before reaching it and stays continuous through the move', () => {
    const route = Array.from({ length: 201 }, (_, i) => i < 100
      ? [i * 0.0001, 0] : [0.01, (i - 100) * 0.0001]);
    const elevations: Array<{ elevation: number; progress?: number }> = [];
    const planned = Array.from({ length: 201 }, (_, i) => getPlannedAerialBearing(route, elevations, i / 200));
    expect(planned[80]).toBeLessThan(90);
    expect(planned[120]).toBeLessThan(planned[80]);
    for (let i = 1; i < planned.length; i++) expect(Math.abs(planned[i] - planned[i - 1])).toBeLessThan(5);
  });
  it('gives aerial follow a stable tilted aerial pose for intro and playback', () => {
    const input = { ...options, cameraMode: 'aerial-follow' as const };
    const intro = getIntroCameraPose(input);
    const playback = getPlaybackCameraPose(input);
    expect(intro).toEqual(playback);
    expect(playback).toMatchObject({ center: [0, 0], pitch: 50 });
    expect(playback!.bearing).toBeCloseTo(90);
    expect(playback!.zoom).toBeCloseTo(15.88, 1);
    expect(getPlaybackCameraPose({ ...input, progress: 0.05 })!.pitch).toBeCloseTo(60);
    expect(getPlaybackCameraPose({ ...input, progress: 0.10 })!.pitch).toBeCloseTo(70);
  });

  it('moves closer on sustained flat terrain and changes framing gradually', () => {
    const route = Array.from({ length: 101 }, (_, i) => [i * 0.001, 0]);
    const flat = route.map((_, i) => ({ progress: i / 100, elevation: 100 }));
    const climb = route.map((_, i) => ({ progress: i / 100, elevation: 100 + i * 12 }));
    expect(getFlatTerrainBlend(route, flat, 0.5)).toBeGreaterThan(0.9);
    expect(getFlatTerrainBlend(route, climb, 0.5)).toBeLessThan(0.1);
    const rolling = Array.from({ length: 1001 }, (_, i) => ({ progress: i / 1000, elevation: 100 + 35 * Math.sin(i * Math.PI / 12) }));
    expect(getFlatTerrainBlend(route, rolling, 0.5)).toBeLessThan(0.1);
    const common = { coordinates: route, followBehindZoomLevel: 50, cameraMode: 'aerial-follow' as const, progress: 0.5 };
    const flatPose = getPlaybackCameraPose({ ...common, elevationData: flat })!;
    const climbPose = getPlaybackCameraPose({ ...common, elevationData: climb })!;
    expect(flatPose.zoom).toBeGreaterThan(climbPose.zoom);
    expect(flatPose.pitch).toBeGreaterThan(climbPose.pitch);
    const mixed = route.map((_, i) => ({ progress: i / 100, elevation: i < 50 ? 100 : 100 + (i - 50) * 12 }));
    const values = Array.from({ length: 101 }, (_, i) => getFlatTerrainBlend(route, mixed, i / 100));
    expect(Math.max(...values.slice(1).map((value, i) => Math.abs(value - values[i])))).toBeLessThan(0.3);
    expect(getFlatTerrainBlend(route, [], 0.5)).toBe(0);
  });

  it('does not reverse the planned view just because a straight route descends', () => {
    const descent = [{ progress: 0, elevation: 1600 }, { progress: 1, elevation: 0 }];
    const flat = [{ progress: 0, elevation: 600 }, { progress: 1, elevation: 600 }];
    for (const progress of [0.1, 0.5, 0.9]) {
      expect(getPlannedAerialBearing(coordinates, descent, progress)).toBeCloseTo(
        getPlannedAerialBearing(coordinates, flat, progress), 5,
      );
    }
  });

  it('looks across short switchbacks and handles route endpoints', () => {
    const route = Array.from({ length: 201 }, (_, i) => [i * 0.0001, Math.sin(i * 0.8) * 0.0001]);
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      expect(getAerialFollowBearing(route, p)).toBeGreaterThan(85);
      expect(getAerialFollowBearing(route, p)).toBeLessThan(95);
    }
    expect(getAerialFollowBearing([[0, 0]], 0)).toBe(0);
  });

  it('returns the camera poses used by each non-overview camera mode', () => {
    expect(getIntroCameraPose({ ...options, cameraMode: 'follow' })).toMatchObject({
      center: [0, 0], zoom: 14, pitch: 0, bearing: 0,
    });
    expect(getPlaybackCameraPose({ ...options, cameraMode: 'follow-behind' })).toMatchObject({
      center: [0, 0], zoom: 16.5, pitch: 56, bearing: 90,
    });
    expect(getIntroCameraPose({ ...options, cameraMode: 'follow-behind' })).toMatchObject({
      center: [0, 0], zoom: 16.5, pitch: 56, bearing: 90,
    });
    expect(getPlaybackCameraPose({ ...options, cameraMode: 'overview' })).toBeNull();
  });

  it('uses the selected tilt for intro and playback while leaving other modes unchanged', () => {
    const tilted = { ...options, cameraMode: 'follow-behind' as const, followBehindPitch: 70 };
    expect(getIntroCameraPose(tilted)?.pitch).toBe(70);
    expect(getPlaybackCameraPose(tilted)?.pitch).toBe(70);
    expect(getPlaybackCameraPose({ ...tilted, cameraMode: 'follow' })?.pitch).toBe(0);
    expect(getPlaybackCameraPose({ ...tilted, followBehindPitch: null })?.pitch).toBe(56);
    expect(getPlaybackCameraPose({ ...tilted, followBehindPitch: 100 })?.pitch).toBe(80);
  });

  it('creates evenly spaced opening coverage based on replay duration', () => {
    expect(getOpeningPreloadProgresses(60_000, 12_000, 4)).toEqual([
      0,
      1 / 15,
      2 / 15,
      expect.closeTo(0.2, 10),
    ]);
  });

  it('calculates a forward route bearing', () => {
    expect(getRouteBearingAtProgress(coordinates, 0)).toBeCloseTo(90, 5);
  });

  it('holds its heading while the route wiggles sideways along the same direction', () => {
    // A route running due east carrying the kind of lateral jitter a GPS trace
    // has. The direction of travel never changes, so the camera should not be
    // asked to turn at all.
    //
    // Note the jitter is deliberately irregular. An alternating wobble would
    // prove nothing here: the reading used to be taken between two points a
    // fixed ten samples apart, and any wobble whose period divides that offset
    // cancels itself out by luck. Measured against this route, the old
    // two-point reading swung 2.34 degrees; averaging both ends brings it to
    // 0.33.
    const jitter = (index: number) => ((Math.sin(index * 12.9898) * 43758.5453) % 1) * 0.00012;
    const wobbly = Array.from({ length: 120 }, (_, i) => [i * 0.001, jitter(i)]);

    const headings = Array.from({ length: 60 }, (_, i) =>
      getRouteBearingAtProgress(wobbly, i / 200));
    const spread = Math.max(...headings) - Math.min(...headings);

    expect(spread).toBeLessThan(0.75);
    headings.forEach((heading) => expect(heading).toBeCloseTo(90, 0));
  });

  it('reads the route continuously rather than snapping to the nearest sample', () => {
    // The camera path has far fewer samples than a clip has frames, so rounding
    // progress to a sample makes everything derived from it hold still for
    // several frames and then jump. Halfway between two samples must land
    // halfway between their positions.
    const line = [[0, 0], [1, 0], [2, 0]];
    expect(getRouteCoordinateAtProgress(line, 0.25)).toEqual([0.5, 0]);
    expect(getRouteCoordinateAtProgress(line, 0.5)).toEqual([1, 0]);
    expect(getRouteCoordinateAtProgress(line, 0.75)).toEqual([1.5, 0]);
  });

  it('turns the heading a little every frame instead of in periodic jumps', () => {
    // A steady curve, sampled at the rate a 60s clip is rendered at. With the
    // reading snapped to a sample the heading was unchanged on 83% of frames
    // and then stepped a couple of degrees, ten times a second — a train of
    // impulses the smoothing answered with a lurch each time, which is what
    // trembling looked like.
    const curve = Array.from({ length: 601 }, (_, i) => {
      const angle = (i / 600) * (Math.PI / 2);
      return [Math.sin(angle) * 0.5, (1 - Math.cos(angle)) * 0.5];
    });

    const frames = 600;
    const headings = Array.from({ length: frames }, (_, i) =>
      getRouteBearingAtProgress(curve, (i / (frames - 1)) * 0.8));

    let unchanged = 0;
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] === headings[i - 1]) unchanged++;
    }

    expect(unchanged / headings.length).toBeLessThan(0.05);
  });

  it('still turns for a real change of direction', () => {
    // Due east for half the route, then due north.
    const corner = [
      ...Array.from({ length: 60 }, (_, i) => [i * 0.001, 0]),
      ...Array.from({ length: 60 }, (_, i) => [0.059, i * 0.001]),
    ];

    expect(getRouteBearingAtProgress(corner, 0)).toBeCloseTo(90, 0);
    expect(getRouteBearingAtProgress(corner, 0.9)).toBeCloseTo(0, 0);
  });

  it('widens the close camera progressively as a route climbs', () => {
    const elevationData = [
      { elevation: 600 },
      { elevation: 1800 },
      { elevation: 2400 },
    ];

    expect(getPlaybackCameraPose({
      ...options,
      cameraMode: 'follow-behind',
      elevationData,
      progress: 0,
    })).toMatchObject({ zoom: 16.5, pitch: 56 });

    // Both pull-backs are deliberately small now. They exist to take the edge
    // off genuinely steep ground, not to re-frame the shot: keeping the marker
    // in view is `setCenterElevation`'s job. A big climb spends the whole
    // budget and it is still only 0.8 zoom levels and 4 degrees.
    expect(getPlaybackCameraPose({
      ...options,
      cameraMode: 'follow-behind',
      elevationData,
      progress: 1,
    })).toMatchObject({ zoom: 15.7, pitch: 52 });
  });

  it('adds an incoming-bearing warmup pose around a turn', () => {
    const poses = getPredictivePlaybackPoses({
      currentProgress: 0,
      horizonMs: 60_000,
      options: {
        cameraMode: 'follow-behind',
        coordinates: [[0, 0], [0.01, 0], [0.01, 0.01]],
        elevationData: [],
        followBehindZoomLevel: 100,
      },
      sampleCount: 3,
      totalDurationMs: 60_000,
    });

    expect(poses.length).toBeGreaterThan(2);
    expect(new Set(poses.map((pose) => Math.round(pose.bearing))).size).toBeGreaterThan(1);
  });
});
