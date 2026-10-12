import type { RouteLandmark } from '@/types/landmarks';
import { calculateDistance } from '@/utils/journeyUtils';

export interface RouteElevationPoint { lat: number; lon: number; elevation?: number; distance?: number; progress?: number }
interface ProfilePoint extends Required<Pick<RouteElevationPoint, 'lat' | 'lon'>> { elevation: number; distance: number; progress: number; smoothedElevation: number }

const MIN_ROUTE_DISTANCE = 5_000;
const PEAK_PROMINENCE = 100;
const PEAK_SPACING = 1_500;

function validElevation(value: number | undefined): value is number { return Number.isFinite(value) && value !== 0; }
function elevationLabel(elevation: number) { return `${Math.round(elevation).toLocaleString()} m`; }

export function buildRouteElevationProfile(points: RouteElevationPoint[]): ProfilePoint[] {
  if (points.length < 2) return [];
  let distance = 0;
  const raw = points.map((point, index) => {
    if (index > 0) distance += point.distance !== undefined
      ? Math.max(0, point.distance - (points[index - 1].distance ?? 0))
      : calculateDistance(points[index - 1].lat, points[index - 1].lon, point.lat, point.lon) * 1000;
    return { ...point, distance, progress: point.progress ?? 0, elevation: point.elevation ?? Number.NaN };
  });
  const totalDistance = raw.at(-1)?.distance ?? 0;
  let windowStartIndex = 0;
  let windowEndIndex = 0;
  let elevationSum = 0;
  let elevationCount = 0;

  return raw.map((point, index) => {
    const windowStart = point.distance - 120;
    const windowEnd = point.distance + 120;

    while (windowEndIndex < raw.length && raw[windowEndIndex].distance <= windowEnd) {
      const elevation = raw[windowEndIndex].elevation;
      if (validElevation(elevation)) {
        elevationSum += elevation;
        elevationCount += 1;
      }
      windowEndIndex += 1;
    }
    while (windowStartIndex < windowEndIndex && raw[windowStartIndex].distance < windowStart) {
      const elevation = raw[windowStartIndex].elevation;
      if (validElevation(elevation)) {
        elevationSum -= elevation;
        elevationCount -= 1;
      }
      windowStartIndex += 1;
    }

    return {
      lat: point.lat, lon: point.lon, elevation: point.elevation, distance: point.distance,
      progress: point.progress || (totalDistance ? point.distance / totalDistance : index / (raw.length - 1)),
      smoothedElevation: elevationCount > 0 ? elevationSum / elevationCount : Number.NaN,
    };
  });
}

function getLocalElevationRanges(points: ProfilePoint[], radius: number) {
  const ranges: Array<{ min: number; max: number }> = [];
  const minDeque: number[] = [];
  const maxDeque: number[] = [];
  let minHead = 0;
  let maxHead = 0;
  let left = 0;
  let right = 0;

  for (const point of points) {
    const windowStart = point.distance - radius;
    const windowEnd = point.distance + radius;

    while (right < points.length && points[right].distance <= windowEnd) {
      while (
        minDeque.length > minHead
        && points[minDeque[minDeque.length - 1]].smoothedElevation >= points[right].smoothedElevation
      ) minDeque.pop();
      while (
        maxDeque.length > maxHead
        && points[maxDeque[maxDeque.length - 1]].smoothedElevation <= points[right].smoothedElevation
      ) maxDeque.pop();
      minDeque.push(right);
      maxDeque.push(right);
      right += 1;
    }

    while (left < right && points[left].distance < windowStart) {
      if (minDeque[minHead] === left) minHead += 1;
      if (maxDeque[maxHead] === left) maxHead += 1;
      left += 1;
    }

    ranges.push({
      min: points[minDeque[minHead]].smoothedElevation,
      max: points[maxDeque[maxHead]].smoothedElevation,
    });
  }

  return ranges;
}

