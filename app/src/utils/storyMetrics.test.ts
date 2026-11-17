import { describe, expect, it } from 'vitest';
// The story probe runs outside the app as plain Node; its verdicts are pinned here so a check that can no
// longer fail is caught offline. Shapes are declared in src/types/story-metrics.d.ts.
import {
  clipBoxes,
  contrastRatio,
  framePurity,
  framingSummary,
  metersBetween,
  percentiles,
  reducedMotionSummary,
  textContrastUnderWedge,
  wedgeSummary,
  writesInPlace,
  type PaintedWedge,
  type StorySample,
} from '../../../scripts/story-metrics.mjs';

type Box = StorySample['map'];
const MAP = { top: 0, bottom: 800, left: 640, right: 1280 };

/** A slot painted as the reader paints it: every copy of the shape agrees, cut at `map`. */
function paint(points: [number, number][], hollow = false, map: Box = MAP): PaintedWedge {
  const [base0, base1, apex] = points;
  const middle = [(base0[0] + base1[0]) / 2, (base0[1] + base1[1]) / 2];
  return {
    points, cx: apex[0], cy: apex[1], hollow, alpha: 0.2,
    veil: points, edges: [[base0, apex, base1], [base0, apex, base1]], axes: [[...apex, ...middle], [...apex, ...middle]],
    clip: {
      rule: 'evenodd',
      text: `M-1e5 -1e5H1e5V1e5H-1e5Z M${map.left} ${map.top}H${map.right}V${map.bottom}H${map.left}Z`,
      map,
    },
  };
}

function sample(overrides: Omit<Partial<StorySample>, 'frame'> & { frame?: Partial<StorySample['frame']> } = {}): StorySample {
  const { frame, ...rest } = overrides;
  return {
    map: MAP,
    band: { top: 0, bottom: 800 },
    side: 'right',
    head: { x: 960, y: 400 },
    media: [{ key: 's/photo', point: [1, 42], strength: 0.8, projected: { x: 1000, y: 300 }, rect: { top: 300, bottom: 500, left: 40, right: 600 } }],
    painted: [paint([[600, 300], [600, 500], [1000, 300]]), null, null],
    ...rest,
    frame: { scrollTop: 0, travel: 0, camera: { zoom: 12 }, head: { lngLat: [1, 42], visible: true }, media: [{ key: 's/photo', strength: 0.8 }], ...frame },
  };
}

describe('framePurity', () => {
  it('passes revisits that reproduce the frame and names the path of one that does not', () => {
    const frame = (scrollTop: number, travel: number) => ({ frame: { scrollTop, travel, camera: { zoom: 12 } } });
    expect(framePurity([frame(10, 5), frame(20, 9), frame(10, 5)])).toEqual({ scrollTops: 2, visits: 3, singles: 1, mismatches: [] });
    expect(framePurity([frame(10, 5), frame(10, 5.000001)]).mismatches).toEqual([{ scrollTop: 10, path: 'travel' }]);
  });
});

