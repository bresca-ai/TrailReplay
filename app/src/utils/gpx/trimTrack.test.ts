import { describe, expect, it } from 'vitest';
import { buildTrackTrimAxis, trackTrimRangeForValues, trimTrack } from './trimTrack';
import { createTrimTestTrack } from '@/test/fixtures/trimTrack';
import { serializeTrackToGpx } from './serializeTrackToGpx';
import { parseGPX } from '@/utils/gpxParser';

describe('trimTrack', () => {
  it.each([[1, 5], [0, 4], [1, 4], [2, 3]])('keeps only consecutive recorded points %i through %i, inclusively', (start, end) => {
    const track = createTrimTestTrack();
    const trimmed = trimTrack(track, start, end);
    expect(trimmed.points).toHaveLength(end - start + 1);
    trimmed.points.forEach((point, index) => {
      const raw = track.points[start + index];
      expect(point).toMatchObject({
        lat: raw.lat, lon: raw.lon, elevation: raw.elevation, time: raw.time,
        heartRate: raw.heartRate, cadence: raw.cadence, power: raw.power, temperature: raw.temperature,
      });
    });
    expect(trimmed.points[0].distance).toBe(0);
    expect(trimmed.points[0].speed).toBe(0);
    expect(trimmed.totalDistance).toBeCloseTo(track.points[end].distance - track.points[start].distance);
    expect(trimmed.totalTime).toBe((track.points[end].time!.getTime() - track.points[start].time!.getTime()) / 1000);
    expect(track.points).toHaveLength(6);
  });

  it('recomputes elevation statistics, bounds and speed while retaining track identity and style', () => {
    const original = { ...createTrimTestTrack(), id: 'my-route', activityIcon: 'bike', color: '#000000', visible: false };
    const result = trimTrack(original, 1, 4);
    expect(result).toMatchObject({
      id: 'my-route', name: original.name, activityIcon: 'bike', color: '#000000', visible: false,
      minElevation: 100, maxElevation: 160, elevationGain: 60, elevationLoss: 0,
      totalTime: 90, movingTime: 90,
      bounds: { minLat: original.points[1].lat, maxLat: original.points[4].lat, minLon: original.points[1].lon, maxLon: original.points[4].lon },
    });
    expect(result.maxSpeed).toBeLessThan(original.maxSpeed);
    expect(result.avgSpeed).toBeCloseTo(result.totalDistance / 90 * 3.6);
  });

  it('round-trips the retained timestamps and sensor data through actual GPX serialization', () => {
    const original = createTrimTestTrack();
    const trimmed = trimTrack(original, 1, 4);
    const parsed = parseGPX(serializeTrackToGpx(trimmed), 'cropped.gpx');
    expect(parsed.points).toEqual(trimmed.points);
    expect(parsed.totalDistance).toBeCloseTo(trimmed.totalDistance);
  });

  it.each([[-1, 4], [0, 6], [2, 2], [4, 2], [0.5, 3], [NaN, 3]])('rejects invalid or empty ranges [%s, %s]', (start, end) => {
    expect(() => trimTrack(createTrimTestTrack(), start, end)).toThrow(RangeError);
  });
});

describe('recording axis and snapping', () => {
  it('uses actual elapsed time for unevenly sampled recordings', () => {
    const axis = buildTrackTrimAxis(createTrimTestTrack());
    expect(axis).toEqual({ mode: 'time', values: [0, 10000, 40000, 60000, 100000, 120000], max: 120000 });
    expect(trackTrimRangeForValues(axis, 39000, 98000)).toEqual([2, 4]);
    expect(trackTrimRangeForValues(axis, 119999, 120000)).toEqual([4, 5]);
    expect(trackTrimRangeForValues(axis, 39999, 40001)).toEqual([2, 3]);
  });

  it.each(['missing', 'partial', 'invalid', 'backward'])('uses distance when timestamps are %s without inventing times', (kind) => {
    const track = createTrimTestTrack();
    if (kind === 'missing') track.points.forEach((point) => { point.time = null; });
    if (kind === 'partial') track.points[2].time = null;
    if (kind === 'invalid') track.points[2].time = new Date(NaN);
    if (kind === 'backward') track.points[2].time = new Date(0);
    const axis = buildTrackTrimAxis(track);
    expect(axis.mode).toBe('distance');
    const result = trimTrack(track, 1, 3);
    expect(result.points.map((point) => point.time)).toEqual(track.points.slice(1, 4).map((point) => point.time));
  });

  it('keeps duplicate timestamps and chooses consecutive points for a stationary route', () => {
    const track = createTrimTestTrack();
    track.points[2].time = track.points[1].time;
    expect(buildTrackTrimAxis(track).mode).toBe('time');
    track.points.forEach((point) => { point.time = null; point.distance = 0; });
    const axis = buildTrackTrimAxis(track);
    expect(axis).toEqual({ mode: 'points', values: [0, 1, 2, 3, 4, 5], max: 5 });
    expect(trackTrimRangeForValues(axis, 1, 4)).toEqual([1, 4]);
  });
});
