import { describe, expect, it } from 'vitest';
import { parseGPX } from '@/utils/gpxParser';
import type { JourneySegment } from '@/types';
import { withGapCameraTransitions } from './journeyGaps';

const track = (name: string, points: string) => parseGPX(`<gpx><trk><name>${name}</name><trkseg>${points}</trkseg></trk></gpx>`, `${name}.gpx`);
const a = track('A', '<trkpt lat="42" lon="1"/><trkpt lat="42" lon="1.01"/>');
const b = track('B', '<trkpt lat="42" lon="1.0105"/><trkpt lat="42" lon="1.02"/>');   // starts ~40 m from where A ends
const c = track('C', '<trkpt lat="42" lon="1.05"/><trkpt lat="42" lon="1.06"/>');     // starts ~2.5 km from where B ends
const tracks = [a, b, c];
const seg = (id: string, trackId: string): JourneySegment => ({ id, type: 'track', trackId, duration: 10000 });

describe('withGapCameraTransitions', () => {
  it('puts a camera move between consecutive routes that do not join up', () => {
    const segments = [seg('a', a.id), seg('b', b.id), seg('c', c.id)];
    const result = withGapCameraTransitions(segments, tracks);
    expect(result.map((entry) => entry.type === 'transport' ? entry.mode : entry.id)).toEqual(['a', 'b', 'camera', 'c']);
    const camera = result[2];
    expect(camera.type === 'transport' && [camera.from.lon, camera.to.lon]).toEqual([1.02, 1.05]);
  });

  it('does not replace an explicitly selected marker animation when routes are reordered', () => {
    const segments: JourneySegment[] = [seg('b', b.id), { id: 'c', type: 'track', trackId: c.id, duration: 10000, markerTransitionFromSegmentId: 'b' }];
    expect(withGapCameraTransitions(segments, tracks)).toBe(segments);
  });

  it('leaves routes that join, or already have something between them, alone', () => {
    const joined = [seg('a', a.id), seg('b', b.id)];
    expect(withGapCameraTransitions(joined, tracks)).toBe(joined);
    const bridged: JourneySegment[] = [seg('b', b.id), { id: 'bus', type: 'transport', mode: 'bus', from: { lat: 42, lon: 1.02 }, to: { lat: 42, lon: 1.05 }, duration: 5000, distance: 2500 }, seg('c', c.id)];
    expect(withGapCameraTransitions(bridged, tracks)).toBe(bridged);
  });
});
