import { describe, expect, it } from 'vitest';
import { parseGPX } from '@/utils/gpxParser';
import type { JourneySegment } from '@/types';
import { playbackTimeForRoute } from './annotationTiming';
import { activeMarkerTransition, computeMarkerTransitions, markerClipDurations, MARKER_TRANSITION_GROUPS, markerTransitionHolds, MARKER_TRANSITION_SPEED } from './markerTransitions';

const makeTrack = (name: string, points: string, icon: string) => ({
  ...parseGPX(`<gpx><trk><name>${name}</name><trkseg>${points}</trkseg></trk></gpx>`, `${name}.gpx`),
  activityIcon: icon,
});
const run = makeTrack('Run', '<trkpt lat="42" lon="1"/><trkpt lat="42" lon="1.01"/>', '3d-runner');
const ride = makeTrack('Ride', '<trkpt lat="42" lon="1.01"/><trkpt lat="42" lon="1.05"/>', '3d-road-bike');
// starts 1.6 km from where the run ends
const farRide = makeTrack('Far ride', '<trkpt lat="42" lon="1.03"/><trkpt lat="42" lon="1.05"/>', '3d-road-bike');
const tracks = [run, ride, farRide];
const input = (segments: JourneySegment[], extra: Partial<Parameters<typeof computeMarkerTransitions>[0]> = {}) => ({
  segments, tracks, routeTimingMode: 'recorded' as const, markerType: 'icon' as const, comparisonActive: false, ...extra,
});

describe('marker transitions', () => {
  it('adds one at each change of 3D model, timed at the boundary', () => {
    const segments: JourneySegment[] = [
      { id: 'run', type: 'track', trackId: run.id, duration: 10000 },
      { id: 'bus', type: 'transport', mode: 'bus', from: { lat: 42, lon: 1.01 }, to: { lat: 42, lon: 1.01 }, duration: 10000, distance: 0 },
      { id: 'ride', type: 'track', trackId: ride.id, duration: 20000 },
    ];
    const transitions = computeMarkerTransitions(input(segments));
    expect(transitions.map((entry) => [entry.fromIcon, entry.toIcon])).toEqual([['3d-runner', '3d-bus'], ['3d-bus', '3d-road-bike']]);
    expect(transitions[0].progress).toBeCloseTo(0.25);
    expect(transitions[1].progress).toBeCloseTo(0.5);
    expect(transitions[0].holdDuration).toBe(Math.round((markerClipDurations('3d-runner').exit + markerClipDurations('3d-bus').enter) / MARKER_TRANSITION_SPEED * 1000));
  });

  it('skips repeated models, dot markers, camera moves and comparisons', () => {
    const same: JourneySegment[] = [
      { id: 'a', type: 'track', trackId: run.id, duration: 10000 },
      { id: 'b', type: 'track', trackId: run.id, duration: 10000 },
    ];
    expect(computeMarkerTransitions(input(same))).toEqual([]);
    const pair: JourneySegment[] = [
      { id: 'run', type: 'track', trackId: run.id, duration: 10000 },
      { id: 'cam', type: 'transport', mode: 'camera', from: { lat: 42, lon: 1.01 }, to: { lat: 42, lon: 1.02 }, duration: 3000, distance: 0 },
      { id: 'ride', type: 'track', trackId: ride.id, duration: 10000 },
    ];
    // the marker swaps during a camera move without an animation
    expect(computeMarkerTransitions(input(pair))).toEqual([]);
    const joined: JourneySegment[] = [pair[0], pair[2]];
    expect(computeMarkerTransitions(input(joined)).map((entry) => entry.segmentId)).toEqual(['ride']);
    expect(computeMarkerTransitions(input(joined, { markerType: 'dot' }))).toEqual([]);
    expect(computeMarkerTransitions(input(joined, { comparisonActive: true }))).toEqual([]);
    // routes that don't join up never animate between them, even with nothing in between
    const apart: JourneySegment[] = [pair[0], { id: 'far', type: 'track', trackId: farRide.id, duration: 10000 }];
    expect(computeMarkerTransitions(input(apart))).toEqual([]);
  });

  it('holds playback for the clips unless switched off in the chronology', () => {
    const segments: JourneySegment[] = [
      { id: 'run', type: 'track', trackId: run.id, duration: 10000 },
      { id: 'ride', type: 'track', trackId: ride.id, duration: 10000 },
    ];
    const [transition] = computeMarkerTransitions(input(segments));
    const holds = markerTransitionHolds([transition]);
    expect(playbackTimeForRoute(20000, 20000, holds)).toBeCloseTo(20000 + transition.holdDuration - 1000);
    const skipped = computeMarkerTransitions(input(segments.map((segment) => segment.id === 'ride' ? { ...segment, skipMarkerTransition: true } : segment)));
    expect(skipped[0].skipped).toBe(true);
    expect(markerTransitionHolds(skipped)).toEqual([]);
  });

  it('runs the clip clock from the start of the slowdown to its end', () => {
    const segments: JourneySegment[] = [
      { id: 'run', type: 'track', trackId: run.id, duration: 10000 },
      { id: 'ride', type: 'track', trackId: ride.id, duration: 10000 },
    ];
    const [transition] = computeMarkerTransitions(input(segments));
    const total = transition.exitSeconds + transition.enterSeconds;
    expect(activeMarkerTransition([transition], 9000, 20000)).toBeNull();
    expect(activeMarkerTransition([transition], 9500, 20000)?.clipSeconds).toBeCloseTo(0);
    expect(activeMarkerTransition([transition], 10000, 20000)?.clipSeconds).toBeCloseTo(total / 2, 1);
    expect(activeMarkerTransition([transition], 10500, 20000)?.clipSeconds).toBeCloseTo(total);
  });
});

describe('marker transition length', () => {
  it('uses the length set in the chronology, within bounds, and keeps the clips in step', () => {
    const segments: JourneySegment[] = [
      { id: 'run', type: 'track', trackId: run.id, duration: 10000 },
      { id: 'ride', type: 'track', trackId: ride.id, duration: 10000, markerTransitionDuration: 12000 },
    ];
    const [transition] = computeMarkerTransitions(input(segments));
    expect(transition.holdDuration).toBe(12000);
    expect(transition.defaultDuration).toBe(Math.round((markerClipDurations('3d-runner').exit + markerClipDurations('3d-road-bike').enter) / MARKER_TRANSITION_SPEED * 1000));
    expect(playbackTimeForRoute(20000, 20000, markerTransitionHolds([transition]))).toBeCloseTo(31000);
    expect(activeMarkerTransition([transition], 10500, 20000)?.clipSeconds).toBeCloseTo(transition.exitSeconds + transition.enterSeconds);
    const tooShort = computeMarkerTransitions(input(segments.map((segment) => segment.id === 'ride' ? { ...segment, markerTransitionDuration: 100 } : segment)));
    expect(tooShort[0].holdDuration).toBe(2000);
  });
});

describe('marker clip lengths', () => {
  it('has a length for every model that transitions', () => {
    for (const icon of Object.keys(MARKER_TRANSITION_GROUPS)) {
      const { enter, exit } = markerClipDurations(icon);
      expect(enter, icon).toBeGreaterThan(2);
      expect(exit, icon).toBeGreaterThan(2);
    }
  });
});
