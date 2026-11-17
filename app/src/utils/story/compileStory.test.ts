import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '@/types';
import { buildTrackFromRawPoints } from '@/utils/gpx/trackStats';
import { calculateDistance } from '@/utils/journeyUtils';
import { compileStory, resolveRoutePlace, routeAt, type StoryCompileInput } from './compileStory';
import { createDefaultStory, type StoryDocument } from './storyDocument';
import { journeyWithCameraHop, km, media, northbound, settings, story } from './storyTestFixtures';

const dayOne = northbound('Day 1', 45, 6);
const dayTwo = northbound('Day 2', 45, 7);
const tracks = [dayOne, dayTwo];
const segments = journeyWithCameraHop(dayOne, dayTwo);
const routeTotal = dayOne.totalDistance + dayTwo.totalDistance;
const connectorTravel = 0.1 * routeTotal;

function inputFor(document: StoryDocument, overrides: Partial<StoryCompileInput> = {}): StoryCompileInput {
  return {
    document, tracks, journeySegments: segments, textAnnotations: [], pictures: [], videos: [], journeyName: 'Two days', settings,
    ...overrides,
  };
}

const note = (overrides: Partial<TextAnnotation>): TextAnnotation => ({
  id: 'note', progress: 0, lat: 45, lon: 6, title: 'Note', color: '#000000', displayDuration: 3, ...overrides,
});

