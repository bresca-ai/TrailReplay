import { calculateBearing } from './journeyUtils';

/** Heading of the actual painted trail segment under a marker, without looking ahead. */
export function markerRouteHeading(coordinates: number[][], position: readonly number[] | null): number | null {
  if (!position || coordinates.length < 2) return null;
  const longitudeScale = Math.cos(position[1] * Math.PI / 180);
  let bestDistance = Infinity;
  let best: [number[], number[]] | null = null;
  // Search backwards so an overlapping trail uses the most recently travelled segment.
  for (let i = coordinates.length - 2; i >= 0; i--) {
    const from = coordinates[i], to = coordinates[i + 1];
    const dx = (to[0] - from[0]) * longitudeScale, dy = to[1] - from[1];
    const lengthSquared = dx * dx + dy * dy;
    if (!Number.isFinite(lengthSquared) || lengthSquared < 1e-24) continue;
    const px = (position[0] - from[0]) * longitudeScale, py = position[1] - from[1];
    const fraction = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
    const distance = (px - fraction * dx) ** 2 + (py - fraction * dy) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = [from, to]; }
    if (distance < 1e-24) break;
  }
  return best ? calculateBearing({ lon: best[0][0], lat: best[0][1] }, { lon: best[1][0], lat: best[1][1] }) : null;
}
