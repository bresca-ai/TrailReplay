import { describe, expect, it } from 'vitest';
import type { GPXPoint, GPXTrack, TrackSegment } from '@/types';
import { createDefaultSettings } from '@/store/defaults';
import { buildComputedJourney } from '@/utils/journeyUtils';
import { calculateCurrentLiveStats, elapsedTrackTime } from './liveStats';

function point(distance: number, elevation: number, seconds: number | null): GPXPoint {
  return {
    lat: 42 + distance / 100_000,
    lon: 1,
    elevation,
    time: seconds === null ? null : new Date(seconds * 1000),
    heartRate: null,
    cadence: null,
    power: null,
    temperature: null,
    distance,
    speed: 10,
  };
}

function track(id: string, elevations: [number, number, number], hasTime = true): GPXTrack {
  return {
    id,
    name: id,
    activityIcon: '🏃',
    points: [
      point(0, elevations[0], hasTime ? 0 : null),
      point(500, elevations[1], hasTime ? 50 : null),
      point(1000, elevations[2], hasTime ? 100 : null),
    ],
    totalDistance: 1000,
    totalTime: hasTime ? 100 : 0,
    movingTime: hasTime ? 100 : 0,
    elevationGain: 0,
    elevationLoss: 0,
    maxElevation: Math.max(...elevations),
    minElevation: Math.min(...elevations),
    maxSpeed: 10,
    avgSpeed: 10,
    avgMovingSpeed: 10,
    bounds: { minLat: 42, maxLat: 42.01, minLon: 1, maxLon: 1 },
    color: id === 'first' ? '#C1652F' : '#3B82F6',
    visible: true,
  };
}

describe('total and moving duration', () => {
  function stoppedTrack(): GPXTrack {
    // 27.5 h on the wall clock, 23:57 of it moving — the shape reported in #104.
    const entry = track('stopped', [100, 150, 200]);
    entry.totalTime = 99_000;
    entry.movingTime = 86_220;
    return entry;
  }

  it('reports the total clock and the moving clock side by side', () => {
    const entry = stoppedTrack();
    const segments: TrackSegment[] = [
      { id: 'segment-stopped', type: 'track', trackId: entry.id, duration: 1000 },
    ];
    const computedJourney = buildComputedJourney(segments, [entry])!;

    const stats = calculateCurrentLiveStats({
      activeTrack: entry,
      computedJourney,
      currentPosition: {
        ...entry.points[2],
        segmentIndex: 0,
        segmentType: 'track',
        trackId: entry.id,
      },
      playbackProgress: 1,
      restartPerTrack: false,
      segmentTimings: computedJourney.segmentTimings,
      totalDistance: computedJourney.totalDistance,
      tracks: [entry],
    });

    expect(stats.duration).toBe(99_000);
    expect(stats.movingDuration).toBe(86_220);
  });

  it('falls back to the other clock when a track carries only one of them', () => {
    const movingOnly = track('moving-only', [0, 0, 0]);
    movingOnly.totalTime = 0;
    movingOnly.movingTime = 600;

    expect(elapsedTrackTime([], [movingOnly], movingOnly, 1, 0, 'total')).toBe(600);
    expect(elapsedTrackTime([], [movingOnly], movingOnly, 1, 0, 'moving')).toBe(600);
  });

  it('defaults to the total clock', () => {
    const entry = track('stopped', [0, 0, 0]);
    entry.totalTime = 1000;
    entry.movingTime = 400;

    expect(elapsedTrackTime([], [entry], entry, 1)).toBe(1000);
  });
});

