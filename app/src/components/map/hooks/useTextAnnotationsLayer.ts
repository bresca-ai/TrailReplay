import { useEffect, useState, useMemo, useRef, type MutableRefObject } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import type { LanguageCode, OverlayFont, TextAnnotation, UnitSystem } from '@/types';
import { getUpcomingAnnotationIndexes } from '@/utils/playbackAnnotations';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { needsPinheadIcons } from '@/components/annotations/annotationSymbol';
import { drawFieldNote } from '@/components/annotations/drawFieldNote';
import { usePinheadIcons } from '@/components/annotations/pinheadIcons';
import { getCropRegion } from '@/utils/crop';
import { overlayCanvasFontFamily } from '@/utils/typography';

const UPCOMING_SOURCE_ID = 'route-annotations-upcoming';
const UPCOMING_LAYER_ID = 'route-annotations-upcoming-pins';
const ACTIVE_SOURCE_ID = 'route-annotations-active';
const CARD_LAYER_ID = 'route-annotations-card';
const CARD_IMAGE_ID = 'route-annotations-card-image';

/**
 * Bottom to top, the order the annotation layers must keep.
 *
 * An annotation is the one thing on the map someone put there deliberately, so
 * it outranks anything the basemap or the landmark pins draw in the same place.
 */
export const ANNOTATION_LAYER_IDS = [UPCOMING_LAYER_ID, CARD_LAYER_ID];

