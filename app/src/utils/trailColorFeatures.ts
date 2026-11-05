import type { Feature, LineString } from 'geojson';
import type { TrailColorZone } from '@/types';

export const TRANSPORT_SEGMENT_COLOR = '#888888';

type ColoredLineFeature = Feature<LineString, { color: string }>;
export type ColoredSegmentTiming = {
  segmentIndex: number;
  type: 'track' | 'transport';
  startCoordIndex: number;
  endCoordIndex: number;
  color?: string;
  transportMode?: string;
};

function pointsMatch(a: number[] | undefined, b: number[] | undefined) {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

function getSegmentColor(segment: Pick<ColoredSegmentTiming, 'type' | 'color'>, fallbackColor: string) {
  if (segment.type === 'transport') {
    return TRANSPORT_SEGMENT_COLOR;
  }

  return segment.color || fallbackColor;
}

export function buildSegmentLineFeatures(params: {
  coordinates: number[][];
  segmentTimings: readonly ColoredSegmentTiming[];
  fallbackColor: string;
  maxCoordIndex?: number;
  partialEndpoint?: [number, number] | null;
  partialSegmentIndex?: number | null;
}): ColoredLineFeature[] {
  const {
    coordinates,
    segmentTimings,
    fallbackColor,
    maxCoordIndex = coordinates.length - 1,
    partialEndpoint = null,
    partialSegmentIndex = null,
  } = params;

  if (coordinates.length < 2 || segmentTimings.length === 0 || maxCoordIndex < 0) {
    return [];
  }

  const features: ColoredLineFeature[] = [];

  segmentTimings.forEach((segment) => {
    if (segment.transportMode === 'camera' || segment.startCoordIndex > maxCoordIndex) {
      return;
    }

    const endCoordIndex = Math.min(segment.endCoordIndex, maxCoordIndex);
    const segmentCoordinates = coordinates.slice(segment.startCoordIndex, endCoordIndex + 1);
    const shouldAppendPartialPoint = partialEndpoint && partialSegmentIndex === segment.segmentIndex;

    if (shouldAppendPartialPoint && !pointsMatch(segmentCoordinates[segmentCoordinates.length - 1], partialEndpoint)) {
      segmentCoordinates.push(partialEndpoint);
    }

    if (segmentCoordinates.length < 2) {
      return;
    }

    features.push({
      type: 'Feature',
      properties: { color: getSegmentColor(segment, fallbackColor) },
      geometry: {
        type: 'LineString',
        coordinates: segmentCoordinates,
      },
    });
  });

  return features;
}

function interpolateCoord(coordinates: number[][], floatIdx: number): number[] {
  const n = coordinates.length - 1;
  const fi = Math.max(0, Math.min(n, floatIdx));
  const lo = Math.floor(fi);
  const hi = Math.min(n, lo + 1);
  const t = fi - lo;
  if (t === 0 || lo === hi) return [...coordinates[lo]];
  return [
    coordinates[lo][0] + t * (coordinates[hi][0] - coordinates[lo][0]),
    coordinates[lo][1] + t * (coordinates[hi][1] - coordinates[lo][1]),
  ];
}

// Builds coordinates for a sub-segment by interpolating exact start/end points
// and including all whole GPS coords strictly between them.
function buildIntervalCoords(coordinates: number[][], startFloat: number, endFloat: number): number[][] {
  const startPt = interpolateCoord(coordinates, startFloat);
  const endPt = interpolateCoord(coordinates, endFloat);
  const firstInner = Math.floor(startFloat) + 1;
  const lastInner = Math.ceil(endFloat) - 1;
  const inner: number[][] = [];
  for (let i = firstInner; i <= lastInner && i < coordinates.length; i++) {
    inner.push(coordinates[i]);
  }
  return [startPt, ...inner, endPt];
}

export function buildColorZoneLineFeatures(params: {
  coordinates: number[][];
  colorZones: readonly TrailColorZone[];
  fallbackColor: string;
  maxCoordIndex?: number;
  partialEndpoint?: [number, number] | null;
  segmentTimings?: readonly ColoredSegmentTiming[];
}): ColoredLineFeature[] {
  const {
    coordinates,
    colorZones,
    fallbackColor,
    maxCoordIndex = coordinates.length - 1,
    partialEndpoint = null,
    segmentTimings = [],
  } = params;

  if (coordinates.length < 2 || maxCoordIndex < 0) return [];

  const n = coordinates.length - 1;
  const clampedMax = Math.min(maxCoordIndex, n);
  const maxProgress = clampedMax / n;

  const sorted = [...colorZones]
    .filter((z) => z.fromProgress < z.toProgress)
    .sort((a, b) => a.fromProgress - b.fromProgress);

  // Build progress-space intervals, filling gaps with the fallback color
  const intervals: { startP: number; endP: number; color: string }[] = [];
  let cursor = 0;

  for (const zone of sorted) {
    if (zone.fromProgress >= maxProgress) break;
    if (zone.toProgress <= cursor) continue;

    const actualStart = Math.max(cursor, zone.fromProgress);
    const actualEnd = Math.min(zone.toProgress, maxProgress);

    if (actualStart > cursor) {
      intervals.push({ startP: cursor, endP: actualStart, color: fallbackColor });
    }
    intervals.push({ startP: actualStart, endP: actualEnd, color: zone.color });
    cursor = actualEnd;
  }

  if (cursor < maxProgress) {
    intervals.push({ startP: cursor, endP: maxProgress, color: fallbackColor });
  }

  const ranges = segmentTimings.length > 0
    ? segmentTimings.filter((segment) => segment.transportMode !== 'camera').map((segment) => [segment.startCoordIndex, segment.endCoordIndex])
    : [[0, n]];
  const features: ColoredLineFeature[] = intervals.flatMap((interval) => ranges.flatMap(([from, to]) => {
    const start = Math.max(from, interval.startP * n);
    const end = Math.min(to, interval.endP * n);
    return end > start ? [{
      type: 'Feature' as const,
      properties: { color: interval.color },
      geometry: { type: 'LineString' as const, coordinates: buildIntervalCoords(coordinates, start, end) },
    }] : [];
  }));

  // Append the interpolated current position to the last feature
  if (partialEndpoint && features.length > 0) {
    const lastFeature = features[features.length - 1];
    const lastCoords = lastFeature.geometry.coordinates;
    const last = lastCoords[lastCoords.length - 1];
    if (!pointsMatch(last, partialEndpoint)) {
      lastCoords.push(partialEndpoint);
    }
  }

  return features;
}