describe('compileStory', () => {
  it('is null without a route', () => {
    expect(compileStory(inputFor(createDefaultStory(), { journeySegments: [] }))).toBeNull();
    expect(compileStory(inputFor(createDefaultStory(), {
      journeySegments: [{ id: 'gone', type: 'track', trackId: 'deleted-track', duration: 1 }],
    }))).toBeNull();
  });

  it('counts a camera connector as its straight line, capped at 10% of the route, on the travel scale only', () => {
    const far = compileStory(inputFor(createDefaultStory()))!;
    const farLine = calculateDistance(dayOne.points.at(-1)!.lat, 6, 45, 7) * 1000;
    expect(far.route.route.totalDistance).toBeCloseTo(routeTotal, 6);
    expect(far.route.travel.totalDistance - routeTotal).toBeCloseTo(Math.min(farLine, connectorTravel), 6);

    const nearby = northbound('Day 2 nearby', dayOne.points.at(-1)!.lat, 6.001);
    const near = compileStory(inputFor(createDefaultStory(), {
      tracks: [dayOne, nearby],
      journeySegments: journeyWithCameraHop(dayOne, nearby),
    }))!;
    const nearLine = calculateDistance(nearby.points[0].lat, 6, nearby.points[0].lat, 6.001) * 1000;
    expect(nearLine).toBeLessThan(connectorTravel);
    expect(near.route.travel.totalDistance - near.route.route.totalDistance).toBeCloseTo(Math.min(nearLine, connectorTravel), 6);
  });

  it('places sections on the profile scale for labels and the travel scale for the head', () => {
    const local = dayTwo.points[3].distance;
    const compiled = compileStory(inputFor(
      story(
        ['start', km(500)],
        ['day-two', km(dayOne.totalDistance, { segmentId: 'day-2', segmentMeters: 0 })],
        ['lake', { ref: { kind: 'annotation', id: 'lake' }, place: { routeMeters: 0 } }],
      ),
      { textAnnotations: [note({ id: 'lake', routeDistance: dayOne.totalDistance + local })] },
    ))!;

    const [start, dayTwoStart, lake] = compiled.sections;
    expect(start.routeMeters).toBeCloseTo(500, 6);
    expect(start.travelMeters).toBeCloseTo(500, 6);
    expect(dayTwoStart.routeMeters).toBeCloseTo(dayOne.totalDistance, 6);
    expect(dayTwoStart.travelMeters).toBeCloseTo(dayOne.totalDistance + connectorTravel, 6);
    expect(lake.routeMeters).toBeCloseTo(dayOne.totalDistance + local, 6);
    expect(lake.travelMeters).toBeCloseTo(dayOne.totalDistance + connectorTravel + local, 6);
    expect(compiled.issues).toEqual([]);

    for (const section of compiled.sections) expect(section.legMeters).toBeGreaterThanOrEqual(0);
    const legs = compiled.sections.reduce((sum, section) => sum + section.legMeters, 0);
    expect(legs).toBeCloseTo(compiled.route.travel.totalDistance - start.travelMeters, 6);
  });

  it('holds the head at a section that goes back along the route and reports it', () => {
    const compiled = compileStory(inputFor(story(['late', km(900)], ['early', km(300)], ['end', km(1000)])))!;
    const [late, early, end] = compiled.sections;

    expect(early.routeMeters).toBeCloseTo(300, 6);
    expect(early.travelMeters).toBe(late.travelMeters);
    expect(early.legMeters).toBeCloseTo(100, 6);
    expect(end.travelMeters).toBeCloseTo(1000, 6);
    expect(compiled.issues).toEqual([{ sectionId: 'early', kind: 'out-of-route-order' }]);
  });

  it('falls back to the captured place when the referenced item or segment is gone', () => {
    const compiled = compileStory(inputFor(story(
      ['deleted-photo', { ref: { kind: 'picture', id: 'deleted' }, place: { routeMeters: 200 } }],
      ['deleted-note', { ref: { kind: 'annotation', id: 'deleted' }, place: { routeMeters: 300 } }],
      ['removed-day', km(400, { segmentId: 'removed-day', segmentMeters: 50 })],
      ['moved-day', km(10, { segmentId: 'day-2', segmentMeters: 100 })],
    )))!;

    expect(compiled.sections.map((s) => s.routeMeters)).toEqual([200, 300, 400, dayOne.totalDistance + 100]);
    expect(compiled.issues).toEqual([
      { sectionId: 'deleted-photo', kind: 'anchor-missing' },
      { sectionId: 'deleted-note', kind: 'anchor-missing' },
      { sectionId: 'removed-day', kind: 'anchor-segment-missing' },
    ]);
  });

  it('compiles media to a source and a map point, and reports what it cannot show', () => {
    const anchored = dayTwo.points[3];
    const compiled = compileStory(inputFor(
      story(['s', km(0), [
        { id: 'text', kind: 'text', text: 'First line\nsame paragraph.\n\n  \n\nSecond.  ' },
        { id: 'gps', kind: 'media', media: { kind: 'picture', id: 'gps' } },
        { id: 'placeholder', kind: 'media', media: { kind: 'picture', id: 'placeholder' } },
        { id: 'anchored', kind: 'media', media: { kind: 'video', id: 'anchored' } },
        { id: 'lost', kind: 'media', media: { kind: 'picture', id: 'lost' } },
        { id: 'deleted', kind: 'media', media: { kind: 'video', id: 'deleted' } },
      ]]),
      {
        pictures: [
          media('gps', { lat: 45.005, lon: 6, title: 'Summit', originalFileName: 'IMG_1.jpg' }),
          media('placeholder', { url: '', isPlaceholder: true, lat: 45.002, lon: 6, originalFileName: 'IMG_2.jpg' }),
          media('lost'),
        ],
        videos: [media('anchored', { routeSegmentId: 'day-2', routeSegmentDistance: anchored.distance })],
      },
    ))!;

    expect(compiled.sections[0].blocks).toEqual([
      { kind: 'text', key: 'section-0-0', paragraphs: ['First line\nsame paragraph.', 'Second.'] },
      { kind: 'media', key: 'section-0-1', media: { kind: 'picture', fileName: 'IMG_1.jpg', caption: 'Summit', src: 'blob:gps', point: [6, 45.005], elevation: 150 } },
      { kind: 'media', key: 'section-0-2', media: { kind: 'picture', fileName: 'IMG_2.jpg', caption: '', src: null, point: [6, 45.002], elevation: 120 } },
      { kind: 'media', key: 'section-0-3', media: { kind: 'video', fileName: '', caption: '', src: 'blob:anchored', point: [anchored.lon, anchored.lat], elevation: 130 } },
      { kind: 'media', key: 'section-0-4', media: { kind: 'picture', fileName: '', caption: '', src: 'blob:lost', point: null, elevation: null } },
    ]);
    expect(compiled.issues).toEqual([
      { sectionId: 's', blockId: 'placeholder', kind: 'media-placeholder' },
      { sectionId: 's', blockId: 'lost', kind: 'media-unplaced' },
      { sectionId: 's', blockId: 'deleted', kind: 'media-missing' },
    ]);
  });

  it('keys every section and block by position, so no id a file can carry makes two keys alike', () => {
    const blocks = (...ids: string[]) => ids.map((id) => ({ id, kind: 'text' as const, text: id }));
    const document = { ...createDefaultStory(), sections: [
      { id: 'cover', anchor: km(0), heading: 'c', blocks: blocks('finish') },
      { id: 'finish', anchor: km(100), heading: 'f', blocks: blocks('cover', 'cover') },
      { id: 'a/b', anchor: km(200), heading: 'ab', blocks: blocks('c') },
      { id: 'a', anchor: km(300), heading: 'a', blocks: blocks('b/c') },
      { id: 'a', anchor: km(400), heading: 'a again', blocks: blocks('b/c') },
    ] };
    const compiled = compileStory(inputFor(document))!;
    const keys = ['cover', ...compiled.sections.flatMap((section) => [section.key, ...section.blocks.map((block) => block.key)]), 'finish'];
    expect(new Set(keys).size).toBe(keys.length);
    expect(compiled.sections.map((section) => section.key)).toEqual(['section-0', 'section-1', 'section-2', 'section-3', 'section-4']);
    expect(compiled.sections[1].blocks.map((block) => block.key)).toEqual(['section-1-0', 'section-1-1']);
  });

  it('heads a section with a blank heading by its anchored note title or media caption', () => {
    const compiled = compileStory(inputFor(
      { ...createDefaultStory(), sections: [
        { id: 'note', anchor: { ref: { kind: 'annotation', id: 'col' }, place: { routeMeters: 0 } }, heading: '', blocks: [] },
        { id: 'photo', anchor: { ref: { kind: 'picture', id: 'lake' }, place: { routeMeters: 0 } }, heading: '  ', blocks: [] },
        { id: 'clip', anchor: { ref: { kind: 'video', id: 'descent' }, place: { routeMeters: 0 } }, heading: '', blocks: [] },
        { id: 'gone', anchor: { ref: { kind: 'picture', id: 'deleted' }, place: { routeMeters: 0 } }, heading: '', blocks: [] },
        { id: 'typed', anchor: km(0), heading: '', blocks: [] },
        { id: 'named', anchor: { ref: { kind: 'picture', id: 'lake' }, place: { routeMeters: 0 } }, heading: 'Our own', blocks: [] },
      ] },
      {
        textAnnotations: [note({ id: 'col', title: ' Col de Sau ', routeDistance: 0 })],
        pictures: [media('lake', { lat: 45, lon: 6, title: 'The lake' })],
        videos: [media('descent', { lat: 45, lon: 6, title: 'Down the scree' })],
      },
    ))!;
    expect(compiled.sections.map((section) => section.heading)).toEqual(['Col de Sau', 'The lake', 'Down the scree', '', '', 'Our own']);
  });

  it('gives transport points the ground of the tracks around them, not the 0 they are recorded with', () => {
    const byCar = journeyWithCameraHop(dayOne, dayTwo).map((segment) => (
      segment.type === 'transport' ? { ...segment, mode: 'car' as const } : segment
    ));
    const { route } = compileStory(inputFor(createDefaultStory(), { journeySegments: byCar }))!;
    const car = route.coordinates.flatMap((point, index) => (point.segmentType === 'transport' ? [index] : []));
    expect(car.length).toBeGreaterThan(2);
    expect(car.map((index) => route.coordinates[index].elevation).every((elevation) => elevation === 0)).toBe(true);

    const heights = car.map((index) => route.heights[index]);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(100);
      expect(height).toBeLessThanOrEqual(200);
    }
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
    route.coordinates.forEach((point, index) => {
      if (point.segmentType === 'track') expect(route.heights[index]).toBe(point.elevation);
    });
    const middle = (route.travel.cumulativeDistances[car[0]] + route.travel.cumulativeDistances[car.at(-1)!]) / 2;
    expect(routeAt(route, middle).elevation).toBeCloseTo(150, 0);
  });

  it('gives a track recorded without heights the ground of the tracks around it, so its photos do not sit at 0 m', () => {
    const flat = buildTrackFromRawPoints({
      idPrefix: 'track',
      name: 'Planned day',
      rawPoints: dayTwo.points.map(({ lat, lon }) => ({
        lat, lon, elevation: 0, time: null, heartRate: null, cadence: null, power: null, temperature: null,
      })),
    });
    const document = story(['day two', km(routeTotal - 300), [{ id: 'shot', kind: 'media', media: { kind: 'picture', id: 'shot' } }]]);
    const compiled = compileStory(inputFor(document, {
      tracks: [dayOne, flat],
      journeySegments: journeyWithCameraHop(dayOne, flat),
      pictures: [media('shot', { lat: flat.points[6].lat, lon: flat.points[6].lon })],
    }))!;
    const { route } = compiled;
    route.coordinates.forEach((point, index) => {
      if (point.trackId === flat.id) expect(route.heights[index]).toBe(200);
    });
    expect(compiled.sections[0].blocks[0]).toMatchObject({ kind: 'media', media: { elevation: 200 } });
  });

  it('places media anchored at the start of a day after a camera connector on that day, not at the end of the day before', () => {
    const start = dayTwo.points[0];
    const compiled = compileStory(inputFor(
      story(['s', km(0), [{ id: 'day-start', kind: 'media', media: { kind: 'video', id: 'day-start' } }]]),
      { videos: [media('day-start', { routeSegmentId: 'day-2', routeSegmentDistance: 0 })] },
    ))!;

    const block = compiled.sections[0].blocks[0];
    expect(block.kind === 'media' && block.media.point).toEqual([start.lon, start.lat]);
  });

  it('falls back to the journey name and clamps the terrain exaggeration', () => {
    const compiled = compileStory(inputFor({ ...createDefaultStory(), intro: 'Day one.\n\nDay two.' }))!;
    expect(compiled.title).toBe('Two days');
    expect(compiled.intro).toEqual(['Day one.', 'Day two.']);
    expect(compiled.look).toEqual({ mapStyle: 'topo', waybackItemURL: null, terrainExaggeration: 3, trailColor: '#C1652F' });
    expect(compiled.stats.distanceMeters).toBeCloseTo(routeTotal, 6);
  });
});

