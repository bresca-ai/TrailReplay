import { useEffect, useState, type MutableRefObject } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import maplibregl from 'maplibre-gl';
import type { LanguageCode, TextAnnotation, UnitSystem } from '@/types';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { convertElevation } from '@/utils/units';
import { drawAnnotationSymbol } from '@/components/annotations/annotationSymbol';
import {
  CARD_MIN_WIDTH,
  cardLayoutForMapWidth,
  wrapText,
  type CardLayout,
} from '@/components/map/annotationCardText';

const SOURCE_ID = 'route-annotations';
const ACTIVE_SOURCE_ID = 'route-annotations-active';
const MARKER_LAYER_ID = 'route-annotations-marker';
const HALO_LAYER_ID = 'route-annotations-halo';
const CARD_LAYER_ID = 'route-annotations-card';
const CARD_IMAGE_ID = 'route-annotations-card-image';

/**
 * Bottom to top, the order the annotation layers must keep.
 *
 * An annotation is the one thing on the map someone put there deliberately, so
 * it outranks anything the basemap or the landmark pins draw in the same place.
 */
export const ANNOTATION_LAYER_IDS = [HALO_LAYER_ID, MARKER_LAYER_ID, CARD_LAYER_ID];

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  if (expanded.length !== 6) {
    return `rgba(243, 177, 51, ${alpha})`;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function emptyFeatureCollection(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [],
  };
}

function buildAnnotationsFeatureCollection(
  annotations: TextAnnotation[],
  activeAnnotationId: string | null,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: annotations.map((annotation) => ({
      type: 'Feature',
      properties: {
        id: annotation.id,
        isActive: annotation.id === activeAnnotationId,
        color: annotation.color,
        haloColor: withAlpha(annotation.color, annotation.id === activeAnnotationId ? 0.24 : 0.16),
      },
      geometry: {
        type: 'Point',
        coordinates: [annotation.lon, annotation.lat],
      },
    })),
  };
}

function buildActiveAnnotationFeatureCollection(annotation: TextAnnotation | null): FeatureCollection<Point> {
  if (!annotation) {
    return emptyFeatureCollection();
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: annotation.id,
        },
        geometry: {
          type: 'Point',
          coordinates: [annotation.lon, annotation.lat],
        },
      },
    ],
  };
}

/**
 * A card sized to what it has to say, on the map it has to say it on.
 *
 * The card used to be a fixed 320x116 with everything past its width replaced
 * by an ellipsis. That is fine for a title someone types into a box while
 * watching it fit, and wrong for one taken from a source — "Avituallament 1 —
 * Collet de Barraques" and its list of contents both vanished into "…", which
 * is how an annotation can be in exactly the right place and still unreadable.
 */
function createAnnotationCardImage(
  annotation: TextAnnotation,
  unitSystem: UnitSystem,
  layout: CardLayout,
) {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;

  const titleFont = `700 ${layout.titleSize}px "JetBrains Mono", monospace`;
  const detailFont = `500 ${layout.detailSize}px "JetBrains Mono", monospace`;

  const title = annotation.title.trim() || 'Annotation';
  const detail = annotation.subtitle?.trim()
    || (annotation.elevation !== undefined
      ? `${Math.round(convertElevation(annotation.elevation, unitSystem)).toLocaleString()} ${unitSystem === 'metric' ? 'm' : 'ft'}`
      : `${Math.round(annotation.progress * 100)}%`);

  measure.font = titleFont;
  const titleWidth = measure.measureText(title).width;
  measure.font = detailFont;
  const detailWidth = measure.measureText(detail).width;

  const width = Math.round(Math.max(
    CARD_MIN_WIDTH,
    Math.min(layout.maxWidth, Math.max(titleWidth + 42, detailWidth) + layout.padding * 2),
  ));
  const textWidth = width - layout.padding * 2 - 42;

  measure.font = titleFont;
  const titleLines = wrapText(measure, title, textWidth, 2);
  measure.font = detailFont;
  const detailLines = detail ? wrapText(measure, detail, textWidth, 2) : [];

  const headerHeight = Math.round(layout.padding + titleLines.length * layout.titleLineHeight);
  const height = Math.round(headerHeight
    + (detailLines.length > 0 ? 9 + detailLines.length * layout.detailLineHeight : 0)
    + layout.padding);

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.scale(scale, scale);
  context.clearRect(0, 0, width, height);

  const drawText = (line: string, x: number, y: number) => {
    context.strokeStyle = 'rgba(4, 16, 15, 0.88)';
    context.lineWidth = 5;
    context.lineJoin = 'round';
    context.strokeText(line, x, y);
    context.fillText(line, x, y);
  };

  drawAnnotationSymbol(context, annotation.logo || 'map:pin', layout.padding + 18, layout.padding + 17, 30, annotation.color);
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#f8f6f0';
  context.font = titleFont;
  const titleTop = layout.padding + layout.titleLineHeight / 2;
  titleLines.forEach((line, index) => {
    drawText(line, layout.padding + 42, titleTop + index * layout.titleLineHeight);
  });

  context.fillStyle = annotation.color;
  context.font = detailFont;
  const detailTop = headerHeight + 9 + layout.detailLineHeight / 2;
  detailLines.forEach((line, index) => {
    drawText(line, layout.padding + 42, detailTop + index * layout.detailLineHeight);
  });

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function createLogoImage(annotation: TextAnnotation) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) return null;
  drawAnnotationSymbol(context, annotation.logo || 'map:pin', 80, 80, 90, annotation.color);
  return context.getImageData(0, 0, 160, 160);
}