function emptyFeatureCollection(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [],
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

interface UseTextAnnotationsLayerParams {
  activeAnnotationId: string | null;
  currentTime: number; totalDuration: number; phase: string; defaultLeadDuration: number;
  annotations: TextAnnotation[];
  isMapLoaded: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  unitSystem: UnitSystem;
  language: LanguageCode;
  overlayFont: OverlayFont;
  annotationMarkerScale: number;
  annotationTextScale: number;
  exportResolution?: { width: number; height: number };
}

export function useTextAnnotationsLayer({
  activeAnnotationId,
  currentTime, totalDuration, phase, defaultLeadDuration,
  annotations,
  isMapLoaded,
  mapRef,
  unitSystem,
  language,
  overlayFont,
  annotationMarkerScale,
  annotationTextScale,
  exportResolution,
}: UseTextAnnotationsLayerParams) {
  // The card is sized for the map it sits on, so a resize has to redraw it.
  const [mapWidth, setMapWidth] = useState(0);
  const upcomingImages = useRef<string[]>([]);
  const upcomingKey = getUpcomingAnnotationIndexes(annotations, currentTime, totalDuration, defaultLeadDuration, phase)
    .filter(index => annotations[index].id !== activeAnnotationId).join(',');
  const upcoming = useMemo(() => upcomingKey ? upcomingKey.split(',').map(index => annotations[Number(index)]) : [], [upcomingKey, annotations]);
  const [fontReady, setFontReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (document.fonts?.load) {
      void Promise.all([500, 600, 700].map(weight => document.fonts.load(`${weight} 16px ${overlayCanvasFontFamily('modern')}`)))
        .then(() => { if (!cancelled) setFontReady(value => value + 1); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);
  // A field note's map symbol may come from the Pinhead library, which loads
  // on demand; redraw once it arrives instead of keeping the fallback pin.
  const pinheadIcons = usePinheadIcons(needsPinheadIcons(
    annotations.map((annotation) => annotation.logo),
  ));

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
    if (!map.getSource(UPCOMING_SOURCE_ID)) map.addSource(UPCOMING_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
    if (!map.getLayer(UPCOMING_LAYER_ID)) map.addLayer({
      id: UPCOMING_LAYER_ID, type: 'symbol', source: UPCOMING_SOURCE_ID,
      layout: { 'icon-image': ['get', 'image'], 'icon-anchor': 'bottom-left', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport' },
    }, map.getLayer(CARD_LAYER_ID) ? CARD_LAYER_ID : undefined);
    const features: FeatureCollection<Point>['features'] = [];
    const imageIds: string[] = [];
    const canvas = map.getCanvas();
    const exportPixelRatio = exportResolution && canvas.clientWidth && canvas.clientHeight
      ? exportResolution.width / getCropRegion({ width: canvas.clientWidth, height: canvas.clientHeight }, exportResolution.width, exportResolution.height).cropW
      : undefined;
    const markerSize = Math.max(0.5, Math.min(2, annotationMarkerScale ?? 1));
    for (const [index, annotation] of upcoming.entries()) {
      const copy = { ...annotation, title: '', eyebrow: '', code: '', subtitle: '', meta: '', description: '' };
      const note = drawFieldNote(copy, overlayFont, Math.max(160, Math.min(500, (mapWidth || map.getCanvas().clientWidth) * 0.52)), 'pin', markerSize, 1, exportPixelRatio);
      const data = note?.canvas.getContext('2d')?.getImageData(0, 0, note.canvas.width, note.canvas.height);
      if (!note || !data) continue;
      const image = `route-annotation-upcoming-${index}`;
      if (map.getImage(image)) map.removeImage(image);
      map.addImage(image, data, { pixelRatio: note.resolution });
      map.setLayoutProperty(UPCOMING_LAYER_ID, 'icon-offset', [-note.anchorX, note.anchorBottom]);
      imageIds.push(image);
      features.push({ type: 'Feature', properties: { image }, geometry: { type: 'Point', coordinates: [annotation.lon, annotation.lat] } });
    }
    (map.getSource(UPCOMING_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    for (const image of upcomingImages.current) if (!imageIds.includes(image) && map.getImage(image)) map.removeImage(image);
    upcomingImages.current = imageIds;
  }, [mapRef, isMapLoaded, upcoming, mapWidth, overlayFont, annotationMarkerScale, pinheadIcons, exportResolution]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // Remove circle layers left by an older live style after hot reload.
    for (const layerId of ['route-annotations-halo', 'route-annotations-marker']) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    if (map.getSource('route-annotations')) map.removeSource('route-annotations');

    if (!map.getSource(ACTIVE_SOURCE_ID)) {
      map.addSource(ACTIVE_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      });
    }

    if (!map.getLayer(CARD_LAYER_ID)) {
      map.addLayer({
        id: CARD_LAYER_ID,
        type: 'symbol',
        source: ACTIVE_SOURCE_ID,
        layout: {
          'icon-image': CARD_IMAGE_ID,
          'icon-anchor': 'bottom-left',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-offset': [-29, 0],
          'icon-size': 1,
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

    const canvas = map.getCanvas();
    const exportPixelRatio = exportResolution && canvas.clientWidth && canvas.clientHeight
      ? exportResolution.width / getCropRegion({ width: canvas.clientWidth, height: canvas.clientHeight }, exportResolution.width, exportResolution.height).cropW
      : undefined;
    const markerSize = Math.max(0.5, Math.min(2, annotationMarkerScale ?? 1));
    const textSize = Math.max(0.5, Math.min(2, annotationTextScale ?? 1));
    map.setLayoutProperty(CARD_LAYER_ID, 'icon-size', 1);
    const activeAnnotation = activeAnnotationId
      ? annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null
      : null;

    const activeSource = map.getSource(ACTIVE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    const activeCopy = activeAnnotation ? localizedAnnotation(activeAnnotation, language) : null;
    if (activeCopy) {
      const isScreen = activeCopy.presentation !== 'side-panel';
      const mapCopy = isScreen ? { ...activeCopy, title: '', eyebrow: '', code: '', subtitle: '', meta: '', description: '' } : activeCopy;
      const note = drawFieldNote(mapCopy, overlayFont, Math.max(160, Math.min(500, (mapWidth || map.getCanvas().clientWidth) * 0.52)), isScreen ? 'pin' : 'all', markerSize, textSize, exportPixelRatio);
      const imageData = note?.canvas.getContext('2d')?.getImageData(0, 0, note.canvas.width, note.canvas.height);
      if (note && imageData) {
        if (map.getImage(CARD_IMAGE_ID)) map.removeImage(CARD_IMAGE_ID);
        map.addImage(CARD_IMAGE_ID, imageData, { pixelRatio: note.resolution });
        map.setLayoutProperty(CARD_LAYER_ID, 'icon-offset', [-note.anchorX, note.anchorBottom]);
      }
    }
    activeSource?.setData(buildActiveAnnotationFeatureCollection(activeAnnotation));

    return () => {
    };
  }, [
    activeAnnotationId,
    annotations,
    isMapLoaded,
    mapRef,
    mapWidth,
    overlayFont,
    pinheadIcons,
    fontReady,
    unitSystem,
    language,
      annotationMarkerScale,
  annotationTextScale,
    exportResolution,
  ]);
}
