import type { ExpressionSpecification } from 'maplibre-gl';
import type { TrailColorZone } from '@/types';
import { getHeartRateColor } from '@/utils/gpxParser';
import { calculateDistance, type SegmentTiming } from '@/utils/journeyUtils';
import { TRANSPORT_SEGMENT_COLOR } from '@/utils/trailColorFeatures';

export const PLAYBACK_PROGRESS_GLOBAL_STATE = 'trailReplayProgress';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

type ColorStop = { progress: number; color: string };

function cumulativeDistanceFractions(coordinates: number[][]): number[] {
  const distances = [0];
  for (let index = 1; index < coordinates.length; index++) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    distances.push(distances[index - 1] + calculateDistance(
      previous[1],
      previous[0],
      current[1],
      current[0],
    ));
  }

  const total = distances.at(-1) ?? 0;
  if (total <= 0) {
    const denominator = Math.max(1, coordinates.length - 1);
    return distances.map((_, index) => index / denominator);
  }
  return distances.map((distance) => distance / total);
}

function coordinateProgressToLineProgress(
  coordinateProgress: number,
  distanceFractions: readonly number[],
): number {
  const lastIndex = Math.max(0, distanceFractions.length - 1);
  const floatIndex = Math.max(0, Math.min(lastIndex, coordinateProgress * lastIndex));
  const lowerIndex = Math.floor(floatIndex);
  const upperIndex = Math.min(lastIndex, lowerIndex + 1);
  const fraction = floatIndex - lowerIndex;
  return distanceFractions[lowerIndex]
    + fraction * (distanceFractions[upperIndex] - distanceFractions[lowerIndex]);
}

function normalizeStops(stops: ColorStop[], fallbackColor: string): ColorStop[] {
  const sorted = stops
    .map((stop) => ({ ...stop, progress: Math.max(0, Math.min(1, stop.progress)) }))
    .sort((a, b) => a.progress - b.progress);
  const normalized: ColorStop[] = [];

  for (const stop of sorted) {
    const previous = normalized.at(-1);
    if (previous && Math.abs(previous.progress - stop.progress) < 1e-9) {
      previous.color = stop.color;
    } else if (!previous || previous.color !== stop.color) {
      normalized.push(stop);
    }
  }

  if (normalized.length === 0 || normalized[0].progress > 0) {
    normalized.unshift({ progress: 0, color: fallbackColor });
  }
  return normalized;
}

function segmentStops(
  segmentTimings: readonly Pick<SegmentTiming, 'startCoordIndex' | 'type' | 'color'>[],
  distanceFractions: readonly number[],
  fallbackColor: string,
): ColorStop[] {
  const lastIndex = Math.max(1, distanceFractions.length - 1);
  return segmentTimings.map((segment) => ({
    progress: coordinateProgressToLineProgress(segment.startCoordIndex / lastIndex, distanceFractions),
    color: segment.type === 'transport' ? TRANSPORT_SEGMENT_COLOR : segment.color || fallbackColor,
  }));
}

function heartRateStops(
  heartRatePoints: readonly { heartRate: number | null }[],
  distanceFractions: readonly number[],
  fallbackColor: string,
): ColorStop[] {
  return distanceFractions.map((progress, index) => {
    const heartRate = heartRatePoints[index]?.heartRate;
    return {
      progress,
      color: heartRate ? getHeartRateColor(heartRate, 180) : fallbackColor,
    };
  });
}

function zoneStops(
  colorZones: readonly TrailColorZone[],
  distanceFractions: readonly number[],
  fallbackColor: string,
): ColorStop[] {
  const stops: ColorStop[] = [{ progress: 0, color: fallbackColor }];
  let cursor = 0;

  for (const zone of [...colorZones]
    .filter((item) => item.fromProgress < item.toProgress)
    .sort((a, b) => a.fromProgress - b.fromProgress)) {
    if (zone.toProgress <= cursor || zone.fromProgress >= 1) continue;
    const start = Math.max(cursor, zone.fromProgress, 0);
    const end = Math.min(zone.toProgress, 1);
    stops.push({
      progress: coordinateProgressToLineProgress(start, distanceFractions),
      color: zone.color,
    });
    stops.push({
      progress: coordinateProgressToLineProgress(end, distanceFractions),
      color: fallbackColor,
    });
    cursor = end;
  }
  return stops;
}

export function buildPlaybackTrailGradient(params: {
  coordinates: number[][];
  colorMode: 'fixed' | 'heartRate' | 'zones';
  colorZones: readonly TrailColorZone[];
  fallbackColor: string;
  heartRatePoints: readonly { heartRate: number | null }[];
  segmentTimings: readonly Pick<SegmentTiming, 'startCoordIndex' | 'type' | 'color'>[];
}): ExpressionSpecification {
  const {
    coordinates,
    colorMode,
    colorZones,
    fallbackColor,
    heartRatePoints,
    segmentTimings,
  } = params;
  const distanceFractions = cumulativeDistanceFractions(coordinates);
  const rawStops = colorMode === 'heartRate'
    ? heartRateStops(heartRatePoints, distanceFractions, fallbackColor)
    : colorMode === 'zones'
      ? zoneStops(colorZones, distanceFractions, fallbackColor)
      : segmentStops(segmentTimings, distanceFractions, fallbackColor);
  const stops = normalizeStops(rawStops, fallbackColor);
  const colorRamp: unknown[] = ['step', ['line-progress'], stops[0].color];
  for (const stop of stops.slice(1)) {
    if (stop.progress > 0 && stop.progress < 1) {
      colorRamp.push(stop.progress, stop.color);
    }
  }

  return [
    'case',
    [
      '<=',
      ['line-progress'],
      ['coalesce', ['global-state', PLAYBACK_PROGRESS_GLOBAL_STATE], 0],
    ],
    colorRamp,
    TRANSPARENT,
  ] as unknown as ExpressionSpecification;
}