interface UseTextAnnotationsLayerParams {
  activeAnnotationId: string | null;
  annotations: TextAnnotation[];
  isMapLoaded: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  unitSystem: UnitSystem;
  language: LanguageCode;
}

export function useTextAnnotationsLayer({
  activeAnnotationId,
  annotations,
  isMapLoaded,
  mapRef,
  unitSystem,
  language,
}: UseTextAnnotationsLayerParams) {
  // The card is sized for the map it sits on, so a resize has to redraw it.
  const [mapWidth, setMapWidth] = useState(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const readWidth = () => setMapWidth(map.getCanvas().clientWidth);
    readWidth();
    map.on('resize', readWidth);
    return () => { map.off('resize', readWidth); };
  }, [isMapLoaded, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      });
    }

    if (!map.getSource(ACTIVE_SOURCE_ID)) {
      map.addSource(ACTIVE_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      });
    }

    if (!map.getLayer(HALO_LAYER_ID)) {
      map.addLayer({
        id: HALO_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'isActive'], false], 14, 9],
          'circle-color': ['get', 'haloColor'],
          'circle-stroke-width': 0,
          'circle-pitch-alignment': 'map',
          'circle-opacity': ['case', ['boolean', ['get', 'isActive'], false], 1, 0.9],
        },
      });
    }

    if (!map.getLayer(MARKER_LAYER_ID)) {
      map.addLayer({
        id: MARKER_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'isActive'], false], 7, 5],
          'circle-color': '#101417',
          'circle-stroke-width': ['case', ['boolean', ['get', 'isActive'], false], 3, 2],
          'circle-stroke-color': ['get', 'color'],
          'circle-pitch-alignment': 'map',
          'circle-opacity': 1,
        },
      });
    }

    if (!map.getLayer(CARD_LAYER_ID)) {
      map.addLayer({
        id: CARD_LAYER_ID,
        type: 'symbol',
        source: ACTIVE_SOURCE_ID,
        layout: {
          'icon-image': CARD_IMAGE_ID,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-offset': [0, -18],
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 0.34,
            12, 0.4,
            14, 0.48,
            16, 0.56,
          ],
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
        },
        paint: {
          'icon-opacity': 1,
        },
      });
    }

    // Layers added after these — landmark pins and their labels — would
    // otherwise draw over the card, so put the annotations back on top.
    ANNOTATION_LAYER_IDS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    });

    const markerSource = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    markerSource?.setData(buildAnnotationsFeatureCollection(annotations, activeAnnotationId));

    const activeAnnotation = activeAnnotationId
      ? annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null
      : null;

    const activeSource = map.getSource(ACTIVE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    activeSource?.setData(buildActiveAnnotationFeatureCollection(activeAnnotation));

    if (activeAnnotation) {
      const layout = cardLayoutForMapWidth(mapWidth || map.getCanvas().clientWidth);
      const imageData = activeAnnotation.presentation === 'side-panel'
        ? createLogoImage(activeAnnotation)
        : createAnnotationCardImage(localizedAnnotation(activeAnnotation, language), unitSystem, layout);
      if (imageData) {
        // Cards are sized to their text, so consecutive ones differ. updateImage
        // only accepts identical dimensions, so a resize has to replace the
        // image rather than update it.
        const existing = map.getImage(CARD_IMAGE_ID);
        const sameSize = existing
          && existing.data.width === imageData.width
          && existing.data.height === imageData.height;

        if (sameSize) {
          map.updateImage(CARD_IMAGE_ID, imageData);
        } else {
          if (existing) map.removeImage(CARD_IMAGE_ID);
          map.addImage(CARD_IMAGE_ID, imageData);
        }
      }
    }

    return () => {
    };
  }, [
    activeAnnotationId,
    annotations,
    isMapLoaded,
    mapRef,
    mapWidth,
    unitSystem,
    language,
  ]);
}
