import type * as maplibregl from 'maplibre-gl';

/**
 * Module-level reference to the active MapLibre map instance.
 * Set by TrailMap on init, cleared on unmount.
 * Used by ExportPanel to access map.getCanvas() and map.triggerRepaint()
 * without prop-drilling or Zustand DOM-node storage.
 */
export const mapGlobalRef: { current: maplibregl.Map | null } = { current: null };
