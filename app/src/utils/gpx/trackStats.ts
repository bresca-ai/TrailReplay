import type { GPXPoint, GPXTrack } from '@/types';
import { DEFAULT_ACTIVITY_ICON } from '@/utils/activityIcons';

export interface RawTrackPoint {
  lat: number;
  lon: number;
  elevation: number;
  time: Date | null;
  heartRate: number | null;
  cadence: number | null;
  power: number | null;
  temperature: number | null;
}

/**
 * Strava's documented minimum climb threshold for activities without strong
 * barometric data. This is deliberately conservative: it removes GPS noise
 * without throwing away a real climb that is sampled sparsely.
 */
export const DEFAULT_ELEVATION_THRESHOLD_METERS = 10;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Smooth short-lived altitude spikes, then only accept a climb/descent after
 * it has moved at least the configured threshold from the last accepted
 * elevation. This mirrors the important part of Strava's elevation policy:
 * small GPS oscillations should not become accumulated ascent.
 */
function filterElevations(elevations: number[], windowSize = 5): number[] {
  if (elevations.length < 3) return elevations;

  const radius = Math.floor(windowSize / 2);
  return elevations.map((_, index) => {
    const values: number[] = [];
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sourceIndex = Math.max(0, Math.min(elevations.length - 1, index + offset));
      values.push(elevations[sourceIndex]);
    }
    return median(values);
  });
}

export function calculateElevationGain(
  points: Array<{ elevation: number }>,
  upToIndex = points.length - 1,
  thresholdMeters = DEFAULT_ELEVATION_THRESHOLD_METERS,
): number {
  const endIndex = Math.min(upToIndex, points.length - 1);
  if (endIndex <= 0) return 0;

  const elevations = filterElevations(points.slice(0, endIndex + 1).map((point) => point.elevation));
  let gain = 0;
  let acceptedElevation = elevations[0];

  for (let index = 1; index < elevations.length; index += 1) {
    const difference = elevations[index] - acceptedElevation;
    if (difference >= thresholdMeters) {
      gain += difference;
      acceptedElevation = elevations[index];
    } else if (difference <= -thresholdMeters) {
      acceptedElevation = elevations[index];
    }
  }

  return gain;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadius = 6371000;
  const deltaLat = (lat2 - lat1) * Math.PI / 180;
  const deltaLon = (lon2 - lon1) * Math.PI / 180;
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadius * angularDistance;
}

export function createTrackId(prefix: 'track' | 'kml' | 'fit') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function buildTrackFromRawPoints(params: {
  idPrefix: 'track' | 'kml' | 'fit';
  name: string;
  rawPoints: RawTrackPoint[];
}): GPXTrack {
  const { idPrefix, name, rawPoints } = params;

  const trackPoints: GPXPoint[] = [];
  let totalDistance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;
  let maxSpeed = 0;
  let totalSpeed = 0;
  let speedCount = 0;
  let movingTime = 0;

  const bounds = {
    minLat: Infinity,
    maxLat: -Infinity,
    minLon: Infinity,
    maxLon: -Infinity,
  };

  for (const [index, rawPoint] of rawPoints.entries()) {
    const previousRawPoint = rawPoints[index - 1];
    const previousTrackPoint = trackPoints[index - 1];
    let distance = totalDistance;
    let speed = 0;

    bounds.minLat = Math.min(bounds.minLat, rawPoint.lat);
    bounds.maxLat = Math.max(bounds.maxLat, rawPoint.lat);
    bounds.minLon = Math.min(bounds.minLon, rawPoint.lon);
    bounds.maxLon = Math.max(bounds.maxLon, rawPoint.lon);

    if (previousRawPoint && previousTrackPoint) {
      const segmentDistance = calculateDistance(
        previousRawPoint.lat,
        previousRawPoint.lon,
        rawPoint.lat,
        rawPoint.lon
      );
      totalDistance += segmentDistance;
      distance = totalDistance;

      if (rawPoint.time && previousTrackPoint.time) {
        const timeDiffSeconds = (rawPoint.time.getTime() - previousTrackPoint.time.getTime()) / 1000;
        if (timeDiffSeconds > 0) {
          speed = (segmentDistance / timeDiffSeconds) * 3.6;
          maxSpeed = Math.max(maxSpeed, speed);
          if (speed > 0.5) {
            totalSpeed += speed;
            speedCount++;
            movingTime += timeDiffSeconds;
          }
        }
      }
    }

    maxElevation = Math.max(maxElevation, rawPoint.elevation);
    minElevation = Math.min(minElevation, rawPoint.elevation);

    trackPoints.push({
      lat: rawPoint.lat,
      lon: rawPoint.lon,
      elevation: rawPoint.elevation,
      time: rawPoint.time,
      heartRate: rawPoint.heartRate,
      cadence: rawPoint.cadence,
      power: rawPoint.power,
      temperature: rawPoint.temperature,
      distance,
      speed,
    });
  }

  elevationGain = calculateElevationGain(rawPoints);
  elevationLoss = calculateElevationGain(
    rawPoints.map((point) => ({ elevation: -point.elevation })),
  );

  let totalTime = 0;
  if (trackPoints.length > 1 && trackPoints[0].time && trackPoints[trackPoints.length - 1].time) {
    totalTime = (
      trackPoints[trackPoints.length - 1].time!.getTime() - trackPoints[0].time!.getTime()
    ) / 1000;
  }

  const avgSpeed = totalTime > 0 ? (totalDistance / 1000) / (totalTime / 3600) : 0;
  const avgMovingSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;

  return {
    id: createTrackId(idPrefix),
    name,
    activityIcon: DEFAULT_ACTIVITY_ICON,
    points: trackPoints,
    totalDistance,
    totalTime,
    movingTime,
    elevationGain,
    elevationLoss,
    maxElevation,
    minElevation,
    maxSpeed,
    avgSpeed,
    avgMovingSpeed,
    bounds,
    color: '#C1652F',
    visible: true,
  };
}
