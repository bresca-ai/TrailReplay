import type { GPXPoint, GPXTrack } from '@/types';
import { DEFAULT_ACTIVITY_ICON } from '@/utils/activityIcons';
import { calculateElevationGain, calculateElevationLoss } from './elevationGain';
export { calculateElevationGain, calculateElevationLoss, DEFAULT_ELEVATION_THRESHOLD_METERS } from './elevationGain';

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

/** Intervals at or below this speed are excluded from moving time. */
export const MOVING_SPEED_THRESHOLD_KMH = 0.5;

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
          if (speed > MOVING_SPEED_THRESHOLD_KMH) {
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

  const elevationGain = calculateElevationGain(trackPoints);
  const elevationLoss = calculateElevationLoss(trackPoints);

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
