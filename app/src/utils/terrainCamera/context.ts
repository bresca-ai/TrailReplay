import type { GPXTrack, JourneySegment, RouteTimingMode } from '@/types';

function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable freshness token for local reviews; it is not a cryptographic hash. */
export function terrainContextFingerprint(
  tracks: GPXTrack[],
  segments: JourneySegment[],
  routeTimingMode: RouteTimingMode = 'recorded',
): string {
  const segmentPart = segments.map((s) => s.type === 'track'
    ? `${s.id}:${s.type}:${s.trackId}:${s.duration}`
    : `${s.id}:${s.type}:${s.from.lon},${s.from.lat}:${s.to.lon},${s.to.lat}:${s.duration}`).join('|');
  const geometry = tracks.map((t) => `${t.id}:${t.points.length}:` + t.points.map((p) =>
    `${p.lon},${p.lat},${p.elevation},${p.time?.getTime() ?? ''};`).join('')).join('|');
  return `tc1-${fnv1a(`${routeTimingMode}//${segmentPart}//${geometry}`)}`;
}
