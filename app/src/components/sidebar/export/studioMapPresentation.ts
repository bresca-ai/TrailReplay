import type { Map as MapLibreMap } from 'maplibre-gl';

/** Applies reversible, export-only raster quality settings. */
export function applyStudioMapPresentation(
  map: MapLibreMap,
): () => void {
  const restores: Array<() => void> = [];
  const layers = map.getStyle()?.layers ?? [];

  layers.forEach((layer) => {
    if (layer.type !== 'raster') return;
    try {
      const previous = map.getPaintProperty(layer.id, 'raster-fade-duration');
      map.setPaintProperty(layer.id, 'raster-fade-duration', 0);
      restores.push(() => {
        try {
          map.setPaintProperty(layer.id, 'raster-fade-duration', previous ?? undefined);
        } catch {
          // The layer can disappear if the basemap changes during export.
        }
      });
    } catch {
      // A custom raster layer may reject this paint property.
    }
  });

  return () => {
    restores.reverse().forEach((restore) => restore());
  };
}