describe('wedgeSummary', () => {
  it('matches a wedge painted from the photo edge to the projected point', () => {
    expect(wedgeSummary([sample()])).toMatchObject({ framesWithWedge: 1, painted: 1, mismatched: 0, missing: 0 });
  });

  it('flags a wedge painted 3 px off and a due wedge that was never painted', () => {
    const shifted = sample({ painted: [paint([[603, 300], [603, 500], [1000, 300]]), null, null] });
    expect(wedgeSummary([shifted])).toMatchObject({ mismatched: 1, worstError: 3, missing: 1 });
    expect(wedgeSummary([sample({ painted: [null, null, null] })])).toMatchObject({ framesWithWedge: 0, missing: 1 });
  });

  it('cuts the base to the band under a phone map on top', () => {
    const phone = sample({
      side: 'top',
      map: { top: 0, bottom: 380, left: 0, right: 390 },
      band: { top: 380, bottom: 844 },
      media: [{ key: 's/photo', point: [1, 42], strength: 0.6, projected: { x: 200, y: 200 }, rect: { top: 300, bottom: 500, left: 16, right: 374 } }],
      painted: [paint([[16, 380], [374, 380], [200, 200]], true, { top: 0, bottom: 380, left: 0, right: 390 }), null, null],
    });
    expect(wedgeSummary([phone])).toMatchObject({ mismatched: 0, missing: 0, hollow: 1 });
  });

  it('runs the base from the photo edge facing a map on the left, and from the bottom edge cut to the band above a phone map', () => {
    const left = sample({
      side: 'left',
      map: { top: 0, bottom: 800, left: 0, right: 640 },
      media: [{ key: 's/photo', point: [1, 42], strength: 0.8, projected: { x: 300, y: 300 }, rect: { top: 300, bottom: 500, left: 680, right: 1240 } }],
      painted: [paint([[680, 300], [680, 500], [300, 300]], false, { top: 0, bottom: 800, left: 0, right: 640 }), null, null],
    });
    const bottom = sample({
      side: 'bottom',
      map: { top: 464, bottom: 844, left: 0, right: 390 },
      band: { top: 0, bottom: 464 },
      media: [{ key: 's/photo', point: [1, 42], strength: 0.8, projected: { x: 200, y: 650 }, rect: { top: 300, bottom: 520, left: 16, right: 374 } }],
      painted: [paint([[16, 464], [374, 464], [200, 650]], false, { top: 464, bottom: 844, left: 0, right: 390 }), null, null],
    });
    expect(wedgeSummary([left])).toMatchObject({ mismatched: 0, missing: 0, worstError: 0 });
    expect(wedgeSummary([bottom])).toMatchObject({ mismatched: 0, missing: 0, worstError: 0 });
  });

  it('owes a wedge only from strength 0.1 and a point at least 32 px inside the map box', () => {
    const unpainted = (strength: number, x: number) => sample({
      media: [{ key: 's/photo', point: [1, 42], strength, projected: { x, y: 300 }, rect: { top: 300, bottom: 500, left: 40, right: 600 } }],
      painted: [null, null, null],
    });
    expect(wedgeSummary([unpainted(0.09, 1000)]).missing).toBe(0);
    expect(wedgeSummary([unpainted(0.1, 1000)]).missing).toBe(1);
    expect(wedgeSummary([unpainted(0.8, 640 + 31)]).missing).toBe(0);
    expect(wedgeSummary([unpainted(0.8, 640 + 32)]).missing).toBe(1);
    expect(wedgeSummary([unpainted(0.8, 600)]).missing).toBe(0);
  });
});

describe('wedge copies and clips', () => {
  it('counts a slot once however many copies draw it, and flags copies that drift from its shape', () => {
    const good = paint([[600, 300], [600, 500], [1000, 300]]);
    expect(wedgeSummary([sample()])).toMatchObject({ painted: 1, torn: 0, unclipped: 0 });
    const drifted: PaintedWedge[] = [
      { ...good, veil: [[600, 300], [600, 500], [1002, 300]] },
      { ...good, edges: [good.edges[0], [[600, 300], [600, 500], [1000, 300]]] },
      { ...good, axes: [good.axes[0], [600, 400, 1000, 300]] },
      { ...good, edges: [good.edges[0]] },
    ];
    for (const painted of drifted) {
      expect(wedgeSummary([sample({ painted: [painted, null, null] })])).toMatchObject({ painted: 1, torn: 1, mismatched: 0 });
    }
  });

  it('flags a slot whose text part is not cut out of the map box or whose map part is not cut to it', () => {
    const good = paint([[600, 300], [600, 500], [1000, 300]]);
    const broken: PaintedWedge['clip'][] = [
      { ...good.clip, rule: 'nonzero' },
      { ...good.clip, text: 'M-1e5 -1e5H1e5V1e5H-1e5Z M643 0H1280V800H643Z' },
      { ...good.clip, text: 'M640 0H1280V800H640Z' },
      { ...good.clip, text: 'M0 0H100V100H0Z M640 0H1280V800H640Z' },
      { ...good.clip, text: null },
      { ...good.clip, map: { top: 0, bottom: 800, left: 0, right: 1280 } },
      { ...good.clip, map: null },
    ];
    for (const clip of broken) {
      expect(wedgeSummary([sample({ painted: [{ ...good, clip }, null, null] })])).toMatchObject({ unclipped: 1, torn: 0 });
    }
  });

  it('reads the boxes of the reader\'s even-odd clip path', () => {
    expect(clipBoxes('M-1e5 -1e5H1e5V1e5H-1e5Z M640.5 0H1280V800H640.5Z')).toEqual([
      { left: -1e5, top: -1e5, right: 1e5, bottom: 1e5 },
      { left: 640.5, top: 0, right: 1280, bottom: 800 },
    ]);
    expect(clipBoxes(null)).toEqual([]);
  });
});

