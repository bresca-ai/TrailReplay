import { describe, expect, it } from 'vitest';
import { parseGPX } from '@/utils/gpxParser';
import { buildComputedJourney, progressForRouteDistance } from '@/utils/journeyUtils';
import { resolveRecipe } from './resolveRecipe';
import { RecipeError } from './types';

/** A straight north-bound leg, so distances are easy to reason about. */
function leg(options: {
  name: string;
  startLat: number;
  points: number;
  /** Metres between consecutive points, roughly. */
  spacing?: number;
  start?: string;
  minutesPerPoint?: number;
}) {
  const { name, startLat, points, spacing = 100, start, minutesPerPoint = 3 } = options;
  const step = spacing / 111_320;
  const startTime = start ? new Date(start).getTime() : null;

  const trkpts = Array.from({ length: points }, (_, index) => {
    const lat = (startLat + index * step).toFixed(6);
    const time = startTime !== null
      ? `<time>${new Date(startTime + index * minutesPerPoint * 60_000).toISOString()}</time>`
      : '';
    return `<trkpt lat="${lat}" lon="2.000000"><ele>${1000 + index}</ele>${time}</trkpt>`;
  }).join('');

  return `<?xml version="1.0"?><gpx version="1.1"><trk><name>${name}</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
}

function tracksFrom(files: Array<{ name: string; gpx: string }>) {
  return {
    tracks: files.map((file) => parseGPX(file.gpx, file.name)),
    names: files.map((file) => file.name),
  };
}

describe('resolveRecipe', () => {
  const single = tracksFrom([
    { name: 'race.gpx', gpx: leg({ name: 'Race', startLat: 42, points: 101 }) },
  ]);

  it('places a landmark at the kilometre the recipe asked for', () => {
    const resolved = resolveRecipe(
      { landmarks: [{ km: 5, title: 'Col', type: 'pass' }] },
      single.tracks,
      single.names,
    );

    const [pin] = resolved.userLandmarks;
    expect(pin.title).toBe('Col');
    expect(pin.type).toBe('pass');
    expect(pin.source).toBe('user');
    expect(pin.importance).toBe(5);
    expect(pin.routeDistanceMeters).toBe(5000);
    // 5 km of a 10 km route.
    expect(pin.progress).toBeCloseTo(0.5, 2);
    expect(resolved.report.landmarks[0].km).toBeCloseTo(5, 2);
  });

  it('places an annotation as a timed card, not a pin', () => {
    const resolved = resolveRecipe(
      { annotations: [{ km: 2.5, title: 'Feed station', displayDuration: 4000 }] },
      single.tracks,
      single.names,
    );

    expect(resolved.userLandmarks).toEqual([]);
    expect(resolved.textAnnotations).toHaveLength(1);
    expect(resolved.textAnnotations[0]).toMatchObject({
      title: 'Feed station',
      displayDuration: 4000,
    });
    expect(resolved.textAnnotations[0].progress).toBeCloseTo(0.25, 2);
    expect(resolved.textAnnotations[0].routeDistance).toBeCloseTo(2500, 0);
  });

  it('anchors by coordinate and reports how far off the route it was', () => {
    const resolved = resolveRecipe(
      { landmarks: [{ lat: 42.0449, lon: 2.002, title: 'Hut off the trail' }] },
      single.tracks,
      single.names,
    );

    // The pin stays where it was put; only its timing comes from the route.
    expect(resolved.userLandmarks[0].lat).toBe(42.0449);
    expect(resolved.userLandmarks[0].lon).toBe(2.002);
    expect(resolved.report.landmarks[0].offRouteMeters).toBeGreaterThan(100);
  });

  it('rejects a kilometre that is off the route, but tolerates a rounded one', () => {
    expect(() => resolveRecipe(
      { landmarks: [{ km: 40, title: 'Nowhere' }] },
      single.tracks,
      single.names,
    )).toThrow(RecipeError);

    // A "10K" course measuring 10 000 m exactly still accepts 10.1 as the end.
    const resolved = resolveRecipe(
      { landmarks: [{ km: 10.1, title: 'Finish' }] },
      single.tracks,
      single.names,
    );
    expect(resolved.userLandmarks[0].progress).toBe(1);
  });

  describe('a week of walks', () => {
    const week = tracksFrom([
      { name: 'day-2.gpx', gpx: leg({ name: 'Day 2', startLat: 43, points: 201, start: '2026-05-02T08:00:00Z' }) },
      { name: 'day-1.gpx', gpx: leg({ name: 'Day 1', startLat: 42, points: 101, start: '2026-05-01T08:00:00Z' }) },
      { name: 'day-3.gpx', gpx: leg({ name: 'Day 3', startLat: 44, points: 51, start: '2026-05-03T08:00:00Z' }) },
    ]);

    it('orders dropped files chronologically and shares time by distance', () => {
      const resolved = resolveRecipe(
        { tracks: { files: '*.gpx', order: 'chronological' }, totalDuration: 60_000 },
        week.tracks,
        week.names,
      );

      expect(resolved.tracks.map((track) => track.name)).toEqual(['Day 1', 'Day 2', 'Day 3']);
      expect(resolved.report.stitched).toBe(true);

      // 10 km, 20 km and 5 km: a third of the distance is a third of the video.
      const durations = resolved.journeySegments.map((segment) => segment.duration);
      expect(durations[1]).toBeCloseTo(durations[0] * 2, -2);
      expect(durations[0]).toBeCloseTo(durations[2] * 2, -2);
      expect(durations.reduce((sum, d) => sum + d, 0)).toBeCloseTo(60_000, -2);
    });

    it('derives where the nights were spent', () => {
      const resolved = resolveRecipe(
        {
          tracks: { files: '*.gpx' },
          landmarks: [{ auto: 'overnight-stops', type: 'hut', icon: 'shelter' }],
        },
        week.tracks,
        week.names,
      );

      // Three days means two nights, at the end of days 1 and 2.
      expect(resolved.userLandmarks).toHaveLength(2);
      expect(resolved.userLandmarks.map((pin) => pin.title)).toEqual([
        expect.stringContaining('Night 1'),
        expect.stringContaining('Night 2'),
      ]);
      expect(resolved.userLandmarks.every((pin) => pin.type === 'hut')).toBe(true);
      expect(resolved.userLandmarks[0].lat).toBeCloseTo(42.0898, 3);
      // Distances continue across the stitched journey.
      expect(resolved.userLandmarks[0].routeDistanceMeters).toBeCloseTo(10_000, -2);
      expect(resolved.userLandmarks[1].routeDistanceMeters).toBeCloseTo(30_000, -2);
    });

    it('warns when consecutive days do not join up', () => {
      const resolved = resolveRecipe(
        { tracks: { files: '*.gpx' }, landmarks: [{ auto: 'overnight-stops' }] },
        week.tracks,
        week.names,
      );

      // Day 1 ends at 42.09 and day 2 starts at 43 — a missing track.
      expect(resolved.report.warnings.some((w) => w.includes('Day 1') && w.includes('km from')))
        .toBe(true);
    });

    it('keeps kilometres in each leg\'s own frame', () => {
      const resolved = resolveRecipe(
        {
          tracks: { files: '*.gpx' },
          totalDuration: 60_000,
          annotations: [{ track: 'Day 2', km: 10, title: 'Halfway through day 2' }],
        },
        week.tracks,
        week.names,
      );

      // Day 2 is the middle 20 km of 35 km, and 10 km is halfway along it.
      expect(resolved.report.annotations[0].trackName).toBe('Day 2');
      expect(resolved.report.annotations[0].km).toBeCloseTo(10, 1);
      expect(resolved.textAnnotations[0].progress).toBeCloseTo((10 + 10) / 35, 2);
    });
  });

  it('treats alternatives as separate routes with their own distances', () => {
    const races = tracksFrom([
      { name: 'long.gpx', gpx: leg({ name: 'Long', startLat: 42, points: 201 }) },
      { name: 'short.gpx', gpx: leg({ name: 'Short', startLat: 42, points: 101 }) },
    ]);

    const resolved = resolveRecipe(
      {
        mode: 'alternatives',
        tracks: [{ file: 'long.gpx' }, { file: 'short.gpx' }],
        annotations: [
          { track: 'Long', km: 10, title: 'Long halfway' },
          { track: 'Short', km: 5, title: 'Short halfway' },
        ],
      },
      races.tracks,
      races.names,
    );

    // The active route still has to be in the journey, or nothing plays and
    // there is no elevation profile.
    expect(resolved.journeySegments).toHaveLength(1);
    expect((resolved.journeySegments[0] as { trackId: string }).trackId)
      .toBe(resolved.activeTrackId);
    expect(resolved.report.stitched).toBe(false);
    // Each is halfway along its own course, not along a combined one.
    expect(resolved.textAnnotations[0].progress).toBeCloseTo(0.5, 2);
    expect(resolved.textAnnotations[1].progress).toBeCloseTo(0.5, 2);
  });

  it('warns about pins the map would collapse into one', () => {
    const resolved = resolveRecipe(
      {
        landmarks: [
          { km: 5, title: 'Col' },
          { km: 5.05, title: 'Col again' },
        ],
      },
      single.tracks,
      single.names,
    );

    expect(resolved.report.warnings.some((w) => w.includes('80 m'))).toBe(true);
  });

  it('warns when two cards would be on screen at once', () => {
    const resolved = resolveRecipe(
      {
        totalDuration: 60_000,
        annotations: [
          { km: 5, title: 'First', displayDuration: 5000 },
          { km: 5.2, title: 'Second', displayDuration: 5000 },
        ],
      },
      single.tracks,
      single.names,
    );

    expect(resolved.report.warnings.some((w) => w.includes('overlap'))).toBe(true);
  });

  it('names the file it could not find', () => {
    expect(() => resolveRecipe(
      { tracks: [{ file: 'missing.gpx' }] },
      single.tracks,
      single.names,
    )).toThrow(/no dropped file named "missing.gpx"/);
  });

  it('collapses start and finish into one pin on a loop', () => {
    const loopGpx = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Loop</name><trkseg>
      <trkpt lat="42.000000" lon="2.000000"><ele>1000</ele></trkpt>
      <trkpt lat="42.010000" lon="2.000000"><ele>1100</ele></trkpt>
      <trkpt lat="42.000000" lon="2.000000"><ele>1000</ele></trkpt>
    </trkseg></trk></gpx>`;
    const loop = tracksFrom([{ name: 'loop.gpx', gpx: loopGpx }]);

    const resolved = resolveRecipe(
      { landmarks: [{ auto: 'start-finish', type: 'trailhead' }] },
      loop.tracks,
      loop.names,
    );

    expect(resolved.userLandmarks).toHaveLength(1);
    expect(resolved.userLandmarks[0].title).toBe('Start / Finish');
  });

  it('warns when a card is on a route that is not the one being played', () => {
    const races = tracksFrom([
      { name: 'long.gpx', gpx: leg({ name: 'Long', startLat: 42, points: 201 }) },
      { name: 'short.gpx', gpx: leg({ name: 'Short', startLat: 42, points: 101 }) },
    ]);

    const resolved = resolveRecipe(
      {
        mode: 'alternatives',
        tracks: [{ file: 'long.gpx' }, { file: 'short.gpx' }],
        // Anchored to the course that is not playing: its progress means
        // nothing in the active route's timeline, which is how an aid station
        // ends up seconds away from the place it names.
        annotations: [{ track: 'Short', km: 5, title: 'On the short course' }],
      },
      races.tracks,
      races.names,
    );

    expect(resolved.report.warnings.some((w) => w.includes('not the route being played')))
      .toBe(true);
  });

  it('does not warn about cards on courses that never play together', () => {
    const races = tracksFrom([
      { name: 'long.gpx', gpx: leg({ name: 'Long', startLat: 42, points: 201 }) },
      { name: 'short.gpx', gpx: leg({ name: 'Short', startLat: 42, points: 101 }) },
    ]);

    const resolved = resolveRecipe(
      {
        mode: 'alternatives',
        tracks: [{ file: 'long.gpx' }, { file: 'short.gpx' }],
        totalDuration: 60_000,
        // Adjacent in progress, but on different courses — only one ever plays.
        annotations: [
          { track: 'Long', km: 10, title: 'On the long course' },
          { track: 'Short', km: 5.1, title: 'On the short course' },
        ],
      },
      races.tracks,
      races.names,
    );

    expect(resolved.report.warnings.some((w) => w.includes('overlap'))).toBe(false);
  });

  // The promise of resolving in the app is that a recipe agrees with playback
  // exactly. Recorded pace advances by measurement point, not by distance, so a
  // distance ratio is only ever close — which is how a card ends up firing
  // seconds away from the place it names.
  it('gives every placement the progress the replay will actually use', () => {
    const week = tracksFrom([
      { name: 'a.gpx', gpx: leg({ name: 'A', startLat: 42, points: 101, start: '2026-05-01T08:00:00Z' }) },
      { name: 'b.gpx', gpx: leg({ name: 'B', startLat: 43, points: 201, start: '2026-05-02T08:00:00Z' }) },
    ]);

    const resolved = resolveRecipe(
      {
        tracks: { files: '*.gpx' },
        totalDuration: 60_000,
        annotations: [
          { track: 'A', km: 3, title: 'On A' },
          { track: 'B', km: 12, title: 'On B' },
        ],
      },
      week.tracks,
      week.names,
    );

    const journey = buildComputedJourney(resolved.journeySegments, resolved.tracks)!;
    for (const [index, card] of resolved.textAnnotations.entries()) {
      const leg = index === 0 ? 0 : 1;
      const km = index === 0 ? 3 : 12;
      const routeMeters = journey.segmentTimings[leg].startDistance + km * 1000;
      const app = progressForRouteDistance(
        journey.coordinates, journey.segmentTimings, routeMeters, 'recorded',
      )!;
      expect(card.progress).toBeCloseTo(app, 6);
    }
  });

  // Three courses of one race stitched into a journey visits Ribes de Freser
  // three times; a card can only mark one of those, so it fires while the
  // marker is on a different lap.
  it('warns when variants of one route are stitched as legs', () => {
    const loop = (name: string, points: number) => ({
      name: `${name}.gpx`,
      gpx: leg({ name, startLat: 42, points }),
    });
    const races = tracksFrom([loop('Long', 201), loop('Short', 101)]);

    const resolved = resolveRecipe(
      { mode: 'stitch', tracks: [{ file: 'Long.gpx' }, { file: 'Short.gpx' }] },
      races.tracks,
      races.names,
    );

    expect(resolved.report.warnings.some((w) => w.includes('variants of one route')))
      .toBe(true);
  });

  it('does not mistake consecutive days for variants', () => {
    const week = tracksFrom([
      { name: 'a.gpx', gpx: leg({ name: 'A', startLat: 42, points: 101 }) },
      { name: 'b.gpx', gpx: leg({ name: 'B', startLat: 43, points: 101 }) },
    ]);

    const resolved = resolveRecipe({ tracks: { files: '*.gpx' } }, week.tracks, week.names);

    expect(resolved.report.warnings.some((w) => w.includes('variants of one route')))
      .toBe(false);
  });

  // The catch-all. Whatever the cause — wrong route, wrong lap, mistimed — if
  // the marker is not near the place when its card appears, the replay is wrong
  // in the way people actually notice, and no other check has to name the cause.
  it('warns when the marker is nowhere near a card as it appears', () => {
    const races = tracksFrom([
      { name: 'north.gpx', gpx: leg({ name: 'North', startLat: 42, points: 101 }) },
      { name: 'south.gpx', gpx: leg({ name: 'South', startLat: 40, points: 101 }) },
    ]);

    const resolved = resolveRecipe(
      {
        mode: 'alternatives',
        activeTrack: 0,
        totalDuration: 60_000,
        tracks: [{ file: 'north.gpx' }, { file: 'south.gpx' }],
        annotations: [{ track: 'South', km: 5, title: 'Two hundred km away' }],
      },
      races.tracks,
      races.names,
    );

    const [card] = resolved.report.annotations;
    expect(card.markerOffMeters).toBeGreaterThan(100_000);
    expect(resolved.report.warnings.some((w) => w.includes('away from it then'))).toBe(true);
  });

  it('reports when each entry appears and leaves the marker beside it', () => {
    const single = tracksFrom([
      { name: 'race.gpx', gpx: leg({ name: 'Race', startLat: 42, points: 101 }) },
    ]);

    const resolved = resolveRecipe(
      {
        totalDuration: 60_000,
        annotations: [{ km: 5, title: 'Halfway', displayDuration: 4000 }],
      },
      single.tracks,
      single.names,
    );

    const [card] = resolved.report.annotations;
    expect(card.atSeconds).toBeCloseTo(30, 0);
    expect(card.onScreenFromSeconds).toBeCloseTo(26, 0);
    expect(card.markerOffMeters).toBeLessThan(50);
    expect(resolved.report.warnings).toEqual([]);
  });
});
