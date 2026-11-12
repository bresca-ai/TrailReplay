/** A lightweight, north-up projection for the route inset. */
export function buildRouteOverviewGeometry(coordinates: number[][], width: number, height: number, padding = 18) {
  const valid = coordinates.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (!valid.length) return null;
  const referenceLon = valid[0][0];
  const averageLat = valid.reduce((sum, point) => sum + point[1], 0) / valid.length;
  const longitudeScale = Math.max(0.01, Math.cos(averageLat * Math.PI / 180));
  const unwrap = (lon: number) => referenceLon + ((((lon - referenceLon) + 540) % 360) - 180);
  const points = valid.map(([lon, lat]) => ({ x: unwrap(lon) * longitudeScale, y: -lat }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  const scale = Math.min((width - 2 * padding) / Math.max(1e-9, maxX - minX), (height - 2 * padding) / Math.max(1e-9, maxY - minY));
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const project = (lon: number, lat: number) => ({ x: width / 2 + (unwrap(lon) * longitudeScale - centerX) * scale, y: height / 2 + (-lat - centerY) * scale });
  const step = Math.max(1, Math.ceil(valid.length / 1000));
  const path = valid.filter((_, index) => index % step === 0 || index === valid.length - 1).map(([lon, lat]) => project(lon, lat));
  return { path, project };
}