describe('writesInPlace', () => {
  it('keeps the scrollTop writes that move 0.5 px or less and nothing else from the timeline', () => {
    const timeline = [
      'wrote 812.00 to 812.00 at 40 ms', 'wrote 812.00 to 812.40 at 41 ms', 'wrote 812.00 to 812.60 at 42 ms',
      'img loaded at 50 ms', 'Space at 60 ms on the scroller', 'wrote 0.00 to 300.00 at 70 ms',
    ];
    expect(writesInPlace(timeline)).toEqual(['wrote 812.00 to 812.00 at 40 ms', 'wrote 812.00 to 812.40 at 41 ms']);
  });
});

describe('framingSummary', () => {
  it('counts a head outside the map box and ignores media below full framing weight', () => {
    const outside = sample({ head: { x: 600, y: 400 } });
    const weak = sample({ media: [{ key: 's/photo', point: [1, 42], strength: 0.4, projected: { x: 650, y: 10 }, rect: null }] });
    const { head, media } = framingSummary([outside, weak], 32);
    expect(head).toMatchObject({ checked: 2, outside: 1 });
    expect(media).toMatchObject({ checked: 1, outside: 0 });
  });

  it('counts a media point at full weight closer to the edge than the inset, allowing 1 px', () => {
    const at = (x: number) => sample({ media: [{ key: 's/photo', point: [1, 42], strength: 0.5, projected: { x, y: 400 }, rect: null }] });
    const { media } = framingSummary([at(640 + 31), at(640 + 30.5), at(640 + 20)], 32);
    expect(media).toEqual({ checked: 3, outside: 2, minMargin: 20 });
  });
});

describe('metersBetween', () => {
  it('measures great-circle metres: a degree of latitude is 111.19 km', () => {
    expect(metersBetween([1, 42], [1, 43])).toBeCloseTo(111_195, 0);
    expect(metersBetween([0, 0], [1, 0])).toBeCloseTo(111_195, 0);
  });
});

describe('reducedMotionSummary', () => {
  const track = { rests: [0, 1000, 5000], zNear: 13, routeFitZoom: 9 };

  it('accepts rests, the near zoom and a framed media cut', () => {
    const atRest = sample({ frame: { travel: 1000, camera: { zoom: 13 }, media: [{ key: 's/photo', strength: 0.2 }] } });
    const cut = sample({ frame: { travel: 1000, camera: { zoom: 11.5 } } });
    expect(reducedMotionSummary([atRest, cut, cut], track)).toMatchObject({ offRest: 0, offNear: 0, cuts: 1, glides: 0 });
  });

  it('flags travel between rests, a zoom off near with nothing framed, and a glide', () => {
    const between = sample({ frame: { travel: 2500, camera: { zoom: 13 } } });
    const wide = sample({ frame: { travel: 1000, camera: { zoom: 12 }, media: [{ key: 's/photo', strength: 0.2 }] } });
    const glide = [11.5, 11.6].map((zoom) => sample({ frame: { travel: 1000, camera: { zoom } } }));
    expect(reducedMotionSummary([between, wide, ...glide], track)).toMatchObject({ offRest: 1, offNear: 1, glides: 1 });
  });

  it('takes the near zoom clamped to the route floor (route fit less 0.5) and to 18', () => {
    const still = (zoom: number) => sample({ frame: { travel: 1000, camera: { zoom }, media: [{ key: 's/photo', strength: 0.2 }] } });
    const floored = { ...track, zNear: 8, routeFitZoom: 10 };
    expect(reducedMotionSummary([still(9.5)], floored).offNear).toBe(0);
    expect(reducedMotionSummary([still(8)], floored).offNear).toBe(1);
    const capped = { ...track, zNear: 19, routeFitZoom: 9 };
    expect(reducedMotionSummary([still(18)], capped).offNear).toBe(0);
    expect(reducedMotionSummary([still(19)], capped).offNear).toBe(1);
  });
});

describe('contrast', () => {
  it('follows WCAG: black on white is 21:1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it('reads translucent text over the canvas, darkened by the wedge', () => {
    const colours = { text: [27, 42, 32, 0.8] as [number, number, number, number], canvas: [248, 246, 240] as [number, number, number], wedge: [27, 42, 32] as [number, number, number] };
    const clear = textContrastUnderWedge({ ...colours, alpha: 0 });
    expect(clear).toBeCloseTo(7.46, 1); // the design's figure for --evergreen-80 on --canvas
    expect(textContrastUnderWedge({ ...colours, alpha: 0.22 })).toBeLessThan(clear);
  });
});

describe('percentiles', () => {
  it('reports p50, p95 and max', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentiles(values)).toEqual({ p50: 51, p95: 96, max: 100 });
    expect(percentiles([])).toEqual({ p50: 0, p95: 0, max: 0 });
  });
});
