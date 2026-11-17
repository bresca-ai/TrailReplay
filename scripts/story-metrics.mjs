/**
 * Verdicts for scripts/probe-story.mjs, kept pure and apart from the browser
 * driving so they can be tested offline. The page only gathers raw readings
 * (frames, rects, painted SVG attributes, projections); everything that turns
 * them into PASS or FAIL lives here.
 */

/** The first path where two plain values differ, or null when deep-equal. */
export function firstDifference(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return path || '(root)';
  if (Array.isArray(a) !== Array.isArray(b)) return path || '(root)';
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = firstDifference(a[key], b[key], path ? `${path}.${key}` : key);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The scroll contract: every visit to a scrollTop must reproduce the frame of
 * the first visit, whatever came before it. `singles` are scrollTops seen only
 * once, which could not be compared at all.
 */
export function framePurity(visits) {
  const groups = new Map();
  for (const { frame } of visits) {
    const group = groups.get(frame.scrollTop) ?? [];
    group.push(frame);
    groups.set(frame.scrollTop, group);
  }
  const mismatches = [];
  let singles = 0;
  for (const [scrollTop, [first, ...rest]] of groups) {
    if (rest.length === 0) singles += 1;
    for (const frame of rest) {
      const path = firstDifference(first, frame);
      if (path !== null) mismatches.push({ scrollTop, path });
    }
  }
  return { scrollTops: groups.size, visits: visits.length, singles, mismatches };
}

export function percentiles(values) {
  if (values.length === 0) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

/** Great-circle metres between two [lon, lat] points. */
export function metersBetween([lonA, latA], [lonB, latB]) {
  const rad = Math.PI / 180;
  const h = Math.sin(((latB - latA) * rad) / 2) ** 2
    + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(((lonB - lonA) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** How far a point sits inside a box, in px; negative when outside. */
export function marginInside(point, box) {
  return Math.min(point.x - box.left, box.right - point.x, point.y - box.top, box.bottom - point.y);
}

/** The media box edge that faces the map, cut to the reading band; null when none of it is in the band. */
export function expectedBase(media, band, side) {
  const top = Math.max(media.top, band.top);
  const bottom = Math.min(media.bottom, band.bottom);
  if (bottom <= top) return null;
  if (side === 'right') return [[media.right, top], [media.right, bottom]];
  if (side === 'left') return [[media.left, top], [media.left, bottom]];
  if (side === 'top') return [[media.left, top], [media.right, top]];
  return [[media.left, bottom], [media.right, bottom]];
}

/**
 * Each painted wedge against the media it belongs to: the media whose
 * DOM-measured base and projected point fit the painted polygon and dot best.
 * The error is the worst corner (or dot centre) distance in px.
 */
export function matchPaintedWedges(sample) {
  return sample.painted.filter(Boolean).map((painted) => {
    let best = { key: null, error: Infinity, hollow: painted.hollow };
    for (const media of sample.media) {
      const base = media.rect && media.projected && expectedBase(media.rect, sample.band, sample.side);
      if (!base) continue;
      const apex = [media.projected.x, media.projected.y];
      const error = Math.max(
        ...[...base, apex].map(([x, y], index) => Math.hypot(x - painted.points[index][0], y - painted.points[index][1])),
        Math.hypot(painted.cx - apex[0], painted.cy - apex[1]),
      );
      if (error < best.error) best = { key: media.key, error, hollow: painted.hollow };
    }
    return best;
  });
}

const near = (a, b, tolerance) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
const boxNear = (a, b, tolerance) => a != null && near([a.left, a.top, a.right, a.bottom], [b.left, b.top, b.right, b.bottom], tolerance);

/**
 * One slot draws its wedge twice, cut at the map box: the tint polygon outside it, and inside it a veil
 * polygon, a halo and a line from base0 to the apex to base1, each gradient running from the apex to the
 * base midpoint. True when every copy is the shape `points` describes.
 */
export function wedgeCopiesAgree({ points, veil, edges, axes }, tolerance = 0.01) {
  const [base0, base1, apex] = points;
  const middle = [(base0[0] + base1[0]) / 2, (base0[1] + base1[1]) / 2];
  return near(veil.flat(), points.flat(), tolerance)
    && edges.length === 2 && edges.every((edge) => near(edge.flat(), [...base0, ...apex, ...base1], tolerance))
    && axes.length === 2 && axes.every((axis) => near(axis, [...apex, ...middle], tolerance));
}

/** The boxes of an SVG path made of `M x y H right V bottom H x Z` rectangles, as the reader writes its text clip. */
export function clipBoxes(d) {
  const number = '(-?[\\d.]+(?:e[+-]?\\d+)?)';
  const pattern = new RegExp(`M\\s*${number}[\\s,]+${number}\\s*H\\s*${number}\\s*V\\s*${number}\\s*H`, 'gi');
  return [...(d ?? '').matchAll(pattern)].map(([, left, top, right, bottom]) => ({
    left: Number(left), top: Number(top), right: Number(right), bottom: Number(bottom),
  }));
}

/**
 * The clips a painted slot points at: the text part must paint everywhere but the map box (an even-odd path
 * of an enclosing box and the map box), the map part only inside it.
 */
export function clipMatchesMap({ rule, text, map }, mapBox, tolerance = 0.5) {
  const boxes = clipBoxes(text);
  if (rule !== 'evenodd' || boxes.length !== 2) return false;
  const [outer, hole] = boxes;
  return boxNear(hole, mapBox, tolerance)
    && outer.left < mapBox.left && outer.top < mapBox.top && outer.right > mapBox.right && outer.bottom > mapBox.bottom
    && boxNear(map, mapBox, tolerance);
}

/**
 * Wedges as painted, over every sample. A wedge is due when its media is at
 * least 0.1 strong, part of it is in the band and its point projects at least
 * 32 px inside the map box (past the 8 px inset and the 24 px edge fade); the
 * strongest three due wedges must be painted. Each slot counts once; `torn`
 * slots draw copies that disagree, `unclipped` ones are not cut at the map box.
 */
export function wedgeSummary(samples, tolerance = 1) {
  const summary = {
    frames: samples.length, framesWithWedge: 0, painted: 0, hollow: 0, mismatched: 0, missing: 0, torn: 0, unclipped: 0, worstError: 0,
  };
  for (const sample of samples) {
    const matches = matchPaintedWedges(sample);
    if (matches.length > 0) summary.framesWithWedge += 1;
    summary.painted += matches.length;
    summary.hollow += matches.filter((match) => match.hollow).length;
    for (const match of matches) {
      summary.worstError = Math.max(summary.worstError, match.error);
      if (match.error > tolerance) summary.mismatched += 1;
    }
    for (const painted of sample.painted.filter(Boolean)) {
      if (!wedgeCopiesAgree(painted)) summary.torn += 1;
      if (!clipMatchesMap(painted.clip, sample.map)) summary.unclipped += 1;
    }
    const drawn = new Set(matches.filter((match) => match.error <= tolerance).map((match) => match.key));
    const due = sample.media
      .filter((media) => media.strength >= 0.1 && media.rect && media.projected
        && expectedBase(media.rect, sample.band, sample.side) && marginInside(media.projected, sample.map) >= 32)
      .sort((left, right) => right.strength - left.strength)
      .slice(0, 3);
    summary.missing += due.filter((media) => !drawn.has(media.key)).length;
  }
  return summary;
}

/** Points that must be in frame: the head on every frame where it shows; a media point once its weight is full. */
export function framingSummary(samples, inset) {
  const head = { checked: 0, outside: 0, minMargin: Infinity };
  const media = { checked: 0, outside: 0, minMargin: Infinity };
  const tally = (entry, point, box, needed) => {
    const margin = marginInside(point, box);
    entry.checked += 1;
    entry.minMargin = Math.min(entry.minMargin, margin);
    if (margin < needed) entry.outside += 1;
  };
  for (const sample of samples) {
    if (sample.frame.head.visible && sample.head) tally(head, sample.head, sample.map, 0);
    for (const item of sample.media) {
      // Framing weight is smoothstep(0, 0.5, strength), full from 0.5; reduced motion cuts at the same 0.5.
      if (item.point && item.projected && item.strength >= 0.5) tally(media, item.projected, sample.map, inset - 1);
    }
  }
  return { head, media };
}

/**
 * Reduced motion: travel only ever rests (start, a section, the finish), and
 * the zoom stays at the near zoom unless a media point is framed, which is a
 * cut: one zoom per (stop, framed media), never a glide between values.
 */
export function reducedMotionSummary(samples, track) {
  const rests = track.rests;
  const near = Math.min(18, Math.max(Math.min(track.routeFitZoom - 0.5, 18), track.zNear));
  const cuts = new Map();
  let offRest = 0;
  let offNear = 0;
  for (const sample of samples) {
    const { travel, camera, media } = sample.frame;
    if (!rests.some((rest) => Math.abs(rest - travel) <= 1e-6)) offRest += 1;
    if (Math.abs(camera.zoom - near) <= 1e-9) continue;
    const framed = media.filter((item, index) => item.strength >= 0.5 && sample.media[index]?.point).map((item) => item.key);
    if (framed.length === 0) {
      offNear += 1;
      continue;
    }
    const key = `${travel}|${framed.sort().join(',')}`;
    cuts.set(key, (cuts.get(key) ?? new Set()).add(camera.zoom));
  }
  const glides = [...cuts.values()].filter((zooms) => zooms.size > 1).length;
  return { frames: samples.length, offRest, offNear, cuts: cuts.size, glides };
}

/**
 * The reader's scrollTop writes, from timeline lines `wrote <from> to <to> ...`, that move it 0.5 px or less:
 * a write that changes nothing still ends a smooth keyboard scroll in flight.
 */
export function writesInPlace(timeline) {
  return timeline.filter((line) => {
    const [, from, to] = /^wrote (-?[\d.]+) to (-?[\d.]+)/.exec(line) ?? [];
    return from !== undefined && Math.abs(Number(to) - Number(from)) <= 0.5;
  });
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of [r, g, b] in 0..255. */
export function relativeLuminance([r, g, b]) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

/** [r, g, b, alpha] composited over an opaque [r, g, b]. */
export function over([r, g, b, alpha], [br, bg, bb]) {
  return [r * alpha + br * (1 - alpha), g * alpha + bg * (1 - alpha), b * alpha + bb * (1 - alpha)];
}

/** Body text over the canvas with the wedge colour laid on top at `alpha`; colours are [r, g, b, alpha]. */
export function textContrastUnderWedge({ text, canvas, wedge, alpha }) {
  const ground = over([wedge[0], wedge[1], wedge[2], alpha], canvas);
  return contrastRatio(over(text, ground), ground);
}
