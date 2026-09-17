import { useEffect, type MutableRefObject } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import type { RouteLandmark } from '@/types/landmarks';
import {
  landmarkIconSizeExpression,
  landmarkTextHaloWidth,
  landmarkTextOpacityExpression,
  landmarkTextSizeExpression,
} from '@/components/map/landmarkSymbolStyle';
import {
  LANDMARK_ICON_LAYER_ID,
  LANDMARK_IMAGE_PREFIX,
  LANDMARK_LABEL_LAYER_ID,
  LANDMARK_SOURCE_ID,
  landmarkIconLayer,
  landmarkLabelLayer,
} from '@/components/map/landmarkLayers';
import {
  LANDMARK_GLYPH_KEYS,
  PINHEAD_PATHS,
  colorForLandmark,
  glyphForLandmark,
} from '@/components/map/landmarkGlyphs';
import { ANNOTATION_LAYER_IDS } from '@/components/map/hooks/useTextAnnotationsLayer';

const SOURCE = LANDMARK_SOURCE_ID;
const ICON = LANDMARK_ICON_LAYER_ID;
const LABEL = LANDMARK_LABEL_LAYER_ID;
const IMAGE_PREFIX = LANDMARK_IMAGE_PREFIX;

function data(landmarks: RouteLandmark[], selectedId: string | null): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: landmarks.map((landmark) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [landmark.lon, landmark.lat] },
    properties: {
      landmarkId: landmark.id,
      title: landmark.elevation && ['highest-point', 'high-point', 'summit'].includes(landmark.type) ? `${landmark.title}\n${Math.round(landmark.elevation).toLocaleString()} m` : landmark.title,
      importance: landmark.importance,
      icon: glyphForLandmark(landmark),
      color: landmark.color ?? colorForLandmark(landmark),
      opacity: landmark.source === 'automatic' ? 0.92 : 1,
      selected: landmark.id === selectedId,
    },
  })) };
}

function glyphImage(kind: string) {
  const canvas = document.createElement('canvas'); canvas.width = 36; canvas.height = 36;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, 36, 36); context.fillStyle = '#ffffff';
  context.scale(2.4, 2.4);
  context.fill(new Path2D(PINHEAD_PATHS[kind] ?? PINHEAD_PATHS.pin));
  return context.getImageData(0, 0, 36, 36);
}

interface UseRouteLandmarksLayerParams {
  isMapLoaded: boolean;
  labelFade?: boolean;
  /** One control sizes both the pin and its label. */
  scale?: number;
  landmarks: RouteLandmark[];
  mapRef: MutableRefObject<maplibregl.Map | null>;
  /** Called when a landmark icon or label is clicked on the map. */
  onSelectLandmark?: (landmarkId: string) => void;
  selectedLandmarkId?: string | null;
}

export function useRouteLandmarksLayer({
  isMapLoaded,
  labelFade = true,
  scale = 1,
  landmarks,
  mapRef,
  onSelectLandmark,
  selectedLandmarkId = null,
}: UseRouteLandmarksLayerParams) {
  useEffect(() => {
    const map = mapRef.current; if (!map || !isMapLoaded) return;
    LANDMARK_GLYPH_KEYS.forEach((kind) => {
      const imageId = `${IMAGE_PREFIX}${kind}`;
      if (!map.hasImage(imageId)) map.addImage(imageId, glyphImage(kind), { sdf: true });
    });
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: data([], null) });
    // Pins go under the annotation card: a town name drawn over an annotation
    // hides the one label the viewer was meant to read.
    const beforeAnnotations = ANNOTATION_LAYER_IDS.find((layerId) => map.getLayer(layerId));
    if (!map.getLayer(ICON)) map.addLayer(landmarkIconLayer(scale), beforeAnnotations);
    if (!map.getLayer(LABEL)) map.addLayer(landmarkLabelLayer(scale, labelFade), beforeAnnotations);
    (map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(data(landmarks, selectedLandmarkId));
  }, [isMapLoaded, labelFade, landmarks, mapRef, scale, selectedLandmarkId]);

  // The layers are only added once, so size and fade changes have to be pushed
  // onto the existing layers rather than waiting for a re-add.
  useEffect(() => {
    const map = mapRef.current; if (!map || !isMapLoaded) return;
    if (map.getLayer(ICON)) {
      map.setLayoutProperty(ICON, 'icon-size', landmarkIconSizeExpression(scale));
    }
    if (map.getLayer(LABEL)) {
      map.setLayoutProperty(LABEL, 'text-size', landmarkTextSizeExpression(scale));
      map.setPaintProperty(LABEL, 'text-halo-width', landmarkTextHaloWidth(scale));
      map.setPaintProperty(LABEL, 'text-opacity', landmarkTextOpacityExpression(labelFade));
    }
  }, [isMapLoaded, labelFade, mapRef, scale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !onSelectLandmark) return;

    const handleClick = (event: maplibregl.MapLayerMouseEvent) => {
      const landmarkId = event.features?.[0]?.properties?.landmarkId;
      if (typeof landmarkId !== 'string') return;
      onSelectLandmark(landmarkId);
    };
    const showPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const clearPointer = () => { map.getCanvas().style.cursor = ''; };

    for (const layerId of [ICON, LABEL]) {
      map.on('click', layerId, handleClick);
      map.on('mouseenter', layerId, showPointer);
      map.on('mouseleave', layerId, clearPointer);
    }

    return () => {
      for (const layerId of [ICON, LABEL]) {
        map.off('click', layerId, handleClick);
        map.off('mouseenter', layerId, showPointer);
        map.off('mouseleave', layerId, clearPointer);
      }
    };
  }, [isMapLoaded, mapRef, onSelectLandmark]);
}
