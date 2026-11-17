import { describe, expect, it } from 'vitest';
import type { GPXTrack, JourneySegment } from '@/types';
import { METERS_PER_PIXEL_AT_ZOOM_0 } from '@/utils/followBehindCamera';
import { buildTrackFromRawPoints } from '@/utils/gpx/trackStats';
import { getJourneyPointAtDistance } from '@/utils/journeyUtils';
import { compileStory, type CompiledStory, type StoryCompileInput } from '@/utils/story/compileStory';
import type { StoryBlock, StoryDocument, StoryLayout } from '@/utils/story/storyDocument';
import { journeyWithCameraHop, km, media, northbound, settings, story } from '@/utils/story/storyTestFixtures';
import { buildScrollTrack, scrollTopForPlace, storyFrameAt, type Box, type LngLat, type ScrollTrack, type TrackMeasure } from './storyFrame';

const dayOne = northbound('Day 1', 45, 6, 101);
const dayTwo = northbound('Day 2', 45, 7, 101);

const text = (id: string): StoryBlock => ({ id, kind: 'text', text: id });
const photo = (id: string): StoryBlock => ({ id, kind: 'media', media: { kind: 'picture', id } });
const dayOneEnd = km(dayOne.totalDistance, { segmentId: 'day-1', segmentMeters: dayOne.totalDistance });
const dayTwoStart = km(dayOne.totalDistance, { segmentId: 'day-2', segmentMeters: 0 });

const plain = story(
  ['start', km(0), [text('a'), text('b')]],
  ['day-1-end', dayOneEnd, [text('a'), text('b')]],
  ['day-2', dayTwoStart, [text('a'), text('b')]],
  ['lake', km(dayOne.totalDistance + 5_000), [text('a'), text('b')]],
);
const withPhotos = story(
  ['start', km(0), [text('a'), photo('north'), text('b'), text('c'), photo('south'), text('d')]],
  ['day-1-end', dayOneEnd, [text('a')]],
  ['day-2', dayTwoStart, [text('a'), text('b')]],
  ['lake', km(dayOne.totalDistance + 5_000), [text('a')]],
);
const photos = [media('north', { lat: 45.09, lon: 6 }), media('south', { lat: 45.005, lon: 6 })];

function compile(document: StoryDocument, options: {
  layout?: Partial<StoryLayout>; tracks?: GPXTrack[]; journeySegments?: JourneySegment[]; pictures?: StoryCompileInput['pictures'];
} = {}): CompiledStory {
  const input: StoryCompileInput = {
    document: { ...document, layout: { ...document.layout, zoom: 'near', ...options.layout } },
    tracks: options.tracks ?? [dayOne, dayTwo],
    journeySegments: options.journeySegments ?? journeyWithCameraHop(dayOne, dayTwo),
    textAnnotations: [],
    pictures: options.pictures ?? photos,
    videos: [],
    journeyName: 'Two days',
    settings,
  };
  return compileStory(input)!;
}

interface Layout {
  name: string; scroller: Box; map: Box;
  band: { top: number; bottom: number };
  coverTop: number; tail: number;
  column: { left: number; right: number };
}
const desktop = { top: 0, bottom: 800, left: 0, right: 1280 };
const phone = { top: 0, bottom: 844, left: 0, right: 390 };
const layouts: Layout[] = [
  { name: 'desktop, map right', scroller: desktop, map: { ...desktop, left: 640 }, band: { top: 0, bottom: 800 }, coverTop: 0, tail: 0, column: { left: 40, right: 600 } },
  { name: 'desktop, map left', scroller: desktop, map: { ...desktop, right: 640 }, band: { top: 0, bottom: 800 }, coverTop: 0, tail: 0, column: { left: 680, right: 1240 } },
  { name: 'phone, map top', scroller: phone, map: { ...phone, bottom: 380 }, band: { top: 380, bottom: 844 }, coverTop: 380, tail: 0, column: { left: 16, right: 374 } },
  { name: 'phone, map bottom', scroller: phone, map: { ...phone, top: 464 }, band: { top: 0, bottom: 464 }, coverTop: 0, tail: 380, column: { left: 16, right: 374 } },
];
const [desktopRight] = layouts;

const HEADING = 60;
const TEXT = 500;
const MEDIA = 240;
const FINISH = 200;

