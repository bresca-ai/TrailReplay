import { describe, expect, it } from 'vitest';
import type { SegmentTiming } from '@/utils/journeyUtils';
import { getRouteBearingAtProgress } from '@/utils/replayCameraPlan';
import {
  CINEMATIC_ZOOM_MAX,
  CINEMATIC_ZOOM_MIN,
  deriveCinematicKeyframeProgress,
  applyLocalCinematicShots,
  getLocalShotTimings,
  localShotInfluence,
  getCinematicCameraPose,
  prepareCinematicKeyframeTrack,
  type CinematicCameraKeyframe,
  type PreparedCinematicKeyframe,
} from './cinematicCameraPlan';

function keyframe(overrides: Partial<CinematicCameraKeyframe> & { id: string }): CinematicCameraKeyframe {
  return {
    anchor: { routeSegmentId: 'seg-1', routeSegmentDistance: 0 },
    bearingDeg: 0,
    pitchDeg: 40,
    zoom: 15,
    frame: 'world',
    easing: 'smooth',
    ...overrides,
  };
}

/** A straight route running due east, long enough to sample densely. */
const straightRoute = Array.from({ length: 601 }, (_, index) => [index * 0.0001, 0]);

/** The kind of gentle GPS wobble CAMERA.md's bearing fix was measured against. */
const wobblyRoute = Array.from({ length: 601 }, (_, index) => [
  index * 0.0001,
  ((Math.sin(index * 12.9898) * 43758.5453) % 1) * 0.00003,
]);

function preparedTrack(keyframes: CinematicCameraKeyframe[], coordinates: number[][], progresses: number[]) {
  return prepareCinematicKeyframeTrack(
    keyframes.map((kf, index) => ({ keyframe: kf, progress: progresses[index] })),
    coordinates,
  );
}

describe('deriveCinematicKeyframeProgress', () => {
  const segmentTimings: SegmentTiming[] = [
    {
      segmentId: 'seg-1',
      segmentIndex: 0,
      type: 'track',
      duration: 10_000,
      startTime: 0,
      endTime: 10_000,
      startDistance: 0,
      endDistance: 1000,
      startCoordIndex: 0,
      endCoordIndex: 10,
      progressStartRatio: 0,
      progressEndRatio: 1,
      distanceStartRatio: 0,
      distanceEndRatio: 1,
    },
  ];
  const coordinates = (
    Array.from({ length: 11 }, (_, index) => ({ distance: index * 100 }))
  ) as unknown as Parameters<typeof deriveCinematicKeyframeProgress>[2];

  it('derives progress from the same stable anchor photos use', () => {
    const progress = deriveCinematicKeyframeProgress(
      { routeSegmentId: 'seg-1', routeSegmentDistance: 500 },
      segmentTimings,
      coordinates,
      'recorded',
    );
    expect(progress).toBeCloseTo(0.5, 5);
  });

  it('returns null for an anchor whose segment no longer exists', () => {
    expect(deriveCinematicKeyframeProgress(
      { routeSegmentId: 'missing', routeSegmentDistance: 0 },
      segmentTimings,
      coordinates,
      'recorded',
    )).toBeNull();
  });
});

describe('prepareCinematicKeyframeTrack', () => {
  it('sorts by derived progress regardless of input order', () => {
    const prepared = preparedTrack(
      [keyframe({ id: 'b' }), keyframe({ id: 'a' })],
      straightRoute,
      [0.8, 0.2],
    );
    expect(prepared.map((kf) => kf.id)).toEqual(['a', 'b']);
  });

  it('unwraps a bearing sequence instead of spinning the long way round', () => {
    const prepared = preparedTrack(
      [keyframe({ id: 'a', bearingDeg: 350 }), keyframe({ id: 'b', bearingDeg: 10 })],
      straightRoute,
      [0, 1],
    );
    // 350 -> 10 the short way is +20, not -340.
    expect(prepared[1].worldBearingDeg - prepared[0].worldBearingDeg).toBeCloseTo(20, 5);
  });

  it('converts a route-frame bearing to an absolute bearing at its own anchor', () => {
    const routeHeading = getRouteBearingAtProgress(straightRoute, 0.5);
    const prepared = preparedTrack(
      [keyframe({ id: 'a', frame: 'route', bearingDeg: 180 })],
      straightRoute,
      [0.5],
    );
    expect(prepared[0].worldBearingDeg).toBeCloseTo(((routeHeading + 180) % 360), 5);
  });
});

