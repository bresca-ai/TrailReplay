import { describe, expect, it } from 'vitest';
import type { PreparedCinematicKeyframe } from './cinematicCameraPlan';
import {
  deduplicateCameraPoses,
  getDeterministicIntroStartPose,
  getOpeningReplayWarmupPoses,
  getReplayWarmupPose,
  getTransitionWarmupPoses,
  sampleCameraTransition,
} from './replayCameraWarmupPlan';

const coordinates = [[0, 0], [0.01, 0], [0.02, 0]];
const baseOptions = {
  coordinates,
  elevationData: [],
  followBehindZoomLevel: 100,
};

describe('replay camera warmup plan', () => {
  it('derives a stable country-scale intro start', () => {
    expect(getDeterministicIntroStartPose({
      coordinates,
      introTo: { center: [0, 0], zoom: 16.5, pitch: 56, bearing: 90 },
    })).toEqual({
      center: [0, 0],
      zoom: 5.25,
      pitch: 0,
      bearing: 0,
    });
  });

  it('keeps a visible zoom gap when an authored opening pose is already wide', () => {
    expect(getDeterministicIntroStartPose({
      coordinates,
      introTo: { center: [0, 0], zoom: 5, pitch: 45, bearing: 90 },
    })).toEqual({
      center: [0, 0],
      zoom: 2,
      pitch: 0,
      bearing: 0,
    });
  });

  it('anchors the overview to the route start rather than the full-route center', () => {
    const longRoute = [[-17.9, 28.6], [2.17, 41.39], [24.9, 60.17]];

    expect(getDeterministicIntroStartPose({
      coordinates: longRoute,
      introTo: { center: [-17.9, 28.6], zoom: 16, pitch: 50, bearing: 45 },
    })).toMatchObject({ center: [-17.9, 28.6], zoom: 5.25, pitch: 0, bearing: 0 });
  });

  it('uses the authored cinematic pose rather than a follow-behind approximation', () => {
    const cinematicKeyframes: PreparedCinematicKeyframe[] = [{
      id: 'opening',
      progress: 0,
      worldBearingDeg: 210,
      frame: 'world',
      routeHeadingAtAnchorDeg: null,
      pitchDeg: 22,
      zoom: 11.25,
      easing: 'smooth',
    }];

    expect(getReplayWarmupPose({
      ...baseOptions,
      cameraMode: 'cinematic',
      cinematicKeyframes,
      progress: 0,
    })).toMatchObject({
      center: [0, 0],
      bearing: 210,
      pitch: 22,
      zoom: 11.25,
    });
  });

  it('falls back to the playback follow-behind pose for an empty cinematic track', () => {
    expect(getReplayWarmupPose({
      ...baseOptions,
      cameraMode: 'cinematic',
      cinematicKeyframes: [],
      progress: 0,
    })).toMatchObject({ bearing: 90, pitch: 56, zoom: 16.5 });
  });

  it('samples every zoom band crossed by intro and outro without exceeding its cap', () => {
    const from = { center: [0, 0] as [number, number], zoom: 8, pitch: 0, bearing: 0 };
    const to = { center: [0.2, 0.1] as [number, number], zoom: 16, pitch: 56, bearing: 90 };
    const poses = sampleCameraTransition(from, to, 24);

    expect(poses[0]).toEqual(from);
    expect(poses.at(-1)).toEqual(to);
    expect(poses.length).toBeLessThanOrEqual(24);
    for (let index = 1; index < poses.length; index++) {
      expect(Math.abs(poses[index].zoom - poses[index - 1].zoom)).toBeLessThanOrEqual(0.75);
    }
  });

  it('takes the short path across the antimeridian and the short bearing rotation', () => {
    const poses = sampleCameraTransition(
      { center: [179, 0], zoom: 8, pitch: 0, bearing: 350 },
      { center: [-179, 0], zoom: 8, pitch: 0, bearing: 10 },
    );
    const middle = poses[Math.floor(poses.length / 2)];

    expect(Math.abs(middle.center[0])).toBeGreaterThan(170);
    expect(middle.bearing).toBeGreaterThanOrEqual(350);
    expect(poses.at(-1)?.center[0]).toBe(-179);
  });

  it('covers both transition endpoints and removes overlap between plans', () => {
    const overview = { center: [0, 0] as [number, number], zoom: 8, pitch: 0, bearing: 0 };
    const opening = { center: [0.01, 0] as [number, number], zoom: 14, pitch: 0, bearing: 0 };
    const ending = { center: [0.02, 0] as [number, number], zoom: 14, pitch: 0, bearing: 0 };
    const transitions = getTransitionWarmupPoses({
      introFrom: overview,
      introTo: opening,
      outroFrom: ending,
      outroTo: overview,
    });

    expect(transitions.intro[0]).toEqual(overview);
    expect(transitions.intro.at(-1)).toEqual(opening);
    expect(transitions.outro[0]).toEqual(ending);
    expect(transitions.outro.at(-1)).toEqual(overview);
    expect(deduplicateCameraPoses([...transitions.intro, ...transitions.outro]))
      .toHaveLength(transitions.intro.length + transitions.outro.length - 1);
  });

  it('samples authored cinematic movement throughout the opening horizon', () => {
    const cinematicKeyframes: PreparedCinematicKeyframe[] = [
      {
        id: 'start', progress: 0, worldBearingDeg: 0, frame: 'world',
        routeHeadingAtAnchorDeg: null, pitchDeg: 10, zoom: 10, easing: 'linear',
      },
      {
        id: 'move', progress: 0.2, worldBearingDeg: 90, frame: 'world',
        routeHeadingAtAnchorDeg: null, pitchDeg: 40, zoom: 15, easing: 'linear',
      },
    ];
    const poses = getOpeningReplayWarmupPoses({
      ...baseOptions,
      cameraMode: 'cinematic',
      cinematicKeyframes,
      totalDurationMs: 60_000,
      windowMs: 12_000,
      sampleCount: 5,
    });

    expect(poses).toHaveLength(5);
    expect(poses[0]).toMatchObject({ zoom: 10, bearing: 0 });
    expect(poses.at(-1)).toMatchObject({ zoom: 15, bearing: 90 });
    expect(poses[2].zoom).toBeCloseTo(12.5);
  });
});