function measureFor(compiled: CompiledStory, layout: Layout, grow: Record<string, number> = {}): TrackMeasure {
  let y = layout.coverTop + layout.band.bottom - layout.band.top;
  const blocks: TrackMeasure['blocks'] = [];
  const media: TrackMeasure['media'] = [];
  const sections = compiled.sections.map((section) => {
    const headTop = y;
    y += HEADING;
    const headBottom = y;
    for (const block of section.blocks) {
      const height = (block.kind === 'text' ? TEXT : MEDIA) + (grow[block.key] ?? 0);
      blocks.push({ key: block.key, top: y, height, ...layout.column });
      if (block.kind === 'media') media.push({ key: block.key, top: y, height, ...layout.column });
      y += height;
    }
    return { headTop, headBottom };
  });
  const scrollerHeight = layout.scroller.bottom - layout.scroller.top;
  return {
    scroller: layout.scroller,
    map: layout.map,
    contentHeight: y + FINISH + 0.6 * scrollerHeight + layout.tail - layout.scroller.top,
    blocks,
    media,
    sections,
    finishTop: y,
  };
}

function scrollTops(track: ScrollTrack, step: number): number[] {
  return [...Array.from({ length: Math.floor(track.maxScroll / step) + 1 }, (_, index) => index * step), track.maxScroll];
}

const mercatorY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;

/** MapLibre's camera at its default fov, 0.6435 rad. */
function screenOffset(center: LngLat, point: LngLat, rise: number, zoom: number, pitch: number, map: Box) {
  const worldPx = 512 * 2 ** zoom;
  const pxPerMeter = worldPx / (2 * Math.PI * 6_371_008.8 * Math.cos(center[1] * Math.PI / 180));
  const offset = [(point[0] - center[0]) / 360 * worldPx, (mercatorY(center[1]) - mercatorY(point[1])) * worldPx, rise * pxPerMeter];
  const focal = (map.bottom - map.top) / 2 / Math.tan(0.6435011087932844 / 2);
  const tilt = pitch * Math.PI / 180;
  const eye = [0, -focal * Math.sin(tilt), focal * Math.cos(tilt)];
  const ray = offset.map((value, axis) => value - eye[axis]);
  const depth = ray[1] * Math.sin(tilt) - ray[2] * Math.cos(tilt);
  const up = ray[1] * Math.cos(tilt) + ray[2] * Math.sin(tilt);
  return depth > 0 ? { x: focal * ray[0] / depth, y: -focal * up / depth } : null;
}

function projectsInside(center: LngLat, point: LngLat, rise: number, zoom: number, pitch: number, map: Box): boolean {
  const offset = screenOffset(center, point, rise, zoom, pitch, map);
  const tolerance = 1e-6;
  return offset !== null
    && Math.abs(offset.x) <= (map.right - map.left) / 2 - 32 + tolerance
    && Math.abs(offset.y) <= (map.bottom - map.top) / 2 - 32 + tolerance;
}

const groundAt = ([, lat]: LngLat) => 100 + (lat - 45) * 10_000;