describe('getCinematicCameraPose', () => {
  it('supports continent-scale zoom keyframes and clamps invalid saved values', () => {
    const wide = preparedTrack(
      [keyframe({ id: 'wide', zoom: 2.5 })],
      straightRoute,
      [0.5],
    );

    expect(getCinematicCameraPose({
      keyframes: wide,
      coordinates: straightRoute,
      progress: 0.5,
      routeHeadingDeg: null,
    })?.zoom).toBe(2.5);

    const belowRange = preparedTrack(
      [keyframe({ id: 'below', zoom: CINEMATIC_ZOOM_MIN - 1 })],
      straightRoute,
      [0.5],
    );
    const aboveRange = preparedTrack(
      [keyframe({ id: 'above', zoom: CINEMATIC_ZOOM_MAX + 1 })],
      straightRoute,
      [0.5],
    );

    expect(getCinematicCameraPose({
      keyframes: belowRange,
      coordinates: straightRoute,
      progress: 0.5,
      routeHeadingDeg: null,
    })?.zoom).toBe(CINEMATIC_ZOOM_MIN);
    expect(getCinematicCameraPose({
      keyframes: aboveRange,
      coordinates: straightRoute,
      progress: 0.5,
      routeHeadingDeg: null,
    })?.zoom).toBe(CINEMATIC_ZOOM_MAX);
  });

  it('returns null with no keyframes, so the caller can fall back to follow-behind', () => {
    expect(getCinematicCameraPose({
      keyframes: [],
      coordinates: straightRoute,
      progress: 0.5,
      routeHeadingDeg: 90,
    })).toBeNull();
  });

  it('a single world-frame keyframe holds a perfectly static pose across the whole replay', () => {
    // The sharpest acceptance criterion in CINEMATIC_CAMERA_PLAN.md section 10:
    // this only holds if the mode really has stopped consulting the route
    // heading, which is why the route here wobbles rather than running true.
    const prepared = preparedTrack(
      [keyframe({ id: 'a', bearingDeg: 123, pitchDeg: 41, zoom: 15.5 })],
      wobblyRoute,
      [0.5],
    );

    const poses = Array.from({ length: 3600 }, (_, frame) => {
      const progress = frame / 3599;
      return getCinematicCameraPose({
        keyframes: prepared,
        coordinates: wobblyRoute,
        progress,
        routeHeadingDeg: getRouteBearingAtProgress(wobblyRoute, progress),
      });
    });

    const bearings = new Set(poses.map((pose) => pose?.bearing));
    const pitches = new Set(poses.map((pose) => pose?.pitch));
    const zooms = new Set(poses.map((pose) => pose?.zoom));
    expect(bearings.size).toBe(1);
    expect(pitches.size).toBe(1);
    expect(zooms.size).toBe(1);
    expect([...bearings][0]).toBeCloseTo(123, 9);
    expect([...pitches][0]).toBeCloseTo(41, 9);
    expect([...zooms][0]).toBeCloseTo(15.5, 9);
  });

  it('a held route-frame keyframe keeps tracking the route instead of freezing its capture-time heading', () => {
    // Deliberate contrast with the world-frame case above: 'route' framing
    // means the shot is meant to keep turning with the route, e.g. the
    // classic over-the-shoulder follow-behind. See getCinematicCameraPose's
    // heldBearingDeg helper.
    const prepared = preparedTrack(
      [keyframe({ id: 'a', frame: 'route', bearingDeg: 180 })],
      straightRoute,
      [0.5],
    );

    // Bend the route abruptly after the keyframe's own anchor.
    const bentRoute = straightRoute.slice(0, 400).concat(
      Array.from({ length: 201 }, (_, index) => [0.04, 0.0001 * index]),
    );

    const beforeBend = getCinematicCameraPose({
      keyframes: prepared,
      coordinates: bentRoute,
      progress: 0.5,
      routeHeadingDeg: getRouteBearingAtProgress(bentRoute, 0.5),
    });
    const afterBend = getCinematicCameraPose({
      keyframes: prepared,
      coordinates: bentRoute,
      progress: 0.9,
      routeHeadingDeg: getRouteBearingAtProgress(bentRoute, 0.9),
    });

    expect(beforeBend?.bearing).not.toBeCloseTo(afterBend?.bearing ?? NaN, 0);
  });

  it('holds the nearest keyframe before the first and after the last, without extrapolating', () => {
    const prepared = preparedTrack(
      [
        keyframe({ id: 'a', bearingDeg: 10, pitchDeg: 30, zoom: 12 }),
        keyframe({ id: 'b', bearingDeg: 200, pitchDeg: 60, zoom: 18 }),
      ],
      straightRoute,
      [0.3, 0.7],
    );

    const before = getCinematicCameraPose({ keyframes: prepared, coordinates: straightRoute, progress: 0, routeHeadingDeg: null });
    const after = getCinematicCameraPose({ keyframes: prepared, coordinates: straightRoute, progress: 1, routeHeadingDeg: null });

    expect(before).toMatchObject({ bearing: 10, pitch: 30, zoom: 12 });
    expect(after).toMatchObject({ bearing: 200, pitch: 60, zoom: 18 });
  });

  it('linear easing moves at a constant rate between two keyframes', () => {
    const prepared = preparedTrack(
      [
        keyframe({ id: 'a', bearingDeg: 0, pitchDeg: 20, zoom: 10, easing: 'linear' }),
        keyframe({ id: 'b', bearingDeg: 90, pitchDeg: 60, zoom: 20, easing: 'linear' }),
      ],
      straightRoute,
      [0, 1],
    );

    const pose = getCinematicCameraPose({ keyframes: prepared, coordinates: straightRoute, progress: 0.5, routeHeadingDeg: null });
    expect(pose).toMatchObject({ bearing: 45, pitch: 40, zoom: 15 });
  });

  it('hold easing freezes the previous keyframe until the next is reached', () => {
    const prepared = preparedTrack(
      [
        keyframe({ id: 'a', bearingDeg: 0, pitchDeg: 20, zoom: 10 }),
        keyframe({ id: 'b', bearingDeg: 90, pitchDeg: 60, zoom: 20, easing: 'hold' }),
      ],
      straightRoute,
      [0, 1],
    );

    const pose = getCinematicCameraPose({ keyframes: prepared, coordinates: straightRoute, progress: 0.99, routeHeadingDeg: null });
    expect(pose).toMatchObject({ bearing: 0, pitch: 20, zoom: 10 });
  });

  it('changes pose on every sampled frame between two smooth keyframes — no staircase', () => {
    const prepared = preparedTrack(
      [
        keyframe({ id: 'a', bearingDeg: 0, pitchDeg: 20, zoom: 10 }),
        keyframe({ id: 'b', bearingDeg: 90, pitchDeg: 60, zoom: 20 }),
      ],
      straightRoute,
      [0, 1],
    );

    const poses = Array.from({ length: 3600 }, (_, frame) => getCinematicCameraPose({
      keyframes: prepared,
      coordinates: straightRoute,
      progress: frame / 3599,
      routeHeadingDeg: null,
    }));

    let unchanged = 0;
    for (let index = 1; index < poses.length; index++) {
      const previous = poses[index - 1];
      const current = poses[index];
      if (previous && current
        && previous.bearing === current.bearing
        && previous.pitch === current.pitch
        && previous.zoom === current.zoom) {
        unchanged++;
      }
    }
    expect(unchanged).toBe(0);
  });

  it('never overshoots the surrounding keyframes’ own pitch and zoom range, across random keyframe sets', () => {
    // Deterministic PRNG so a failure reproduces.
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let trial = 0; trial < 200; trial++) {
      const count = 3 + Math.floor(random() * 4);
      const progresses = Array.from({ length: count }, () => random()).sort((a, b) => a - b);
      const keyframes = progresses.map((_, index) => keyframe({
        id: `k${index}`,
        pitchDeg: random() * 85,
        zoom: 5 + random() * 15,
        bearingDeg: random() * 360,
      }));
      const prepared = preparedTrack(keyframes, straightRoute, progresses);

      for (let sample = 0; sample < 20; sample++) {
        const progress = progresses[0] + random() * (progresses[progresses.length - 1] - progresses[0]);
        const pose = getCinematicCameraPose({ keyframes: prepared, coordinates: straightRoute, progress, routeHeadingDeg: null });
        if (!pose) continue;

        const upperIndex = prepared.findIndex((kf) => kf.progress > progress);
        const lowerIndex = upperIndex === -1 ? prepared.length - 1 : Math.max(0, upperIndex - 1);
        const upper = prepared[upperIndex === -1 ? prepared.length - 1 : upperIndex];
        const lower = prepared[lowerIndex];

        expect(pose.pitch).toBeGreaterThanOrEqual(Math.min(lower.pitchDeg, upper.pitchDeg) - 1e-9);
        expect(pose.pitch).toBeLessThanOrEqual(Math.max(lower.pitchDeg, upper.pitchDeg) + 1e-9);
        expect(pose.zoom).toBeGreaterThanOrEqual(Math.min(lower.zoom, upper.zoom) - 1e-9);
        expect(pose.zoom).toBeLessThanOrEqual(Math.max(lower.zoom, upper.zoom) + 1e-9);
      }
    }
  });

  it('never overshoots on bearing either, for a segment whose Catmull-Rom tangents come from steep neighbours', () => {
    // Reproduces a real report: the camera appeared to whip around and the
    // marker looked like it "jumped off the track". Pitch and zoom were
    // already clamped to the segment's own range, but bearing was not — a
    // Catmull-Rom tangent derived from a neighbour with a very different
    // bearing can push the interpolated bearing well past both of the
    // segment's own endpoints. These four unwrapped bearings (found by
    // sweeping for the worst case) overshoot the b->c range of [140, 170]
    // by 28 degrees at t=0.6 without the clamp.
    const prepared: PreparedCinematicKeyframe[] = [-170, 140, 170, -170].map((worldBearingDeg, index) => ({
      id: `k${index}`,
      progress: [0, 0.3, 0.32, 0.7][index],
      worldBearingDeg,
      frame: 'world',
      routeHeadingAtAnchorDeg: null,
      pitchDeg: 40,
      zoom: 15,
      easing: 'smooth',
    }));

    for (let sample = 0; sample <= 20; sample++) {
      const progress = prepared[1].progress + (sample / 20) * (prepared[2].progress - prepared[1].progress);
      const pose = getCinematicCameraPose({ keyframes: prepared, coordinates: straightRoute, progress, routeHeadingDeg: null });
      expect(pose).not.toBeNull();
      expect(pose!.bearing).toBeGreaterThanOrEqual(140 - 1e-9);
      expect(pose!.bearing).toBeLessThanOrEqual(170 + 1e-9);
    }
  });
});


