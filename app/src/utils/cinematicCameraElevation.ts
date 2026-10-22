import { getInterpolatedRouteCoordinate } from '@/utils/replayCameraPlan';

// Fixed, symmetric Blackman taps: predictable work and no lag on a climb.
const HALF_TAPS = 6;
const WEIGHTS = Array.from({ length: HALF_TAPS + 1 }, (_, index) => {
  const angle = Math.PI * (1 - index / HALF_TAPS);
  return 0.42 - 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle);
});

/** Smooth height along the camera's planned path, rather than chasing height in time. */
export function getCinematicCenterElevation({
  coordinates,
  center,
  progress,
  halfWindow,
  maxDeviationMeters,
  readElevation,
}: {
  coordinates: number[][];
  center: [number, number];
  progress: number;
  halfWindow: number;
  maxDeviationMeters: number;
  readElevation: (position: [number, number]) => number | null;
}): number | null {
  const centerHeight = readElevation(center);
  if (centerHeight === null || !Number.isFinite(centerHeight)) return null;
  const last = coordinates.length - 1;
  const window = Math.max(0, Math.min(halfWindow, progress, 1 - progress));
  if (last < 1 || window === 0) return centerHeight;
  let sum = centerHeight;
  let weightSum = 1;
  for (let tap = 1; tap < HALF_TAPS; tap++) {
    const offset = window * tap / HALF_TAPS;
    const before = getInterpolatedRouteCoordinate(coordinates, (progress - offset) * last);
    const after = getInterpolatedRouteCoordinate(coordinates, (progress + offset) * last);
    if (!before || !after) continue;
    const a = readElevation(before);
    const b = readElevation(after);
    // Missing DEM tiles must not turn the symmetric average into a lagging one.
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const weight = WEIGHTS[tap];
    sum += (a + b) * weight;
    weightSum += 2 * weight;
  }
  const average = sum / weightSum;
  // Bound vertical reframing for close shots. The soft bound has no hard edge
  // to hit, and is inactive on constant gradients (average === centerHeight).
  const allowance = Math.max(1, maxDeviationMeters);
  return centerHeight + allowance * Math.tanh((average - centerHeight) / allowance);
}