function landmark(id: string, type: RouteLandmark['type'], point: ProfilePoint, title: string, subtitle: string | undefined, importance: RouteLandmark['importance'], generatedKind?: NonNullable<RouteLandmark['metadata']>['generatedKind']): RouteLandmark {
  return { id, type, source: 'automatic', display: 'subtle', lat: point.lat, lon: point.lon, progress: point.progress, elevation: point.elevation, title, subtitle, importance, routeDistanceMeters: point.distance, metadata: generatedKind ? { generatedKind } : undefined };
}

export function analyzeRouteLandmarks(points: RouteElevationPoint[]): RouteLandmark[] {
  const profile = buildRouteElevationProfile(points);
  if (profile.length < 2) return [];
  const totalDistance = profile.at(-1)?.distance ?? 0;
  const result: RouteLandmark[] = [];
  const elevated = profile.filter((point) => validElevation(point.smoothedElevation));
  const elevationRange = elevated.reduce(
    (current, point) => ({
      min: Math.min(current.min, point.smoothedElevation),
      max: Math.max(current.max, point.smoothedElevation),
    }),
    { min: Infinity, max: -Infinity },
  );
  const range = elevated.length ? elevationRange.max - elevationRange.min : 0;
  if (elevated.length && range >= 30) {
    const high = elevated.reduce((best, point) => point.smoothedElevation > best.smoothedElevation ? point : best);
    result.push(landmark('automatic-highest-point', 'highest-point', high, 'Highest point', elevationLabel(high.smoothedElevation), 5, 'local-maximum'));
    const localRanges = getLocalElevationRanges(elevated, 750);
    const localPeaks = elevated.filter((point, index) => {
      const localRange = localRanges[index];
      return index > 0 && index < elevated.length - 1
        && point.smoothedElevation === localRange.max
        && high.smoothedElevation - localRange.min >= PEAK_PROMINENCE;
    });
    for (const peak of localPeaks.sort((a, b) => b.smoothedElevation - a.smoothedElevation)) {
      if (result.filter((entry) => entry.type === 'high-point' || entry.type === 'highest-point').some((entry) => Math.abs((entry.routeDistanceMeters ?? 0) - peak.distance) < PEAK_SPACING)) continue;
      if (result.filter((entry) => entry.type === 'high-point').length >= 3) break;
      result.push(landmark(`automatic-peak-${Math.round(peak.distance)}`, 'high-point', peak, 'High point', elevationLabel(peak.smoothedElevation), 3, 'local-maximum'));
    }
    let bestClimb: { start: ProfilePoint; end: ProfilePoint; gain: number } | null = null;
    let bestDescent: { start: ProfilePoint; end: ProfilePoint; loss: number } | null = null;
    for (let startIndex = 0; startIndex < elevated.length; startIndex++) for (let endIndex = startIndex + 1; endIndex < elevated.length; endIndex++) {
      const start = elevated[startIndex]; const end = elevated[endIndex]; const length = end.distance - start.distance;
      if (length < 500 || length > 12_000) continue;
      const change = end.smoothedElevation - start.smoothedElevation;
      if (change >= 120 && change / length >= 0.04 && (!bestClimb || change > bestClimb.gain)) bestClimb = { start, end, gain: change };
      if (change <= -120 && -change / length >= 0.04 && (!bestDescent || -change > bestDescent.loss)) bestDescent = { start, end, loss: -change };
    }
    if (bestClimb) result.push(landmark('automatic-longest-climb', 'longest-climb', bestClimb.end, 'Longest climb', `+${Math.round(bestClimb.gain)} m`, 4, 'longest-climb'));
    if (bestDescent) result.push(landmark('automatic-major-descent', 'major-descent', bestDescent.end, 'Major descent', `−${Math.round(bestDescent.loss)} m`, 3, 'major-descent'));
  }
  if (totalDistance >= MIN_ROUTE_DISTANCE) {
    const halfway = profile.reduce((best, point) => Math.abs(point.distance - totalDistance / 2) < Math.abs(best.distance - totalDistance / 2) ? point : best);
    result.push(landmark('automatic-halfway', 'halfway', halfway, 'Halfway', undefined, 3, 'halfway'));
  }
  const finish = profile.at(-1)!;
  result.push(landmark('automatic-finish', 'finish', finish, 'Finish', undefined, 4));
  return result;
}
