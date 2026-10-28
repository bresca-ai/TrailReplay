import type { GPXTrack } from '@/types';

/**
 * Ascending wall-clock timestamps of a track's timed points, alongside the
 * index each one has in `track.points`. Points without a timestamp are
 * skipped, so a partially timed track still resolves.
 */
export interface TrackTimeIndex {
  times: number[];
  indices: number[];
}

export function buildTrackTimeIndex(track: GPXTrack): TrackTimeIndex | null {
  const times: number[] = [];
  const indices: number[] = [];

  track.points.forEach((point, index) => {
    if (!point.time) return;
    const time = point.time.getTime();
    if (!Number.isFinite(time)) return;
    // Guard against non-monotonic exports: a later timestamp that goes
    // backwards would break the binary search.
    if (times.length > 0 && time < times[times.length - 1]) return;
    times.push(time);
    indices.push(index);
  });

  return times.length >= 2 ? { times, indices } : null;
}

export interface TimedTrackPosition {
  lat: number;
  lon: number;
  /** Distance along the track in metres, for drawing the completed trail. */
  distance: number;
  /** Whether the clock falls inside this track's own recording window. */
  state: 'before' | 'during' | 'after';
}

/**
 * Where this track was at a given wall-clock instant. Before the track
 * starts it stays parked at its first point, after it finishes at its last,
 * so a replay spanning several people shows who is ahead at each moment and
 * who has already finished.
 */
export function trackPositionAtTime(
  track: GPXTrack,
  timeIndex: TrackTimeIndex,
  atMs: number
): TimedTrackPosition {
  const { times, indices } = timeIndex;
  const lastEntry = times.length - 1;

  if (atMs <= times[0]) {
    const point = track.points[indices[0]];
    return {
      lat: point.lat,
      lon: point.lon,
      distance: point.distance,
      state: atMs < times[0] ? 'before' : 'during',
    };
  }

  if (atMs >= times[lastEntry]) {
    const point = track.points[indices[lastEntry]];
    return {
      lat: point.lat,
      lon: point.lon,
      distance: point.distance,
      state: atMs > times[lastEntry] ? 'after' : 'during',
    };
  }

  let lo = 0;
  let hi = lastEntry;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < atMs) lo = mid + 1;
    else hi = mid;
  }

  const upperEntry = lo;
  const lowerEntry = Math.max(0, upperEntry - 1);
  const lowerTime = times[lowerEntry];
  const upperTime = times[upperEntry];
  const ratio = upperTime > lowerTime ? (atMs - lowerTime) / (upperTime - lowerTime) : 0;

  const lower = track.points[indices[lowerEntry]];
  const upper = track.points[indices[upperEntry]];

  return {
    lat: lower.lat + (upper.lat - lower.lat) * ratio,
    lon: lower.lon + (upper.lon - lower.lon) * ratio,
    distance: lower.distance + (upper.distance - lower.distance) * ratio,
    state: 'during',
  };
}
