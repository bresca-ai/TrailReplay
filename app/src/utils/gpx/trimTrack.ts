import type { GPXTrack } from '@/types';
import { buildTrackFromRawPoints } from './trackStats';

export interface TrackTrimRange {
  trackId: string;
  startIndex: number;
  endIndex: number;
}

export interface TrackTrimAxis {
  mode: 'time' | 'distance' | 'points';
  values: number[];
  max: number;
}

/** Use the recording clock, never the replay's configured video duration. */
export function buildTrackTrimAxis(track: GPXTrack): TrackTrimAxis {
  const times = track.points.map((point) => point.time?.getTime() ?? NaN);
  const monotonic = (values: number[]) => values.length > 1
    && values.every((value, index) => Number.isFinite(value) && (index === 0 || value >= values[index - 1]))
    && values[values.length - 1] > values[0];

  if (monotonic(times)) {
    const values = times.map((time) => time - times[0]);
    return { mode: 'time', values, max: values[values.length - 1] };
  }
  const distances = track.points.map((point) => point.distance);
  if (monotonic(distances)) {
    const values = distances.map((distance) => distance - distances[0]);
    return { mode: 'distance', values, max: values[values.length - 1] };
  }
  // A stationary recording can still be cropped by its original point order.
  const values = track.points.map((_, index) => index);
  return { mode: 'points', values, max: Math.max(0, values.length - 1) };
}

export function isValidTrackTrimRange(track: GPXTrack, startIndex: number, endIndex: number): boolean {
  return Number.isInteger(startIndex) && Number.isInteger(endIndex)
    && startIndex >= 0 && endIndex < track.points.length && startIndex < endIndex;
}

/** Snap to recorded points and retain at least two consecutive points. */
export function trackTrimRangeForValues(axis: TrackTrimAxis, start: number, end: number): [number, number] {
  const nearest = (value: number) => {
    if (value <= 0) return 0;
    if (value >= axis.max) return axis.values.length - 1;
    let low = 0;
    let high = axis.values.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (axis.values[mid] < value) low = mid + 1;
      else high = mid;
    }
    return low > 0 && value - axis.values[low - 1] < axis.values[low] - value ? low - 1 : low;
  };
  const startIndex = Math.min(nearest(start), axis.values.length - 2);
  return [startIndex, Math.max(startIndex + 1, nearest(end))];
}

/** Slice one continuous interval; rebuild every derived statistic from it. */
export function trimTrack(track: GPXTrack, startIndex: number, endIndex: number): GPXTrack {
  if (!isValidTrackTrimRange(track, startIndex, endIndex)) {
    throw new RangeError('A trimmed track must contain at least two consecutive recorded points.');
  }
  const rebuilt = buildTrackFromRawPoints({
    idPrefix: 'track',
    name: track.name,
    rawPoints: track.points.slice(startIndex, endIndex + 1),
  });
  return {
    ...rebuilt,
    id: track.id,
    activityIcon: track.activityIcon,
    color: track.color,
    visible: track.visible,
  };
}
