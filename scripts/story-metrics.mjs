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

export function metersBetween([lonA, latA], [lonB, latB]) {
  const rad = Math.PI / 180;
  const h = Math.sin(((latB - latA) * rad) / 2) ** 2
    + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(((lonB - lonA) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function marginInside(point, box) {
  return Math.min(point.x - box.left, box.right - point.x, point.y - box.top, box.bottom - point.y);
}

export function expectedBase(media, band, side) {
  const top = Math.max(media.top, band.top);
  const bottom = Math.min(media.bottom, band.bottom);
  if (bottom <= top) return null;
  if (side === 'right') return [[media.right, top], [media.right, bottom]];
  if (side === 'left') return [[media.left, top], [media.left, bottom]];
  if (side === 'top') return [[media.left, top], [media.right, top]];
  return [[media.left, bottom], [media.right, bottom]];
}

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

export function wedgeCopiesAgree({ points, veil, axes }, tolerance = 0.01) {
  const [base0, base1, apex] = points;
  const middle = [(base0[0] + base1[0]) / 2, (base0[1] + base1[1]) / 2];
  return near(veil.flat(), points.flat(), tolerance)
    && axes.length === 2 && axes.every((axis) => near(axis, [...apex, ...middle], tolerance));
}

export function clipBoxes(d) {
  const number = '(-?[\\d.]+(?:e[+-]?\\d+)?)';
  const pattern = new RegExp(`M\\s*${number}[\\s,]+${number}\\s*H\\s*${number}\\s*V\\s*${number}\\s*H`, 'gi');
  return [...(d ?? '').matchAll(pattern)].map(([, left, top, right, bottom]) => ({
    left: Number(left), top: Number(top), right: Number(right), bottom: Number(bottom),
  }));
}

export function clipMatchesMap({ rule, text, map }, mapBox, tolerance = 0.5) {
  const boxes = clipBoxes(text);
  if (rule !== 'evenodd' || boxes.length !== 2) return false;
  const [outer, hole] = boxes;
  return boxNear(hole, mapBox, tolerance)
    && outer.left < mapBox.left && outer.top < mapBox.top && outer.right > mapBox.right && outer.bottom > mapBox.bottom
    && boxNear(map, mapBox, tolerance);
}

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
      if (item.point && item.projected && item.strength >= 0.5) tally(media, item.projected, sample.map, inset - 1);
    }
  }
  return { head, media };
}

export function reducedMotionSummary(samples, track) {
  const nearZoom = Math.min(18, Math.max(Math.min(track.routeFitZoom - 0.5, 18), track.zNear));
  const cuts = new Map();
  let offRest = 0;
  let offNear = 0;
  for (const sample of samples) {
    const { travel, camera, media } = sample.frame;
    if (!track.compiledRests.some((rest) => Math.abs(rest - travel) <= 1e-6)) offRest += 1;
    if (Math.abs(camera.zoom - nearZoom) <= 1e-9) continue;
    const framed = media.filter((item, index) => item.strength >= 0.5 && sample.media[index].point).map((item) => item.key);
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

// A scrollTop write to the current position still aborts a smooth scroll in progress:
// https://drafts.csswg.org/cssom-view/#scroll-an-element
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

export function relativeLuminance([r, g, b]) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

export function over([r, g, b, alpha], [br, bg, bb]) {
  return [r * alpha + br * (1 - alpha), g * alpha + bg * (1 - alpha), b * alpha + bb * (1 - alpha)];
}

export function textContrastUnderWedge({ text, canvas, wedge, alpha }) {
  const ground = over([wedge[0], wedge[1], wedge[2], alpha], canvas);
  return contrastRatio(over(text, ground), ground);
}
