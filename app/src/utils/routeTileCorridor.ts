/** Tiles intersecting a route and its immediate surroundings at a given zoom. */
export function routeTileCorridor(coordinates: number[][], zoom: number, radius = 1, maxTiles = Infinity): string[] {
  const size = 2 ** zoom;
  const keys = new Set<string>();
  let previous: [number, number] | null = null;
  const add = (x: number, y: number) => {
    const tx = Math.floor(x), ty = Math.floor(y);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tileY = ty + dy;
        if (tileY >= 0 && tileY < size && keys.size < maxTiles) keys.add(`${zoom}/${((tx + dx) % size + size) % size}/${tileY}`);
      }
    }
  };
  for (const coordinate of coordinates) {
    if (keys.size >= maxTiles) break;
    const [longitude, latitude] = coordinate;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) { previous = null; continue; }
    const lat = Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 180;
    const x = (((longitude + 180) / 360) % 1 + 1) % 1 * size;
    const y = (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * size;
    if (!previous) { add(x, y); previous = [x, y]; continue; }
    let dx = x - previous[0];
    if (dx > size / 2) dx -= size;
    if (dx < -size / 2) dx += size;
    const dy = y - previous[1];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    for (let step = 1; step <= steps && keys.size < maxTiles; step++) add(previous[0] + dx * step / steps, previous[1] + dy * step / steps);
    previous = [x, y];
  }
  return [...keys];
}