describe('local cinematic shots', () => {
  const basePose = { center: [0, 0] as [number, number], bearing: 350, pitch: 40, zoom: 12 };
  const sample = (frames: PreparedCinematicKeyframe[], progress: number, heading = 90) => applyLocalCinematicShots({
    keyframes: frames, basePose, coordinates: straightRoute, progress, routeHeadingDeg: heading, totalDurationMs: 60_000,
  });
  it('preserves the exact automatic pose outside the shot window', () => {
    const frames = preparedTrack([keyframe({ id: 'a', scope: 'local', zoomMode: 'custom', bearingDeg: 10, pitchDeg: 60, zoom: 16 })], straightRoute, [0.5]);
    expect(sample([], 0.5)).toBe(basePose);
    expect(sample(frames, 0.4)).toBe(basePose);
    expect(sample(frames, 0.55)).toBe(basePose);
    expect(sample(frames, 0.5)).toMatchObject({ bearing: 10, pitch: 60, zoom: 16 });
    expect(sample(frames, 0.475).bearing).toBeCloseTo(0);
  });
  it('keeps the automatic flight distance when a local shot has no explicit zoom', () => {
    const frames = preparedTrack([keyframe({ id: 'automatic', scope: 'local', zoom: 18, pitchDeg: 60 })], straightRoute, [0.5]);
    expect(sample(frames, 0.5)).toMatchObject({ zoom: basePose.zoom, pitch: 60 });
    expect(sample(frames, 0.475).zoom).toBe(basePose.zoom);
    const movingBase = { ...basePose, zoom: 13.4 };
    expect(applyLocalCinematicShots({ keyframes: frames, basePose: movingBase, coordinates: straightRoute,
      progress: 0.5, routeHeadingDeg: 90, totalDurationMs: 60_000 }).zoom).toBe(13.4);
  });
  it('blends to a saved distance only when the shot requests it', () => {
    const frames = preparedTrack([keyframe({ id: 'custom', scope: 'local', zoomMode: 'custom', zoom: 16 })], straightRoute, [0.5]);
    expect(sample(frames, 0.5).zoom).toBe(16);
    expect(sample(frames, 0.475).zoom).toBeCloseTo(14);
  });
  it('connects close shots and restores the base between distant shots', () => {
    const frames = preparedTrack([keyframe({ id: 'a', scope: 'local', zoomMode: 'custom', zoom: 14 }), keyframe({ id: 'b', scope: 'local', zoomMode: 'custom', zoom: 18 }), keyframe({ id: 'c', scope: 'local' })], straightRoute, [0.3, 0.38, 0.8]);
    expect(sample(frames, 0.34).zoom).toBeCloseTo(16);
    expect(sample(frames, 0.6)).toBe(basePose);
  });
  it('holds the authored view for the chosen duration, then blends back to the automatic view', () => {
    const frames = preparedTrack([keyframe({ id: 'a', scope: 'local', zoomMode: 'custom', holdDurationMs: 4000, bearingDeg: 10, zoom: 16 })], straightRoute, [0.5]);
    const timing = getLocalShotTimings(frames, 60_000)[0];
    expect(timing).toMatchObject({ startMs: 25_000, holdStartMs: 28_000, holdEndMs: 32_000, endMs: 35_000 });
    expect(sample(frames, 28_000 / 60_000)).toMatchObject({ zoom: 16, center: basePose.center });
    expect(sample(frames, 32_000 / 60_000)).toMatchObject({ zoom: 16, center: basePose.center });
    expect(sample(frames, 35_000 / 60_000)).toBe(basePose);
    expect(sample(frames, 0.4)).toBe(basePose);
  });
  it('smoothly limits shot-specific treatment to the shot window', () => {
    const frames = preparedTrack([keyframe({ id: 'a', scope: 'local', holdDurationMs: 4000 })], straightRoute, [0.5]);
    const timings = getLocalShotTimings(frames, 60_000);
    expect(localShotInfluence([], 30_000)).toBe(0);
    expect(localShotInfluence(timings, 25_000)).toBe(0);
    expect(localShotInfluence(timings, 26_500)).toBeCloseTo(0.5);
    expect(localShotInfluence(timings, 30_000)).toBe(1);
    expect(localShotInfluence(timings, 33_500)).toBeCloseTo(0.5);
    expect(localShotInfluence(timings, 35_000)).toBe(0);
  });
  it('crossfades overlapping holds and reaches both saved frames without changing the center', () => {
    const frames = preparedTrack([keyframe({ id: 'a', scope: 'local', zoomMode: 'custom', holdDurationMs: 6000, zoom: 14 }), keyframe({ id: 'b', scope: 'local', zoomMode: 'custom', holdDurationMs: 6000, zoom: 18 })], straightRoute, [0.3, 0.35]);
    const [a, b] = getLocalShotTimings(frames, 60_000);
    expect(a.holdEndMs).toBeLessThan(b.holdStartMs);
    expect(sample(frames, 0.3).zoom).toBe(14);
    expect(sample(frames, 0.35).zoom).toBe(18);
    expect(sample(frames, 0.325)).toMatchObject({ zoom: 16, center: basePose.center });
    expect(a.endMs).toBe(b.holdStartMs);
    expect(localShotInfluence([a, b], (a.holdEndMs + b.holdStartMs) / 2)).toBeCloseTo(1);
  });
  it('preserves a saved route-relative view while using a stable heading reference', () => {
    const frames = prepareCinematicKeyframeTrack([{ keyframe: keyframe({ id: 'stable', scope: 'local', zoomMode: 'custom', frame: 'route', bearingDeg: 10, holdDurationMs: 2000 }), progress: 0.5 }], straightRoute, () => 30);
    const rawAnchor = getRouteBearingAtProgress(straightRoute, 0.5);
    expect(sample(frames, 0.5, 30).bearing).toBeCloseTo((rawAnchor + 10) % 360);
    expect(sample(frames, 0.5, 40).bearing).toBeCloseTo((rawAnchor + 20) % 360);
  });
  it('turns route-relative shots with the route while world shots stay fixed', () => {
    const route = preparedTrack([keyframe({ id: 'route', scope: 'local', zoomMode: 'custom', frame: 'route', bearingDeg: 0 })], straightRoute, [0.5]);
    const world = preparedTrack([keyframe({ id: 'world', scope: 'local', zoomMode: 'custom', bearingDeg: 90 })], straightRoute, [0.5]);
    expect(sample(route, 0.5, 120).bearing).toBeCloseTo(120);
    expect(sample(world, 0.5, 120).bearing).toBeCloseTo(90);
  });
});
