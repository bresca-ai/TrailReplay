import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileStory } from '@/utils/story/compileStory';
import type { StoryBlock } from '@/utils/story/storyDocument';
import { km, media, northbound, settings, story } from '@/utils/story/storyTestFixtures';
import { buildScrollTrack, storyFrameAt, type Box, type LngLat } from './storyFrame';
import { WEDGE_COLOR, WEDGE_MAX_ALPHA, WEDGE_VEIL_ALPHA, wedgeGeometry, wedgesFor, type Wedge } from './storyWedge';

const desktop = {
  map: { top: 0, bottom: 800, left: 640, right: 1280 },
  band: { top: 0, height: 800 },
  photo: { top: 200, bottom: 440, left: 40, right: 600 },
};
const phoneTop = { map: { top: 0, bottom: 380, left: 0, right: 390 }, band: { top: 380, height: 464 } };
const phoneBottom = { map: { top: 464, bottom: 844, left: 0, right: 390 }, band: { top: 0, height: 464 } };
const at = (x: number, y: number, occluded = false) => ({ x, y, occluded });

const rightOfText = (point = at(960, 400), strength = 1) => wedgeGeometry({
  key: 'photo', media: desktop.photo, band: desktop.band, map: desktop.map, side: 'right', point, strength,
});

