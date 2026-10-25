import type { SkySpecification } from 'maplibre-gl';

export const DEFAULT_SKY_COLOR = '#87CEEB';

// Paint the sky in MapLibre's own canvas so navigation, covers and every export
// share the same opaque background. Keep distant terrain free of added fog.
export const DEFAULT_MAP_SKY = {
  'sky-color': DEFAULT_SKY_COLOR,
  'horizon-color': DEFAULT_SKY_COLOR,
  'fog-color': DEFAULT_SKY_COLOR,
  'sky-horizon-blend': 0,
  'fog-ground-blend': 1,
  'atmosphere-blend': 0,
} satisfies SkySpecification;
