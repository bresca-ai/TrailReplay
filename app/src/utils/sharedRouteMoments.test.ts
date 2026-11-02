import { describe, expect, it } from 'vitest';
import { parseGPX } from '@/utils/gpxParser';
import type { JourneySegment, TextAnnotation } from '@/types';
import { resolveSharedRouteMoments } from './sharedRouteMoments';
import { playbackTimeForRoute } from './annotationTiming';
import { getActivePlaybackAnnotationId } from './playbackAnnotations';

const makeTrack = (name: string, points: string) => parseGPX(`<gpx><trk><name>${name}</name><trkseg>${points}</trkseg></trk></gpx>`, `${name}.gpx`);
const trackA = makeTrack('A', '<trkpt lat="42" lon="1"/><trkpt lat="42" lon="1.01"/>');
const trackB = makeTrack('B', '<trkpt lat="42" lon="1.02"/><trkpt lat="42" lon="1"/>');
const distant = makeTrack('C', '<trkpt lat="43" lon="1"/><trkpt lat="43" lon="1.01"/>');
const tracks = [trackA, trackB, distant];
const segments: JourneySegment[] = [
  { id: 'a', type: 'track', trackId: trackA.id, duration: 10000 },
  { id: 'b', type: 'track', trackId: trackB.id, duration: 20000 },
  { id: 'c', type: 'track', trackId: distant.id, duration: 10000 },
];
const moment: TextAnnotation = { id: 'water', lat: 42, lon: 1.005, title: 'Water', progress: 0.125, color: '#fff', displayDuration: 4000, presentation: 'side-panel', holdDuration: 2000, showOnMatchingRoutes: true };

describe('shared route moments', () => {
  it.each(['recorded', 'uniform'] as const)('shows once on each nearby route and applies each slowdown (%s)', (mode) => {
    const appearances = resolveSharedRouteMoments([moment], segments, tracks, mode);
    expect(appearances).toHaveLength(2);
    expect(appearances.map((item) => item.id)).toEqual(['water', 'water']);
    expect(appearances[0].progress).toBeLessThan(appearances[1].progress);
    expect(playbackTimeForRoute(40000, 40000, appearances)).toBeCloseTo(44000);
    for (const appearance of appearances) {
      expect(getActivePlaybackAnnotationId({ annotations: appearances, currentTime: appearance.progress * 40000, totalDuration: 40000, phase: 'playing' })).toBe('water');
    }
  });
  it('uses the active pace mode for each appearance', () => {
    const timed = makeTrack('Timed', '<trkpt lat="42" lon="1"><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="42" lon="1.005"><time>2026-01-01T00:01:30Z</time></trkpt><trkpt lat="42" lon="1.01"><time>2026-01-01T00:01:40Z</time></trkpt>');
    const routes: JourneySegment[] = [{ id: 'timed', type: 'track', trackId: timed.id, duration: 10000 }, { ...segments[1], duration: 10000 }];
    const recorded = resolveSharedRouteMoments([moment], routes, [timed, trackB], 'recorded');
    const uniform = resolveSharedRouteMoments([moment], routes, [timed, trackB], 'uniform');
    expect(recorded[0].progress).toBeCloseTo(0.45, 2);
    expect(uniform[0].progress).toBeLessThan(recorded[0].progress);
  });
  it('keeps route matches on the correct timeline when a camera transition is present', () => {
    const bridge: JourneySegment = { id: 'camera', type: 'transport', mode: 'camera', from: { lat: 42, lon: 1.01 }, to: { lat: 42, lon: 1.02 }, duration: 5000, distance: 0 };
    for (const mode of ['recorded', 'uniform'] as const) {
      const appearances = resolveSharedRouteMoments([moment], [segments[0], bridge, segments[1]], tracks, mode);
      expect(appearances).toHaveLength(2);
      expect(appearances[0].progress).toBeLessThan(10 / 35);
      expect(appearances[1].progress).toBeGreaterThan(15 / 35);
    }
  });
  it('keeps ordinary moments unchanged and recalculates when routes are reordered', () => {
    const ordinary = [{ ...moment, showOnMatchingRoutes: false }];
    expect(resolveSharedRouteMoments(ordinary, segments, tracks, 'recorded')).toBe(ordinary);
    const appearances = resolveSharedRouteMoments([moment], [segments[1], segments[0]], tracks, 'recorded');
    expect(appearances).toHaveLength(2);
    expect(appearances[0].progress).toBeLessThan(appearances[1].progress);
    expect(appearances[0].progress).toBeCloseTo(0.5, 2);
  });
  it('retains the original moment when no routes match', () => {
    expect(resolveSharedRouteMoments([moment], [segments[2]], tracks, 'recorded')).toEqual([moment]);
  });
});
