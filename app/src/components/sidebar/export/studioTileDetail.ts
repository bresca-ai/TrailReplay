/** MapLibre's tile zoom calculator receives projected camera distances. */
export type TileZoomCalculator = (zoom: number, distance2d: number, distanceZ: number, centerDistance: number, fov: number) => number;

/** Request up to one extra zoom level close to the camera target, tapering to
 * the normal budget for distant terrain. Do not amplify horizon requests. */
export function withStudioForegroundDetail(base: TileZoomCalculator): TileZoomCalculator {
  return (zoom, distance2d, distanceZ, centerDistance, fov) => {
    const distance = Math.hypot(distance2d, distanceZ);
    const ratio = centerDistance > 0 ? distance / centerDistance : Infinity;
    const weight = Math.max(0, Math.min(1, (1.8 - ratio) / 0.8));
    return base(zoom, distance2d, distanceZ, centerDistance, fov) + weight;
  };
}
