import type { TrailColorZone } from '@/types';
import { calculateDistance } from '@/utils/gpx/trackStats';
import { getHeartRateColor } from '@/utils/gpxParser';
import type { ColoredSegmentTiming } from '@/utils/trailColorFeatures';

export type ElevationPoint = { lat: number; lon: number; elevation: number; heartRate?: number | null };
export type ElevationStyle = { colorMode: 'fixed' | 'heartRate' | 'zones'; trailColor: string; colorZones: readonly TrailColorZone[]; segmentTimings: readonly ColoredSegmentTiming[] };
export type ElevatedSegment = { start: ElevationPoint; end: ElevationPoint; fromIndex: number; toIndex: number; color: string };
const CLEARANCE_METERS = 1;

export function terrainSafeElevation(point: ElevationPoint, sample: (lon: number, lat: number) => number | null): number {
  const terrain = sample(point.lon, point.lat);
  return terrain !== null && Number.isFinite(terrain) ? Math.max(point.elevation, terrain + CLEARANCE_METERS) : point.elevation;
}

export function completedRouteIndex(points: readonly ElevationPoint[], completed: readonly number[][], current: ElevationPoint | null): number {
  if (!current || !completed.length || !points.length) return -1;
  // The final coordinate may be an interpolated endpoint or a duplicate of a
  // recorded sample. Find the last matching source point without moving past it.
  let index = Math.min(points.length - 1, completed.length - 1);
  const coord = completed[index];
  if (!coord || Math.abs(coord[0] - points[index].lon) > 1e-9 || Math.abs(coord[1] - points[index].lat) > 1e-9) index--;
  index = Math.max(0, index);
  // Recorded-clock single tracks can put the marker at the next sample.
  if (index + 1 < points.length && Math.abs(current.lon - points[index + 1].lon) < 1e-9 && Math.abs(current.lat - points[index + 1].lat) < 1e-9) return index + 1;
  const a = points[index]; const b = points[Math.min(index + 1, points.length - 1)];
  const dx = b.lon - a.lon; const dy = b.lat - a.lat; const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((current.lon - a.lon) * dx + (current.lat - a.lat) * dy) / length)) : 0;
  return index + t;
}

export function buildElevatedSegments(points: readonly ElevationPoint[], style: ElevationStyle, sample: (lon: number, lat: number) => number | null): ElevatedSegment[] {
  const output: ElevatedSegment[] = []; const n = points.length - 1;
  const zones = [...style.colorZones].filter(z => z.fromProgress < z.toProgress).sort((a, b) => a.fromProgress - b.fromProgress);
  const boundaries = zones.flatMap(z => [z.fromProgress * n, z.toProgress * n]).filter(v => v > 0 && v < n);
  const interpolate = (a: ElevationPoint, b: ElevationPoint, t: number): ElevationPoint => ({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, elevation: a.elevation + (b.elevation - a.elevation) * t });
  const colorAt = (index: number) => {
    if (style.colorMode === 'heartRate') { const hr = points[Math.floor(index)]?.heartRate; return hr ? getHeartRateColor(hr, 180) : style.trailColor; }
    if (style.colorMode === 'zones') {
      // Match the existing zone renderer's sorted, first-zone-wins overlap rule.
      const p = index / n; return zones.find(z => p >= z.fromProgress && p < z.toProgress)?.color ?? style.trailColor;
    }
    const segment = style.segmentTimings.find(s => index >= s.startCoordIndex && index < s.endCoordIndex);
    return segment?.type === 'transport' ? '#888888' : segment?.color || style.trailColor;
  };
  for (let i = 0; i < n; i++) {
    const a = points[i]; const b = points[i + 1];
    // Sampling between fixes prevents a long straight segment cutting through a ridge.
    const count = Math.min(256, Math.max(1, Math.ceil(calculateDistance(a.lat, a.lon, b.lat, b.lon) / 20)));
    const cuts = [0, ...boundaries.filter(v => v > i && v < i + 1).map(v => v - i), ...Array.from({ length: count - 1 }, (_, k) => (k + 1) / count), 1].sort((x, y) => x - y);
    for (let j = 0; j < cuts.length - 1; j++) {
      const from = cuts[j], to = cuts[j + 1]; if (to - from < 1e-9) continue;
      const start = interpolate(a, b, from); const end = interpolate(a, b, to);
      start.elevation = terrainSafeElevation(start, sample); end.elevation = terrainSafeElevation(end, sample);
      output.push({ start, end, fromIndex: i + from, toIndex: i + to, color: colorAt(i + (from + to) / 2) });
    }
  }
  return output;
}