describe('calculateCurrentLiveStats', () => {
  it('starts elevation gain at zero when the second route begins with default settings', () => {
    const tracks = [track('first', [100, 150, 200]), track('second', [300, 320, 310])];
    const segments: TrackSegment[] = tracks.map((entry) => ({
      id: `segment-${entry.id}`,
      type: 'track',
      trackId: entry.id,
      duration: 1000,
    }));
    const computedJourney = buildComputedJourney(segments, tracks)!;

    const stats = calculateCurrentLiveStats({
      activeTrack: tracks[0],
      computedJourney,
      currentPosition: {
        ...tracks[1].points[0],
        segmentIndex: 1,
        segmentType: 'track',
        trackId: 'second',
      },
      playbackProgress: 0.5001,
      restartPerTrack: createDefaultSettings().journeyStatsMode === 'per-track',
      segmentTimings: computedJourney.segmentTimings,
      totalDistance: computedJourney.totalDistance,
      tracks,
    });

    expect(stats.elevationGain).toBe(0);
  });

  it('can restart distance, duration, pace basis, and elevation for each track', () => {
    const tracks = [track('first', [100, 120, 140]), track('second', [50, 70, 60])];
    const segments: TrackSegment[] = tracks.map((entry) => ({
      id: `segment-${entry.id}`,
      type: 'track',
      trackId: entry.id,
      duration: 1000,
    }));
    const computedJourney = buildComputedJourney(segments, tracks)!;
    const currentPosition = {
      ...tracks[1].points[1],
      segmentIndex: 1,
      segmentType: 'track' as const,
      trackId: 'second',
    };
    const common = {
      activeTrack: tracks[0],
      computedJourney,
      currentPosition,
      playbackProgress: 0.75,
      segmentTimings: computedJourney.segmentTimings,
      totalDistance: computedJourney.totalDistance,
      tracks,
    };

    const cumulative = calculateCurrentLiveStats({ ...common, restartPerTrack: false });
    const perTrack = calculateCurrentLiveStats({ ...common, restartPerTrack: true });

    expect(cumulative.distance).toBe(1500);
    expect(cumulative.duration).toBe(150);
    expect(cumulative.elevationGain).toBe(60);
    expect(perTrack.distance).toBe(500);
    expect(perTrack.duration).toBe(50);
    expect(perTrack.elevationGain).toBe(20);
    expect(perTrack.averageSpeed).toBe(10);
  });

  it('falls back to elapsed video time when no track has recorded timestamps (e.g. Constant Pace)', () => {
    const tracks = [track('first', [100, 120, 140], false)];
    const segments: TrackSegment[] = tracks.map((entry) => ({
      id: `segment-${entry.id}`,
      type: 'track',
      trackId: entry.id,
      duration: 40_000,
    }));
    const computedJourney = buildComputedJourney(segments, tracks)!;
    const currentPosition = {
      ...tracks[0].points[1],
      segmentIndex: 0,
      segmentType: 'track' as const,
      trackId: 'first',
    };

    const stats = calculateCurrentLiveStats({
      activeTrack: tracks[0],
      computedJourney,
      currentPosition,
      playbackProgress: 0.5,
      restartPerTrack: false,
      segmentTimings: computedJourney.segmentTimings,
      totalDistance: computedJourney.totalDistance,
      tracks,
      videoDurationSeconds: 40,
    });

    expect(stats.duration).toBe(20);
  });

  it('falls back to the segment\'s share of video time per-track when that track has no timestamps', () => {
    const tracks = [track('first', [100, 120, 140]), track('second', [50, 70, 60], false)];
    const segments: TrackSegment[] = tracks.map((entry) => ({
      id: `segment-${entry.id}`,
      type: 'track',
      trackId: entry.id,
      duration: 20_000,
    }));
    const computedJourney = buildComputedJourney(segments, tracks)!;
    const currentPosition = {
      ...tracks[1].points[1],
      segmentIndex: 1,
      segmentType: 'track' as const,
      trackId: 'second',
    };

    const stats = calculateCurrentLiveStats({
      activeTrack: tracks[0],
      computedJourney,
      currentPosition,
      playbackProgress: 0.75,
      restartPerTrack: true,
      segmentTimings: computedJourney.segmentTimings,
      totalDistance: computedJourney.totalDistance,
      tracks,
      videoDurationSeconds: 40,
    });

    // Progress 0.75 is halfway through the second (20s-video) segment.
    expect(stats.duration).toBe(10);
  });

  it('elapsedTrackTime falls back to video time with no journey and an untimed active track', () => {
    const untimed = track('solo', [100, 120, 140], false);
    expect(elapsedTrackTime([], [], untimed, 0.5, 30)).toBe(15);
  });

  /**
   * Elevation used to be counted from the duration ratios while distance came
   * from the marker. Under Constant Pace the marker advances by distance, so on
   * legs whose durations are not proportional to their lengths the two told
   * different stories: distance still reading leg 1 while elevation had already
   * added the whole of it, and elevation a thousand metres up by the time
   * distance reset to zero.
   */
  it('keeps elevation on the same leg as distance when legs are equal in time but not in length', () => {
    // Three equal 30s legs of very different lengths, which is what dropping
    // three GPX files gives you.
    const long = track('long', [0, 500, 1000]);
    const short = track('short', [0, 100, 200]);
    // Stretch the first leg so distance and duration cannot agree.
    long.points = long.points.map((point, index) => ({ ...point, distance: index * 10_000 }));
    long.totalDistance = 20_000;
    short.points = short.points.map((point, index) => ({ ...point, distance: index * 1_000 }));
    short.totalDistance = 2_000;

    const tracks = [long, short];
    const segments: TrackSegment[] = tracks.map((entry) => ({
      id: `segment-${entry.id}`, type: 'track', trackId: entry.id, duration: 30_000,
    }));
    const computedJourney = buildComputedJourney(segments, tracks)!;

    const statsAt = (segmentIndex: number, distanceIntoLeg: number, progress: number) => {
      const source = tracks[segmentIndex];
      const point = source.points.reduce((best, candidate) => (
        candidate.distance <= distanceIntoLeg ? candidate : best), source.points[0]);
      return calculateCurrentLiveStats({
        activeTrack: tracks[0],
        computedJourney,
        currentPosition: {
          ...point,
          distance: distanceIntoLeg,
          segmentIndex,
          segmentType: 'track',
          trackId: source.id,
        },
        playbackProgress: progress,
        restartPerTrack: true,
        segmentTimings: computedJourney.segmentTimings,
        totalDistance: computedJourney.totalDistance,
        tracks,
      });
    };

    // Progress says leg 2; the marker is still most of the way through leg 1.
    // Elevation must follow the marker, not the clock.
    const stillOnLegOne = statsAt(0, 15_000, 0.4);
    expect(stillOnLegOne.distance).toBe(15_000);
    // Leg 1 climbs 1000 m in total and leg 2 another 200 m. Counting from the
    // clock would have added all of leg 1 plus part of leg 2.
    expect(stillOnLegOne.elevationGain).toBeGreaterThan(0);
    expect(stillOnLegOne.elevationGain).toBeLessThanOrEqual(1000);

    // The moment the marker does cross, both restart together.
    const justOntoLegTwo = statsAt(1, 0, 0.5);
    expect(justOntoLegTwo.distance).toBe(0);
    expect(justOntoLegTwo.elevationGain).toBe(0);
  });
});
