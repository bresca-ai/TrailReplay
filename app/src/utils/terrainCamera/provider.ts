/** Shared by the visible map and offline agent analysis. */
export const TERRAIN_PROVIDER = {
  id: 'aws-terrarium',
  encoding: 'terrarium',
  tileUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  tileSize: 256,
  maxZoom: 15,
  exaggeration: 1.2,
  attributionUrl: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
} as const;

export function terrainTileUrl(z: number, x: number, y: number): string {
  return TERRAIN_PROVIDER.tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}