describe('wedgeGeometry', () => {
  it('runs from the media edge facing the map to the projected point, on every side', () => {
    expect(rightOfText()).toEqual({
      key: 'photo',
      polygon: [[600, 200], [600, 440], [960, 400]],
      apex: [960, 400],
      baseMid: [600, 320],
      alpha: WEDGE_MAX_ALPHA,
      veilAlpha: WEDGE_VEIL_ALPHA,
      edgeAlpha: 1,
      dotAlpha: 1,
      hollow: false,
    });
    expect(wedgeGeometry({
      key: 'photo', media: { ...desktop.photo, left: 680, right: 1240 }, band: desktop.band,
      map: { ...desktop.map, left: 0, right: 640 }, side: 'left', point: at(320, 400), strength: 1,
    })?.polygon).toEqual([[680, 200], [680, 440], [320, 400]]);

    const phoneTopWedge = wedgeGeometry({
      key: 'photo', media: { top: 500, bottom: 740, left: 16, right: 374 }, ...phoneTop, side: 'top', point: at(195, 190), strength: 1,
    });
    expect(phoneTopWedge?.polygon).toEqual([[16, 500], [374, 500], [195, 190]]);
    expect(phoneTopWedge?.baseMid).toEqual([195, 500]);
    expect(wedgeGeometry({
      key: 'photo', media: { top: 100, bottom: 340, left: 16, right: 374 }, ...phoneBottom, side: 'bottom', point: at(195, 654), strength: 1,
    })?.polygon).toEqual([[16, 340], [374, 340], [195, 654]]);
  });

  it('cuts the base to the reading band, so a phone map box covering the media hides that part', () => {
    expect(wedgeGeometry({
      key: 'photo', media: { top: 300, bottom: 540, left: 16, right: 374 }, ...phoneTop, side: 'top', point: at(195, 190), strength: 1,
    })?.polygon).toEqual([[16, 380], [374, 380], [195, 190]]);
    expect(wedgeGeometry({
      key: 'photo', media: { top: 400, bottom: 640, left: 16, right: 374 }, ...phoneBottom, side: 'bottom', point: at(195, 654), strength: 1,
    })?.polygon).toEqual([[16, 464], [374, 464], [195, 654]]);
    expect(wedgeGeometry({
      key: 'photo', media: { ...desktop.photo, top: -100, bottom: 140 }, band: desktop.band, map: desktop.map, side: 'right', point: at(960, 400), strength: 1,
    })?.polygon).toEqual([[600, 0], [600, 140], [960, 400]]);

    expect(wedgeGeometry({
      key: 'photo', media: { top: 100, bottom: 360, left: 16, right: 374 }, ...phoneTop, side: 'top', point: at(195, 190), strength: 1,
    })).toBeNull();
  });

  it('draws nothing without a point, without strength, or with the apex outside the map box inset 8 px', () => {
    expect(wedgeGeometry({ key: 'photo', media: desktop.photo, band: desktop.band, map: desktop.map, side: 'right', point: null, strength: 1 })).toBeNull();
    expect(rightOfText(at(960, 400), 0)).toBeNull();
    expect(rightOfText(at(1276, 400))).toBeNull();
    expect(rightOfText(at(1272, 400))).toBeNull();
    expect(rightOfText(at(960, -10))).toBeNull();
    expect(rightOfText(at(600, 400))).toBeNull();
    expect(rightOfText(at(960, 796))).toBeNull();
    expect(rightOfText(at(960, 792))).toBeNull();
  });

  it('fades out over the last 24 px before the inset edge, outside and inside the map box alike', () => {
    const halfway = rightOfText(at(1280 - 8 - 12, 400));
    expect(halfway?.alpha).toBeCloseTo(WEDGE_MAX_ALPHA * 0.5, 12);
    expect(halfway?.veilAlpha).toBeCloseTo(WEDGE_VEIL_ALPHA * 0.5, 12);
    expect(halfway?.edgeAlpha).toBeCloseTo(0.5, 12);
    expect(halfway?.dotAlpha).toBeCloseTo(0.5, 12);
    for (const edge of [at(640 + 8 + 12, 400), at(960, 8 + 12), at(960, 800 - 8 - 12)]) {
      expect(rightOfText(edge)?.alpha, `${edge.x}, ${edge.y}`).toBeCloseTo(WEDGE_MAX_ALPHA * 0.5, 12);
    }
    expect(rightOfText(at(1280 - 8 - 12, 400), 0.5)).toMatchObject({
      alpha: expect.closeTo(WEDGE_MAX_ALPHA * 0.25, 12), veilAlpha: expect.closeTo(WEDGE_VEIL_ALPHA * 0.25, 12), edgeAlpha: 0.25,
    });
    expect(rightOfText(at(1280 - 8 - 24, 400))?.alpha).toBe(WEDGE_MAX_ALPHA);
  });

  it('dims an apex hidden by terrain, in both parts, and hollows its dot', () => {
    const hidden = rightOfText(at(960, 400, true));
    expect(hidden?.alpha).toBeCloseTo(WEDGE_MAX_ALPHA * 0.4, 12);
    expect(hidden?.veilAlpha).toBeCloseTo(WEDGE_VEIL_ALPHA * 0.4, 12);
    expect(hidden?.edgeAlpha).toBeCloseTo(0.4, 12);
    expect(hidden?.dotAlpha).toBe(1);
    expect(hidden?.hollow).toBe(true);
  });

  it('never exceeds WEDGE_MAX_ALPHA', () => {
    let drawn = 0;
    for (const strength of [0.01, 0.3, 0.7, 1]) {
      for (let x = 600; x <= 1300; x += 10) {
        for (let y = -20; y <= 820; y += 40) {
          for (const occluded of [false, true]) {
            const wedge = rightOfText(at(x, y, occluded), strength);
            if (!wedge) continue;
            drawn += 1;
            expect(wedge.alpha).toBeGreaterThan(0);
            expect(wedge.alpha).toBeLessThanOrEqual(WEDGE_MAX_ALPHA);
            expect(wedge.veilAlpha).toBeLessThanOrEqual(WEDGE_VEIL_ALPHA);
            expect(wedge.edgeAlpha).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    expect(drawn).toBeGreaterThan(0);
  });
});

describe('wedgesFor', () => {
  const day = northbound('Day', 45, 6, 21);
  const keys = ['a', 'b', 'lost', 'c', 'd'];
  const photo = (id: string): StoryBlock => ({ id, kind: 'media', media: { kind: 'picture', id } });
  const compiled = compileStory({
    document: story(['s', km(0), keys.map(photo)]),
    tracks: [day],
    journeySegments: [{ id: 'day', type: 'track', trackId: day.id, duration: 1 }],
    textAnnotations: [],
    // 'lost' has no lat/lon and no route anchor: no point, so no wedge.
    pictures: keys.map((id, index) => (id === 'lost' ? media(id) : media(id, { lat: 45 + index * 0.001, lon: 6 }))),
    videos: [],
    journeyName: 'Day',
    settings,
  })!;
  const trackFor = (scroller: Box, map: Box, column: { left: number; right: number }) => buildScrollTrack(compiled, {
    scroller,
    map,
    contentHeight: 3_000,
    blocks: keys.map((_, index) => ({ key: `section-0-${index}`, top: 1_000 + index * 120, height: 120, ...column })),
    sections: [{ headTop: 900, headBottom: 960 }],
    finishTop: 1_700,
  });
  const desktopScroller = { top: 0, bottom: 800, left: 0, right: 1280 };
  const phoneScroller = { top: 0, bottom: 844, left: 0, right: 390 };
  const phoneColumn = { left: 16, right: 374 };
  const track = trackFor(desktopScroller, desktop.map, { left: 40, right: 600 });
  // The line at content y 1400: c is 20 px away, then lost, d, b and a.
  const frame = storyFrameAt(compiled, track, 1_000, false);
  const keyOf = (id: string) => `section-0-${keys.indexOf(id)}`;
  const pointOf = (id: string) => track.media.find((item) => item.key === keyOf(id))!.point!;
  const sameLngLat = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

  it('draws at most 3, strongest first, only for media with a point', () => {
    const wedges = wedgesFor(track, frame, () => at(960, 400));
    expect(wedges.map((wedge) => wedge.key)).toEqual(['c', 'd', 'b'].map(keyOf));
    expect(wedges[0].alpha).toBeGreaterThan(wedges[1].alpha);
    expect(wedges[1].alpha).toBeGreaterThan(wedges[2].alpha);
    // c's content box (1360 to 1480) seen at scrollTop 1000.
    expect(wedges[0].polygon).toEqual([[600, 360], [600, 480], [960, 400]]);
  });

  it('skips a point the map cannot project yet and takes the next strongest', () => {
    const wedges = wedgesFor(track, frame, (point) => (sameLngLat(point, pointOf('c')) ? null : at(960, 400)));
    expect(wedges.map((wedge) => wedge.key)).toEqual(['d', 'b', 'a'].map(keyOf));
  });

  it('uses the track layout: map side, reading band and map box', () => {
    const polygonOf = (wedges: Wedge[], id: string) => wedges.find((wedge) => wedge.key === keyOf(id))?.polygon;

    const mapLeft = trackFor(desktopScroller, { ...desktop.map, left: 0, right: 640 }, { left: 680, right: 1240 });
    expect(polygonOf(wedgesFor(mapLeft, storyFrameAt(compiled, mapLeft, 1_000, false), () => at(320, 400)), 'c'))
      .toEqual([[680, 360], [680, 480], [320, 400]]);

    // c's content box (1360 to 1480) at scrollTop 1060 sits at 300 to 420, partly under the map box.
    const mapTop = trackFor(phoneScroller, phoneTop.map, phoneColumn);
    expect(polygonOf(wedgesFor(mapTop, storyFrameAt(compiled, mapTop, 1_060, false), () => at(195, 190)), 'c'))
      .toEqual([[16, 380], [374, 380], [195, 190]]);

    // At scrollTop 960 it sits at 400 to 520, its foot under the map box.
    const mapBottom = trackFor(phoneScroller, phoneBottom.map, phoneColumn);
    expect(polygonOf(wedgesFor(mapBottom, storyFrameAt(compiled, mapBottom, 960, false), () => at(195, 654)), 'c'))
      .toEqual([[16, 464], [374, 464], [195, 654]]);
  });
});

describe('WEDGE_MAX_ALPHA', () => {
  it('keeps body text at 4.5:1 contrast under a full-strength wedge', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const canvas = parseColor(token(css, 'canvas'));
    const body = parseColor(token(css, 'evergreen-80'));

    const ground = over([...WEDGE_COLOR], WEDGE_MAX_ALPHA, canvas.rgb);
    expect(contrast(over(body.rgb, body.alpha, ground), ground)).toBeGreaterThanOrEqual(4.5);
  });
});

function token(css: string, name: string): string {
  const value = css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`--${name} not found in index.css`);
  return value.trim();
}

function parseColor(value: string): { rgb: number[]; alpha: number } {
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) return { rgb: [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16)), alpha: 1 };
  const channels = value.match(/^rgba?\(([^)]+)\)$/)?.[1].split(',').map(Number);
  if (!channels || channels.length < 3 || channels.some((channel) => !Number.isFinite(channel))) {
    throw new Error(`unsupported color ${value}`);
  }
  return { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 };
}

function over(color: number[], alpha: number, ground: number[]): number[] {
  return color.map((channel, index) => channel * alpha + ground[index] * (1 - alpha));
}

/** WCAG 2 contrast ratio between two opaque sRGB colours. */
function contrast(a: number[], b: number[]): number {
  const luminance = (rgb: number[]) => {
    const [r, g, bl] = rgb.map((channel) => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
