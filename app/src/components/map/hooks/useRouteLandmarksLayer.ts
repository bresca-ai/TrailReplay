import { useEffect, type MutableRefObject } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import type { OverlayFont } from '@/types';
import type { RouteLandmark } from '@/types/landmarks';
import {
  landmarkIconSizeExpression,
  landmarkLabelIconSizeExpression,
  landmarkTextOpacityExpression,
} from '@/components/map/landmarkSymbolStyle';
import {
  LANDMARK_ICON_LAYER_ID,
  LANDMARK_IMAGE_PREFIX,
  LANDMARK_LABEL_IMAGE_PREFIX,
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
import { overlayCanvasFontFamily } from '@/utils/typography';

const SOURCE = LANDMARK_SOURCE_ID;
const ICON = LANDMARK_ICON_LAYER_ID;
const LABEL = LANDMARK_LABEL_LAYER_ID;
const IMAGE_PREFIX = LANDMARK_IMAGE_PREFIX;

function landmarkLabel(landmark: RouteLandmark) {
  return landmark.elevation && ['highest-point', 'high-point', 'summit'].includes(landmark.type)
    ? `${landmark.title}\n${Math.round(landmark.elevation).toLocaleString()} m`
    : landmark.title;
}

function labelImageId(landmark: RouteLandmark, overlayFont: OverlayFont) {
  const text = landmarkLabel(landmark);
  let hash = 0;
  for (let index = 0; index < text.length; index++) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  return `${LANDMARK_LABEL_IMAGE_PREFIX}${overlayFont}-${landmark.id}-${hash.toString(36)}`;
}

function labelImage(text: string, overlayFont: OverlayFont): ImageData | null {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const font = `700 12px ${overlayCanvasFontFamily(overlayFont)}`;
  context.font = font;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > 132) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  const textWidth = Math.max(1, ...lines.map((line) => context.measureText(line).width));
  const width = Math.ceil(Math.min(140, textWidth + 10));
  const height = Math.max(1, lines.length) * 15 + 8;
  canvas.width = width * 2;
  canvas.height = height * 2;
  context.scale(2, 2);
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.strokeStyle = '#030506';
  context.lineWidth = 3.5;
  context.fillStyle = '#ffffff';
  lines.forEach((line, index) => {
    const y = 4 + index * 15 + 7.5;
    context.strokeText(line, width / 2, y, width - 8);
    context.fillText(line, width / 2, y, width - 8);
  });
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function data(landmarks: RouteLandmark[], selectedId: string | null, overlayFont: OverlayFont): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: landmarks.map((landmark) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [landmark.lon, landmark.lat] },
    properties: {
      landmarkId: landmark.id,
      title: landmarkLabel(landmark),
      labelImageId: labelImageId(landmark, overlayFont),
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
  overlayFont: OverlayFont;
  landmarks: RouteLandmark[];
  mapRef: MutableRefObject<maplibregl.Map | null>;
  /** Called when a landmark icon or label is clicked on the map. */
  onSelectLandmark?: (landmarkId: string) => void;
  selectedLandmarkId?: string | null;
  /** Hide map labels while the opening camera establishes geographic context. */
  visible?: boolean;
}

export function shouldShowRouteLandmarks(
  phase: 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended',
): boolean {
  return phase !== 'preloading' && phase !== 'intro';
}

export function useRouteLandmarksLayer({
  isMapLoaded,
  labelFade = true,
  scale = 1,
  overlayFont,
  landmarks,
  mapRef,
  onSelectLandmark,
  selectedLandmarkId = null,
  visible = true,
}: UseRouteLandmarksLayerParams) {
  useEffect(() => {
    const map = mapRef.current; if (!map || !isMapLoaded) return;
    let cancelled = false;
    LANDMARK_GLYPH_KEYS.forEach((kind) => {
      const imageId = `${IMAGE_PREFIX}${kind}`;
      if (!map.hasImage(imageId)) map.addImage(imageId, glyphImage(kind), { sdf: true });
    });
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: data([], null, overlayFont) });
    // Pins go under the annotation card: a town name drawn over an annotation
    // hides the one label the viewer was meant to read.
    const beforeAnnotations = ANNOTATION_LAYER_IDS.find((layerId) => map.getLayer(layerId));
    if (!map.getLayer(ICON)) map.addLayer(landmarkIconLayer(scale), beforeAnnotations);
    if (!map.getLayer(LABEL)) map.addLayer(landmarkLabelLayer(scale, labelFade), beforeAnnotations);
    const updateLabels = async () => {
      try { await document.fonts.load(`700 12px ${overlayCanvasFontFamily(overlayFont)}`); } catch { /* Use the CSS fallback font. */ }
      if (cancelled || !map.getLayer(LABEL)) return;
      for (const landmark of landmarks) {
        const imageId = labelImageId(landmark, overlayFont);
        if (map.hasImage(imageId)) continue;
        const image = labelImage(landmarkLabel(landmark), overlayFont);
        if (image) map.addImage(imageId, image, { pixelRatio: 2 });
      }
      (map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(
        data(visible ? landmarks : [], selectedLandmarkId, overlayFont),
      );
    };
    void updateLabels();
    return () => { cancelled = true; };
  }, [isMapLoaded, labelFade, landmarks, mapRef, overlayFont, scale, selectedLandmarkId, visible]);

  // The layers are only added once, so size and fade changes have to be pushed
  // onto the existing layers rather than waiting for a re-add.
  useEffect(() => {
    const map = mapRef.current; if (!map || !isMapLoaded) return;
    if (map.getLayer(ICON)) {
      map.setLayoutProperty(ICON, 'icon-size', landmarkIconSizeExpression(scale));
    }
    if (map.getLayer(LABEL)) {
      map.setLayoutProperty(LABEL, 'icon-size', landmarkLabelIconSizeExpression(scale));
      map.setPaintProperty(LABEL, 'icon-opacity', landmarkTextOpacityExpression(labelFade));
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