function showsAll(lngLats: LngLat[], zoom: number, map: Box): boolean {
  const worldPx = 512 * 2 ** zoom;
  const xs = lngLats.map(([lon]) => (lon + 180) / 360 * worldPx);
  const ys = lngLats.map(([, lat]) => mercatorY(lat) * worldPx);
  const tolerance = 1e-6;
  return Math.max(...xs) - Math.min(...xs) <= map.right - map.left - 64 + tolerance
    && Math.max(...ys) - Math.min(...ys) <= map.bottom - map.top - 64 + tolerance;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

describe('storyFrameAt', () => {
  it('is a pure function of the scroll position: any order, and scrolling back, give the same frame', () => {
    for (const view of ['2d', '3d'] as const) {
      for (const reducedMotion of [false, true]) {
        const compiled = compile(withPhotos, { layout: { view } });
        const track = buildScrollTrack(compiled, measureFor(compiled, desktopRight));
        const frameAt = (scrollTop: number) => storyFrameAt(compiled, track, scrollTop, reducedMotion);

        const ordered = Array.from({ length: 40 }, (_, index) => index * track.maxScroll / 39);
        const inOrder = new Map(ordered.map((scrollTop) => [scrollTop, frameAt(scrollTop)]));
        const shuffled = ordered.map((_, index) => ordered[(index * 17) % 40]);
        for (const scrollTop of shuffled) expect(frameAt(scrollTop)).toEqual(inOrder.get(scrollTop));

        const target = track.maxScroll * 0.37;
        const fresh = frameAt(target);
        for (let scrollTop = 0; scrollTop <= track.maxScroll; scrollTop += 25) frameAt(scrollTop);
        for (let scrollTop = track.maxScroll; scrollTop > target; scrollTop -= 25) frameAt(scrollTop);
        expect(frameAt(target)).toEqual(fresh);
      }
    }
  });

  it('rests on each section place while its heading crosses the line, from the start to the finish', () => {
    for (const layout of layouts) {
      for (const reducedMotion of [false, true]) {
        const compiled = compile(withPhotos);
        const measure = measureFor(compiled, layout);
        const track = buildScrollTrack(compiled, measure);
        const travelAt = (scrollTop: number) => storyFrameAt(compiled, track, scrollTop, reducedMotion).travel;

        expect(travelAt(0)).toBe(0);
        compiled.sections.forEach((section, index) => {
          const { headTop, headBottom } = measure.sections[index];
          for (const y of [headTop, (headTop + headBottom) / 2, headBottom]) {
            expect(travelAt(y - track.line), `${layout.name}, ${section.id} at ${y}`).toBe(section.travelMeters);
          }
        });
        expect(measure.finishTop).toBeLessThanOrEqual(track.maxScroll + track.line);
        expect(travelAt(track.maxScroll)).toBe(compiled.route.travel.totalDistance);
      }
    }
  });

  it('only moves forward, and with reduced motion only ever stops at a place', () => {
    for (const layout of layouts) {
      const compiled = compile(withPhotos);
      const track = buildScrollTrack(compiled, measureFor(compiled, layout));
      const stops = new Set([0, ...compiled.sections.map((section) => section.travelMeters), compiled.route.travel.totalDistance]);

      let previous = -Infinity;
      for (const scrollTop of scrollTops(track, 5)) {
        const { travel } = storyFrameAt(compiled, track, scrollTop, false);
        expect(travel).toBeGreaterThanOrEqual(previous);
        previous = travel;
        expect(stops.has(storyFrameAt(compiled, track, scrollTop, true).travel)).toBe(true);
      }
    }
  });

  it('keeps the head on the route, hidden only inside the camera connector', () => {
    const compiled = compile(withPhotos);
    const track = buildScrollTrack(compiled, measureFor(compiled, desktopRight));
    const connectorFrom = compiled.sections[1].travelMeters;
    const connectorTo = compiled.sections[2].travelMeters;
    expect(connectorTo).toBeGreaterThan(connectorFrom);

    const seen = { hidden: 0, visible: 0 };
    for (const scrollTop of scrollTops(track, 5)) {
      const { travel, head } = storyFrameAt(compiled, track, scrollTop, false);
      const onRoute = getJourneyPointAtDistance(compiled.route.travel, travel)!;
      expect(head.lngLat[0]).toBeCloseTo(onRoute.lon, 9);
      expect(head.lngLat[1]).toBeCloseTo(onRoute.lat, 9);
      expect(compiled.route.travel.cumulativeDistances[head.coordIndex]).toBeLessThanOrEqual(travel);

      const insideConnector = travel > connectorFrom && travel < connectorTo;
      expect(head.visible, `travel ${travel}`).toBe(!insideConnector);
      seen[head.visible ? 'visible' : 'hidden'] += 1;
    }
    expect(seen.hidden).toBeGreaterThan(0);
    expect(seen.visible).toBeGreaterThan(0);
  });

  it('centres the camera on the head, north-up, flat in 2D and tilted 55 degrees in 3D', () => {
    for (const [view, pitch] of [['2d', 0], ['3d', 55]] as const) {
      const compiled = compile(withPhotos, { layout: { view } });
      const track = buildScrollTrack(compiled, measureFor(compiled, desktopRight));
      for (const scrollTop of scrollTops(track, 50)) {
        const { camera, head } = storyFrameAt(compiled, track, scrollTop, false);
        expect(camera.center).toEqual(head.lngLat);
        expect(camera.pitch).toBe(pitch);
        expect(camera.bearing).toBe(0);
      }
    }
  });

  it('moves the zoom continuously across legs and settles on zNear at every stop', () => {
    for (const layout of layouts) {
      const compiled = compile(plain);
      const measure = measureFor(compiled, layout);
      const track = buildScrollTrack(compiled, measure);
      const zoomAt = (scrollTop: number, reducedMotion = false) => storyFrameAt(compiled, track, scrollTop, reducedMotion).camera.zoom;

      let previous = zoomAt(0);
      let widest = previous;
      let biggestJump = 0;
      for (let scrollTop = 1; scrollTop <= track.maxScroll; scrollTop += 1) {
        const zoom = zoomAt(scrollTop);
        biggestJump = Math.max(biggestJump, Math.abs(zoom - previous));
        widest = Math.min(widest, zoom);
        previous = zoom;
      }
      expect(biggestJump, layout.name).toBeLessThan(0.05);
      expect(widest, 'zooms out mid-leg').toBeLessThan(track.zNear - 1);

      expect(zoomAt(0)).toBeCloseTo(track.zNear, 10);
      for (const { headTop, headBottom } of measure.sections) {
        expect(zoomAt(headTop - track.line)).toBeCloseTo(track.zNear, 10);
        expect(zoomAt(headBottom - track.line)).toBeCloseTo(track.zNear, 10);
      }
      expect(zoomAt(track.maxScroll)).toBeCloseTo(track.zNear, 10);
      for (const scrollTop of scrollTops(track, 37)) expect(zoomAt(scrollTop, true)).toBe(track.zNear);
    }
  });

  it('puts the zoom setting span across the map box shorter side, whatever the route length', () => {
    const [short, long] = [northbound('Short', 44.975, 6, 51), northbound('Long', 44.9, 6, 201)].map((track) => {
      const compiled = compile(story(), { tracks: [track], journeySegments: [{ id: 'day', type: 'track', trackId: track.id, duration: 1 }] });
      return { compiled, track: buildScrollTrack(compiled, measureFor(compiled, desktopRight)) };
    });

    expect(short.track.zNear).toBeCloseTo(long.track.zNear, 9);
    const metersPerPx = METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos(Math.PI / 4) / 2 ** short.track.zNear;
    expect(640 * metersPerPx).toBeCloseTo(2_000, 6);
    for (const { compiled, track } of [short, long]) {
      expect(storyFrameAt(compiled, track, 0, false).camera.zoom).toBeCloseTo(track.zNear, 10);
    }
  });

  it('clamps the zoom to [routeFitZoom - 0.5, 18]', () => {
    for (const layout of layouts) {
      for (const view of ['2d', '3d'] as const) {
        const compiled = compile(withPhotos, { layout: { view } });
        const track = buildScrollTrack(compiled, measureFor(compiled, layout));
        for (const scrollTop of scrollTops(track, 11)) {
          const { zoom } = storyFrameAt(compiled, track, scrollTop, false).camera;
          expect(zoom).toBeGreaterThanOrEqual(track.routeFitZoom - 0.5);
          expect(zoom).toBeLessThanOrEqual(18);
        }
      }
    }

    const day = northbound('Short', 45, 6, 51);
    const small = compile(plain, { layout: { zoom: 'far' }, tracks: [day], journeySegments: [{ id: 'day-1', type: 'track', trackId: day.id, duration: 1 }] });
    const smallTrack = buildScrollTrack(small, measureFor(small, desktopRight));
    expect(smallTrack.zNear).toBeLessThan(smallTrack.routeFitZoom - 0.5);
    for (const scrollTop of scrollTops(smallTrack, 13)) {
      expect(storyFrameAt(small, smallTrack, scrollTop, false).camera.zoom).toBe(smallTrack.routeFitZoom - 0.5);
    }

    const huge = { top: 0, bottom: 20_000, left: 0, right: 40_000 };
    const hugeLayout: Layout = {
      name: 'huge', scroller: huge, map: { ...huge, left: 20_000 }, band: { top: 0, bottom: 20_000 }, coverTop: 0, tail: 0, column: { left: 0, right: 20_000 },
    };
    const compiled = compile(plain);
    const track = buildScrollTrack(compiled, measureFor(compiled, hugeLayout));
    expect(track.zNear).toBeGreaterThan(18);
    expect(storyFrameAt(compiled, track, 0, false).camera.zoom).toBe(18);

    const dot = northbound('Dot', 45, 6, 1);
    const single = compile(story(['here', km(0), [text('a')]]), { tracks: [dot], journeySegments: [{ id: 'dot', type: 'track', trackId: dot.id, duration: 1 }] });
    const singleTrack = buildScrollTrack(single, measureFor(single, desktopRight));
    expect(singleTrack.routeFitZoom).toBe(Infinity);
    for (const scrollTop of scrollTops(singleTrack, 17)) {
      expect(storyFrameAt(single, singleTrack, scrollTop, false).camera.zoom).toBe(18);
    }
  });

  it('shows the whole of each leg mid-way through it, fitted to that leg rather than the route', () => {
    for (const layout of layouts) {
      const compiled = compile(plain);
      const measure = measureFor(compiled, layout);
      const track = buildScrollTrack(compiled, measure);
      const { travel: profile } = compiled.route;
      const stops = [...compiled.sections.map((section) => section.travelMeters), profile.totalDistance];
      const legEnds = [...measure.sections.slice(1).map((section) => section.headTop), measure.finishTop];

      measure.sections.forEach(({ headBottom }, index) => {
        const [from, to] = [stops[index], stops[index + 1]];
        const frame = storyFrameAt(compiled, track, (headBottom + legEnds[index]) / 2 - track.line, false);
        expect(frame.travel).toBeCloseTo((from + to) / 2, 6);

        const leg = [from, to].map((at) => getJourneyPointAtDistance(profile, at)!);
        const points: LngLat[] = [
          ...leg.map((point): LngLat => [point.lon, point.lat]),
          ...profile.coordinates.filter((_, at) => profile.cumulativeDistances[at] > from && profile.cumulativeDistances[at] < to)
            .map((point): LngLat => [point.lon, point.lat]),
        ];
        const { zoom } = frame.camera;
        expect(zoom, `${layout.name}, leg ${index}`).toBeLessThan(track.zNear);
        expect(showsAll(points, zoom, layout.map), `${layout.name}, leg ${index}`).toBe(true);
        expect(showsAll(points, zoom + 0.01, layout.map), `${layout.name}, leg ${index} is tight`).toBe(false);
      });
    }
  });

  it('keeps a finite zoom when the map box is narrower than its padding', () => {
    const compiled = compile(withPhotos);
    const track = buildScrollTrack(compiled, measureFor(compiled, { ...desktopRight, map: { ...desktop, left: 1_230 } }));
    for (const scrollTop of scrollTops(track, 23)) {
      expect(Number.isFinite(storyFrameAt(compiled, track, scrollTop, false).camera.zoom)).toBe(true);
    }
  });

  it('eases a far media point into frame as the photo nears the line, and cuts to it with reduced motion', () => {
    for (const view of ['2d', '3d'] as const) {
      const compiled = compile(withPhotos, { layout: { view } });
      const track = buildScrollTrack(compiled, measureFor(compiled, desktopRight));
      const north = track.media.findIndex((item) => item.key === 'section-0-1');
      const withNorthAt = (offset: number | null): ScrollTrack => ({
        ...track,
        media: track.media.map((item, index) => {
          if (index !== north || offset === null) return { ...item, point: null };
          const centre = track.line + offset * track.band.height;
          return { ...item, top: centre - MEDIA / 2, bottom: centre + MEDIA / 2 };
        }),
      });
      const frameWith = (offset: number | null, reducedMotion = false) => storyFrameAt(compiled, withNorthAt(offset), 0, reducedMotion);

      const unframed = frameWith(null).camera.zoom;
      const framed = frameWith(0).camera.zoom;
      expect(unframed - framed, view).toBeGreaterThan(1);
      for (const offset of [0.32, 0.36, 0.4, 0.45, 0.5, 0.55, 0.6]) {
        const frame = frameWith(offset);
        const weight = smoothstep(0, 0.5, frame.media[north].strength);
        expect(frame.camera.zoom, `${view}, ${offset}`).toBeCloseTo(unframed - weight * (unframed - framed), 9);
      }
      expect(frameWith(0.45, true).media[north].strength).toBeLessThan(0.5);
      expect(frameWith(0.45, true).camera.zoom, view).toBe(track.zNear);
      expect(frameWith(0.25, true).media[north].strength).toBeGreaterThanOrEqual(0.5);
      expect(frameWith(0.25, true).camera.zoom, view).toBeCloseTo(framed, 9);
      expect(frameWith(0, true).camera.zoom, view).toBeCloseTo(framed, 9);
    }
  });

  it('moves the zoom continuously while photos with far points pass the line', () => {
    for (const layout of layouts) {
      for (const view of ['2d', '3d'] as const) {
        const compiled = compile(withPhotos, { layout: { view } });
        const track = buildScrollTrack(compiled, measureFor(compiled, layout));
        let previous = storyFrameAt(compiled, track, 0, false).camera.zoom;
        for (let scrollTop = 1; scrollTop <= track.maxScroll; scrollTop += 1) {
          const { zoom } = storyFrameAt(compiled, track, scrollTop, false).camera;
          expect(Math.abs(zoom - previous), `${layout.name}, ${view} at ${scrollTop}`).toBeLessThan(0.05);
          previous = zoom;
        }
      }
    }
  });

  it('reports the section whose heading is at or above the line, and -1 on the cover', () => {
    for (const layout of layouts) {
      const compiled = compile(withPhotos);
      const measure = measureFor(compiled, layout);
      const track = buildScrollTrack(compiled, measure);
      const sectionAt = (y: number) => storyFrameAt(compiled, track, y - track.line, false).section;

      expect(storyFrameAt(compiled, track, 0, false).section).toBe(-1);
      expect(sectionAt(measure.sections[0].headTop - 1)).toBe(-1);
      measure.sections.forEach(({ headTop }, index) => {
        const next = measure.sections[index + 1]?.headTop ?? measure.finishTop;
        expect(sectionAt(headTop), layout.name).toBe(index);
        expect(sectionAt(next - 1), layout.name).toBe(index);
      });
    }
  });

  it('treats an overscrolled position as the nearest end', () => {
    const compiled = compile(withPhotos);
    const track = buildScrollTrack(compiled, measureFor(compiled, desktopRight));
    for (const reducedMotion of [false, true]) {
      const frameAt = (scrollTop: number) => storyFrameAt(compiled, track, scrollTop, reducedMotion);
      expect(frameAt(-120)).toEqual(frameAt(0));
      expect(frameAt(-120).scrollTop).toBe(0);
      expect(frameAt(track.maxScroll + 500)).toEqual(frameAt(track.maxScroll));
      expect(frameAt(track.maxScroll + 500).scrollTop).toBe(track.maxScroll);
    }
  });

  it('keeps travel rising and resting on stops when measured heading edges come back out of order', () => {
    const compiled = compile(withPhotos);
    const measure = measureFor(compiled, desktopRight);
    const [first, second, ...rest] = measure.sections;
    const skewed: TrackMeasure = {
      ...measure,
      sections: [first, { headTop: second.headTop, headBottom: second.headTop - 0.5 }, { ...rest[0], headTop: second.headTop - 3 }, ...rest.slice(1)],
    };
    const track = buildScrollTrack(compiled, skewed);
    const stops = new Set([0, ...compiled.sections.map((section) => section.travelMeters), compiled.route.travel.totalDistance]);

    let previous = -Infinity;
    for (let scrollTop = 0; scrollTop <= track.maxScroll; scrollTop += 0.5) {
      const { travel } = storyFrameAt(compiled, track, scrollTop, false);
      expect(travel, `at ${scrollTop}`).toBeGreaterThanOrEqual(previous);
      previous = travel;
      expect(stops.has(storyFrameAt(compiled, track, scrollTop, true).travel)).toBe(true);
    }
  });

  it('zooms out until a media point far from the head is in frame, in 2D and 3D', () => {
    for (const layout of layouts) {
      for (const view of ['2d', '3d'] as const) {
        const compiled = compile(withPhotos, { layout: { view } });
        const measure = measureFor(compiled, layout);
        const track = buildScrollTrack(compiled, measure);
        for (const key of ['section-0-1', 'section-0-4']) {
          const block = measure.blocks.find((candidate) => candidate.key === key)!;
          const index = track.media.findIndex((item) => item.key === key);
          const frame = storyFrameAt(compiled, track, block.top + block.height / 2 - track.line, false);
          const { center, zoom, pitch } = frame.camera;
          const point = track.media[index].point!;

          const rise = pitch ? (groundAt(point) - groundAt(center)) * compiled.look.terrainExaggeration : 0;

          expect(frame.media[index].strength).toBeCloseTo(1, 9);
          expect(projectsInside(center, point, rise, zoom, pitch, layout.map), `${layout.name}, ${view}, ${key}`).toBe(true);
          expect(projectsInside(center, point, rise, zoom + 0.05, pitch, layout.map)).toBe(false);
        }
      }
    }
  });

  it('gives media full strength at the line and none 0.6 band heights away, and reports band overlap', () => {
    for (const layout of layouts) {
      const compiled = compile(withPhotos);
      const measure = measureFor(compiled, layout);
      const track = buildScrollTrack(compiled, measure);
      const block = measure.blocks.find((candidate) => candidate.key === 'section-0-1')!;
      const index = track.media.findIndex((item) => item.key === block.key);
      const bandHeight = layout.band.bottom - layout.band.top;
      const centred = block.top + block.height / 2 - track.line;
      const strengthAt = (scrollTop: number) => storyFrameAt(compiled, track, scrollTop, false).media[index].strength;

      expect(strengthAt(centred)).toBeCloseTo(1, 9);
      expect(strengthAt(centred + 0.3 * bandHeight)).toBeCloseTo(0.5, 9);
      expect(strengthAt(centred + 0.6 * bandHeight)).toBeCloseTo(0, 9);
      expect(strengthAt(centred - 0.6 * bandHeight)).toBeCloseTo(0, 9);

      const seen = new Set<boolean>();
      for (const scrollTop of scrollTops(track, 7)) {
        const viewTop = block.top - scrollTop;
        const overlaps = viewTop < layout.band.bottom && viewTop + block.height > layout.band.top;
        expect(storyFrameAt(compiled, track, scrollTop, false).media[index].inBand, `${layout.name} at ${scrollTop}`).toBe(overlaps);
        seen.add(overlaps);
      }
      expect(seen.size).toBe(2);
    }
  });
});

describe('a route across 180 degrees', () => {
  const wrap = (lon: number) => ((lon + 540) % 360) - 180;
  const crossing = buildTrackFromRawPoints({
    idPrefix: 'track',
    name: 'Taveuni',
    rawPoints: Array.from({ length: 21 }, (_, index) => ({
      lat: -17, lon: wrap(179.95 + index * 0.005), elevation: 0, time: null, heartRate: null, cadence: null, power: null, temperature: null,
    })),
  });
  const compiled = compile(
    story(['start', km(0), [photo('east'), text('a'), text('b')]], ['end', km(crossing.totalDistance), [text('a')]]),
    {
      tracks: [crossing],
      journeySegments: [{ id: 'day', type: 'track', trackId: crossing.id, duration: 1 }],
      pictures: [media('east', { lat: -17, lon: -179.99 })],
    },
  );
  const measure = measureFor(compiled, desktopRight);
  const track = buildScrollTrack(compiled, measure);

  it('fits the route and every leg locally, not the whole world', () => {
    const [[west, south], [east, north]] = compiled.route.bounds;
    expect([south, north]).toEqual([-17, -17]);
    expect(west).toBeCloseTo(179.95, 9);
    expect(east).toBeCloseTo(180.05, 9);
    expect(track.routeFitZoom).toBeGreaterThan(11);
    for (const leg of track.legs) expect(leg.fitZoom).toBeGreaterThan(11);
    for (const scrollTop of scrollTops(track, 9)) {
      expect(storyFrameAt(compiled, track, scrollTop, false).camera.zoom, `at ${scrollTop}`).toBeGreaterThan(11);
    }
  });

  it('keeps the head on the route as it crosses, never on the far side of the world', () => {
    let crossed = false;
    for (const scrollTop of scrollTops(track, 3)) {
      const { head, camera } = storyFrameAt(compiled, track, scrollTop, false);
      expect(camera.center).toEqual(head.lngLat);
      expect(Math.abs(wrap(head.lngLat[0] - 180)), `at ${scrollTop}`).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(head.lngLat[0]).toBeGreaterThanOrEqual(-180);
      expect(head.lngLat[0]).toBeLessThan(180);
      crossed ||= head.lngLat[0] < 0;
    }
    expect(crossed).toBe(true);
  });

  it('frames a photo on the other side of 180 degrees from the head', () => {
    const block = measure.blocks.find((candidate) => candidate.key === 'section-0-0')!;
    const index = track.media.findIndex((item) => item.key === block.key);
    const frame = storyFrameAt(compiled, track, block.top + block.height / 2 - track.line, false);
    const { center, zoom } = frame.camera;
    const point = track.media[index].point!;
    expect(Math.sign(center[0])).not.toBe(Math.sign(point[0]));
    const across: LngLat = [center[0] + wrap(point[0] - center[0]), point[1]];
    expect(zoom).toBeGreaterThan(track.routeFitZoom - 0.5);
    expect(zoom).toBeLessThan(track.zNear - 1);
    expect(projectsInside(center, across, 0, zoom, 0, desktopRight.map)).toBe(true);
    expect(projectsInside(center, across, 0, zoom + 0.05, 0, desktopRight.map)).toBe(false);
  });
});

describe('3D framing over terrain', () => {
  it('counts the height of a media point over the head, so a point far below still lands inside the inset', () => {
    const phoneBottom = layouts[3];
    const compiled = compile(withPhotos, { layout: { view: '3d' } });
    const flat: CompiledStory = {
      ...compiled,
      sections: compiled.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => (block.kind === 'media' ? { ...block, media: { ...block.media, elevation: null } } : block)),
      })),
    };
    const measure = measureFor(compiled, phoneBottom);
    const block = measure.blocks.find((candidate) => candidate.key === 'section-0-4')!;
    const scrollTop = block.top + block.height / 2 - phoneBottom.band.bottom / 2;
    const at = (story: CompiledStory) => storyFrameAt(story, buildScrollTrack(story, measure), scrollTop, false).camera;

    const { center, zoom } = at(compiled);
    const point = buildScrollTrack(compiled, measure).media.find((item) => item.key === block.key)!.point!;
    const rise = (groundAt(point) - groundAt(center)) * compiled.look.terrainExaggeration;
    expect(rise).toBeLessThan(-500);
    expect(projectsInside(center, point, rise, zoom, 55, phoneBottom.map)).toBe(true);
    expect(projectsInside(center, point, rise, at(flat).zoom, 55, phoneBottom.map)).toBe(false);
  });
});

