import type { ComputedJourney, SegmentTiming } from '@/utils/journeyUtils';

export interface OverviewRoute {
  id: string;
  trackId?: string;
  color: string;
  coordinates: number[][];
  completed: number[][];
}

/** Keep each journey segment separate so unrelated routes are never joined by a line. */
export function buildJourneyOverviewRoutes(
  journey: ComputedJourney,
  completed: number[][],
  currentSegment: SegmentTiming | undefined,
  currentPosition: { lon: number; lat: number } | null,
  fallbackColor: string,
  perRoute: boolean,
): OverviewRoute[] {
  const tracks = journey.segmentTimings.filter((segment) => segment.type === 'track' && segment.endCoordIndex >= segment.startCoordIndex);
  const selected = perRoute
    ? (currentSegment?.type === 'track' ? currentSegment : [...tracks].reverse().find((segment) => segment.segmentIndex <= (currentSegment?.segmentIndex ?? 0)) ?? tracks[0])
    : undefined;
  return tracks.filter((segment) => !perRoute || segment.segmentId === selected?.segmentId).map((segment) => {
    const coordinates = journey.coordinates.slice(segment.startCoordIndex, segment.endCoordIndex + 1).map((point) => [point.lon, point.lat]);
    const done = completed.slice(segment.startCoordIndex, Math.min(segment.endCoordIndex + 1, completed.length));
    if (currentSegment?.segmentId === segment.segmentId && currentPosition && done.length) {
      const last = done[done.length - 1];
      if (last[0] !== currentPosition.lon || last[1] !== currentPosition.lat) done.push([currentPosition.lon, currentPosition.lat]);
    }
    return { id: segment.segmentId, trackId: segment.trackId, color: segment.color ?? fallbackColor, coordinates, completed: done };
  });
}

/** A lightweight, north-up projection for the route inset. */
export function buildRouteOverviewGeometry(coordinates: number[][], width: number, height: number, padding = 18) {
  const valid = coordinates.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (!valid.length) return null;
  const referenceLon = valid[0][0];
  const averageLat = valid.reduce((sum, point) => sum + point[1], 0) / valid.length;
  const longitudeScale = Math.max(0.01, Math.cos(averageLat * Math.PI / 180));
  const unwrap = (lon: number) => referenceLon + ((((lon - referenceLon) + 540) % 360) - 180);
  const points = valid.map(([lon, lat]) => ({ x: unwrap(lon) * longitudeScale, y: -lat }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  const scale = Math.min((width - 2 * padding) / Math.max(1e-9, maxX - minX), (height - 2 * padding) / Math.max(1e-9, maxY - minY));
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const project = (lon: number, lat: number) => ({ x: width / 2 + (unwrap(lon) * longitudeScale - centerX) * scale, y: height / 2 + (-lat - centerY) * scale });
  const step = Math.max(1, Math.ceil(valid.length / 1000));
  const path = valid.filter((_, index) => index % step === 0 || index === valid.length - 1).map(([lon, lat]) => project(lon, lat));
  return { path, project };
}

/** Use the same projected coordinates as the live route marker, including its interpolated endpoint. */
export function projectRouteOverviewProgress(coordinates: number[][], project: (lon: number, lat: number) => { x: number; y: number }) {
  const valid = coordinates.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  // Full and completed paths must use the same vertices: sampling them at
  // different rates makes the painted line cut across bends in the route.
  return valid.map(([lon, lat]) => project(lon, lat));
}

/** Derive light and dark versions without changing the chosen route hue. */
export function routeOverviewColors(color: string) {
  const short = /^#([\da-f]{3})$/i.exec(color);
  const hex = short ? [...short[1]].map(char => char + char).join('') : /^#([\da-f]{6})$/i.exec(color)?.[1];
  if (!hex) return { remaining: color, completed: color };
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const rgb = (values: number[]) => `rgb(${values.map(value => Math.round(value)).join(', ')})`;
  return {
    remaining: rgb(channels.map(value => value + (255 - value) * 0.55)),
    completed: rgb(channels.map(value => value * 0.72)),
  };
}
