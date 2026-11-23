const key = (import.meta.env.VITE_CARTO_BASEMAPS_KEY as string | undefined)?.trim();

// The basemap key is public in browser requests; restrict it to approved sites in CARTO.
export const CARTO_LABELS_TEMPLATE = key
  ? `https://basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`
  : undefined;
