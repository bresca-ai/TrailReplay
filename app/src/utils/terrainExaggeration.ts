/** The terrain multiplier seen by both the map and camera planner. */
export function effectiveTerrainExaggeration(settings: {
  show3DTerrain: boolean;
  recordedElevationPrototype?: boolean;
  terrainExaggeration?: number;
}): number {
  if (!settings.show3DTerrain) return 0;
  if (settings.recordedElevationPrototype) return 1;
  const value = settings.terrainExaggeration;
  return Number.isFinite(value) ? Math.max(0.5, Math.min(3, value!)) : 1;
}
