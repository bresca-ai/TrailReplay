import { describe, expect, it } from 'vitest';
import type { GPXPoint, GPXTrack, Journey, TrackSegment } from '@/types';
import { createDefaultSocialShareSettings } from '@/store/defaults';
import { buildSocialShareSummary } from './socialShareData';

function point(distance: number, elevation: number): GPXPoint {
  return {
    lat: 42 + distance / 100_000,
    lon: 1,
    elevation,
    time: new Date(distance),
    heartRate: null,
    cadence: null,
    power: null,
    temperature: null,
    distance,
    speed: 10,
  };
}

function track(id: string, totalTime: number, movingTime: number): GPXTrack {
  return {
    id,
    name: id,
    activityIcon: '🏃',
    points: [point(0, 100), point(500, 150), point(1000, 200)],
    totalDistance: 1000,
    totalTime,
    movingTime,
    elevationGain: 100,
    elevationLoss: 0,
    maxElevation: 200,
    minElevation: 100,
    maxSpeed: 10,
    avgSpeed: 10,
    avgMovingSpeed: 10,
    bounds: { minLat: 42, maxLat: 42.01, minLon: 1, maxLon: 1 },
    color: '#C1652F',
    visible: true,
  };
}

/**
 * Issue #104: a 27.5 h run was shared as 23:57 because every stat site read
 * moving time. The shared poster has to agree with the stats overlay — it is
 * the number that ends up next to an official race result.
 */
describe('buildSocialShareSummary duration', () => {
  const settings = createDefaultSocialShareSettings();

  it('shares the total clock, stops included', () => {
    const entry = track('ultra', 99_000, 86_220);
    const summary = buildSocialShareSummary(settings, [entry], entry.id, null, [], 'metric');

    expect(summary.durationSeconds).toBe(99_000);
  });

  it('adds up the total clock across a journey', () => {
    const first = track('day-1', 40_000, 30_000);
    const second = track('day-2', 50_000, 35_000);
    const segments: TrackSegment[] = [
      { id: 'segment-1', type: 'track', trackId: first.id, duration: 1000 },
      { id: 'segment-2', type: 'track', trackId: second.id, duration: 1000 },
    ];
    const journey: Journey = { id: 'journey', name: 'Two days', segments, totalDistance: 2000, totalDuration: 2000 };

    const summary = buildSocialShareSummary(settings, [first, second], first.id, journey, segments, 'metric');

    expect(summary.durationSeconds).toBe(90_000);
  });

  /** A file with no timestamps has only one clock; it still has to show one. */
  it('falls back to moving time when there is no total clock', () => {
    const entry = track('no-total', 0, 600);
    const summary = buildSocialShareSummary(settings, [entry], entry.id, null, [], 'metric');

    expect(summary.durationSeconds).toBe(600);
  });
});
