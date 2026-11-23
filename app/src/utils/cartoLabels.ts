const key = (import.meta.env.VITE_CARTO_BASEMAPS_KEY as string | undefined)?.trim();

// The basemap key is public in browser requests; restrict it to approved sites in CARTO.
export const CARTO_LABELS_TEMPLATE = key
  ? `https://basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`
  : undefined;

export function showCartoLabels(settings: { mapStyle: string; mapOverlays?: { placeLabels?: boolean } }): boolean {
  return !!CARTO_LABELS_TEMPLATE && (['street', 'topo', 'outdoor'].includes(settings.mapStyle)
    || (!!settings.mapOverlays?.placeLabels && settings.mapStyle !== 'mapbox-streets'));
}