describe('resolveRoutePlace', () => {
  const input = inputFor(createDefaultStory());

  it('gives a typed km the segment that holds it, clamped to the route', () => {
    expect(resolveRoutePlace(input, { routeMeters: 500 })).toEqual({ routeMeters: 500, segmentId: 'day-1', segmentMeters: 500 });
    const end = resolveRoutePlace(input, { routeMeters: 1e9 })!;
    expect(end.routeMeters).toBeCloseTo(routeTotal, 6);
    expect(end.segmentId).toBe('day-2');
  });

  it('rejects a stale fallback more than 250 m from the item lat/lon', () => {
    const onDayTwo = dayTwo.points[3];
    const stale = media('stale', { routeSegmentId: 'removed-day', routeDistance: 200, lat: onDayTwo.lat, lon: onDayTwo.lon });
    const projected = resolveRoutePlace(inputFor(createDefaultStory(), { pictures: [stale] }), { kind: 'picture', id: 'stale' })!;
    expect(projected.segmentId).toBe('day-2');
    expect(projected.routeMeters).toBeCloseTo(dayOne.totalDistance + onDayTwo.distance, 3);

    const close = media('close', { routeDistance: dayOne.totalDistance + onDayTwo.distance, lat: dayTwo.points[4].lat, lon: onDayTwo.lon });
    expect(resolveRoutePlace(inputFor(createDefaultStory(), { pictures: [close] }), { kind: 'picture', id: 'close' })?.routeMeters)
      .toBeCloseTo(dayOne.totalDistance + onDayTwo.distance, 6);

    const offRoute = media('off-route', { routeDistance: 200, lat: 46, lon: 8 });
    expect(resolveRoutePlace(inputFor(createDefaultStory(), { pictures: [offRoute] }), { kind: 'picture', id: 'off-route' })).toBeNull();
  });

  it('is null for an item that is gone', () => {
    expect(resolveRoutePlace(input, { kind: 'video', id: 'missing' })).toBeNull();
    expect(resolveRoutePlace(input, { kind: 'annotation', id: 'missing' })).toBeNull();
  });
});
