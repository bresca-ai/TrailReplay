import type { LayerSpecification } from 'maplibre-gl';
import {
  landmarkIconSizeExpression,
  landmarkLabelIconSizeExpression,
  landmarkTextOpacityExpression,
} from '@/components/map/landmarkSymbolStyle';

export const LANDMARK_SOURCE_ID = 'route-landmarks';
export const LANDMARK_ICON_LAYER_ID = 'route-landmarks-icon';
export const LANDMARK_EMOJI_LAYER_ID = 'route-landmarks-emoji';
export const LANDMARK_LABEL_LAYER_ID = 'route-landmarks-label';
export const LANDMARK_IMAGE_PREFIX = 'route-landmark-glyph-';
export const LANDMARK_LABEL_IMAGE_PREFIX = 'route-landmark-label-';

/**
 * Every landmark icon is drawn, always: overlap is allowed so collisions never
 * silently drop pins. Only labels yield to each other, through text-optional.
 */
export function landmarkIconLayer(scale: number): LayerSpecification {
  return {
    id: LANDMARK_ICON_LAYER_ID,
    type: 'symbol',
    source: LANDMARK_SOURCE_ID,
    filter: ['!=', ['get', 'emoji'], true],
    layout: {
      'icon-image': ['concat', LANDMARK_IMAGE_PREFIX, ['get', 'icon']],
      'icon-size': landmarkIconSizeExpression(scale),
      'icon-pitch-alignment': 'viewport',
      'icon-rotation-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'importance'],
    },
    paint: {
      'icon-color': ['get', 'color'],
      'icon-opacity': ['get', 'opacity'],
    },
  } as LayerSpecification;
}

/** Emoji sprites retain their native colours instead of using SDF tinting. */
export function landmarkEmojiLayer(scale: number): LayerSpecification {
  const icon = landmarkIconLayer(scale);
  return {
    ...icon,
    id: LANDMARK_EMOJI_LAYER_ID,
    filter: ['==', ['get', 'emoji'], true],
    paint: { 'icon-opacity': ['get', 'opacity'] },
  } as LayerSpecification;
}

export function landmarkLabelLayer(scale: number, labelFade: boolean): LayerSpecification {
  return {
    id: LANDMARK_LABEL_LAYER_ID,
    type: 'symbol',
    source: LANDMARK_SOURCE_ID,
    layout: {
      'icon-image': ['get', 'labelImageId'],
      'icon-size': landmarkLabelIconSizeExpression(scale),
      'icon-offset': [0, 18],
      'icon-anchor': 'top',
      'icon-pitch-alignment': 'viewport',
      'icon-rotation-alignment': 'viewport',
      // Labels, unlike icons, drop out when they cannot be placed without
      // overlapping — a wall of colliding names is worse than a missing one.
      'icon-optional': true,
      'symbol-sort-key': ['get', 'importance'],
    },
    paint: {
      'icon-opacity': landmarkTextOpacityExpression(labelFade),
    },
  } as LayerSpecification;
}
