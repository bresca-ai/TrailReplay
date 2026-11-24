import { describe, expect, it } from 'vitest';
import type { JourneySegment } from '@/types';
import { parseGPX } from '@/utils/gpxParser';
import { createRouteSectionAnnotation, routeSectionStart } from './routeSectionAnnotations';
import { combineAnnotationAndMarkerHolds, computeMarkerTransitions, markerTransitionHolds } from './markerTransitions';
import { resolveSharedRouteMoments } from './sharedRouteMoments';
import { playbackTimeForRoute } from './annotationTiming';

const makeTrack = (name: string, lon: number, icon: string) => ({
  ...parseGPX(`<gpx><trk><name>${name}</name><trkseg><trkpt lat="42" lon="${lon}"><ele>100</ele></trkpt><trkpt lat="42" lon="${lon + 0.01}"><ele>200</ele></trkpt></trkseg></trk></gpx>`, `${name}.gpx`), activityIcon: icon,
});
const run = makeTrack('Run', 1, '3d-runner');
const bike = makeTrack('Bike', 1.01, '3d-road-bike');
const tracks = [run, bike];
const segments: JourneySegment[] = [{ id: 'run', type: 'track', trackId: run.id, duration: 10000 }, { id: 'bike', type: 'track', trackId: bike.id, duration: 20000 }];

describe('route section annotation', () => {
  it('creates an editable card at the selected section with its distance and elevation', () => {
    const note = createRouteSectionAnnotation({ id: 'note', segmentId: 'bike', segments, tracks, mode: 'recorded', unitSystem: 'metric', eyebrow: 'Next section' });
    expect(note).toMatchObject({ id: 'note', routeSectionSegmentId: 'bike', title: 'Bike', presentation: 'side-panel', progress: 1 / 3, eyebrow: 'Next section' });
    expect(note?.meta).toContain('km');
    expect(note?.meta).toContain('↑ 100 m');
    expect(createRouteSectionAnnotation({ id: 'bad', segmentId: 'missing', segments, tracks, mode: 'recorded', unitSystem: 'metric', eyebrow: '' })).toBeNull();
  });
  it('follows the selected section when segments are reordered or durations change', () => {
    const note = createRouteSectionAnnotation({ id: 'note', segmentId: 'bike', segments, tracks, mode: 'recorded', unitSystem: 'metric', eyebrow: '' })!;
    expect(resolveSharedRouteMoments([note], [segments[1], segments[0]], tracks, 'recorded')[0].progress).toBe(0);
    const adjusted = [{ ...segments[0], duration: 20000 }, segments[1]];
    expect(resolveSharedRouteMoments([note], adjusted, tracks, 'recorded')[0].progress).toBe(0.5);
    expect(routeSectionStart(segments, tracks, 'uniform', 'bike')?.progress).toBeCloseTo(run.totalDistance / (run.totalDistance + bike.totalDistance));
  });
  it('shares the animation slowdown and falls back to an ordinary annotation without one', () => {
    const note = createRouteSectionAnnotation({ id: 'note', segmentId: 'bike', segments, tracks, mode: 'recorded', unitSystem: 'metric', eyebrow: '' })!;
    const transitions = computeMarkerTransitions({ segments, tracks, routeTimingMode: 'recorded', markerType: 'icon', comparisonActive: false });
    const holds = markerTransitionHolds(transitions);
    const timing = combineAnnotationAndMarkerHolds([note], holds);
    expect(timing[0].holdDuration).toBe(0);
    expect(playbackTimeForRoute(30000, 30000, timing)).toBe(playbackTimeForRoute(30000, 30000, holds));
    expect(combineAnnotationAndMarkerHolds([note], [])[0].holdDuration).toBeUndefined();
  });
});