describe('scrollTopForPlace', () => {
  it('puts the reading place back on the line after blocks above it grow', () => {
    for (const layout of layouts) {
      const compiled = compile(withPhotos);
      const measure = measureFor(compiled, layout);
      const track = buildScrollTrack(compiled, measure);
      const block = measure.blocks.find((candidate) => candidate.key === 'section-2-0')!;
      const scrollTop = block.top + 0.4 * block.height - track.line;
      const { place } = storyFrameAt(compiled, track, scrollTop, false);
      expect(place.key).toBe('section-2-0');
      expect(place.fraction).toBeCloseTo(0.4, 9);

      const grown = buildScrollTrack(compiled, measureFor(compiled, layout, { 'section-0-1': 180, 'section-1-0': 75 }));
      const restored = scrollTopForPlace(grown, place);
      expect(Math.abs(restored - (scrollTop + 255)), layout.name).toBeLessThanOrEqual(1);
      expect(storyFrameAt(compiled, grown, restored, false).place.key).toBe('section-2-0');
    }
  });

  it('reads the cover as the first block with a negative fraction, and restores it to the top', () => {
    for (const layout of layouts) {
      const compiled = compile(withPhotos);
      const measure = measureFor(compiled, layout);
      const track = buildScrollTrack(compiled, measure);
      const { place } = storyFrameAt(compiled, track, 0, false);
      expect(place.key).toBe(measure.blocks[0].key);
      expect(place.fraction).toBeLessThan(0);
      expect(scrollTopForPlace(track, place)).toBeCloseTo(0, 9);
    }
  });

  it('goes to the top for a place that is gone', () => {
    const compiled = compile(withPhotos);
    const track = buildScrollTrack(compiled, measureFor(compiled, desktopRight));
    expect(scrollTopForPlace(track, { key: 'deleted/block', fraction: 0.5 })).toBe(0);
  });
});
