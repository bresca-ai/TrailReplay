import { useEffect, useMemo, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ComparisonTrack } from '@/types';
import type { GPXTrack } from '@/types';
import { buildRouteDivergences } from '@/utils/routeDivergence';
import { comparisonDistanceAtPrimary, getRouteComparisonPlan } from '@/utils/routeComparisonPlayback';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import { ANNOTATION_LAYER_IDS } from '@/components/map/hooks/useTextAnnotationsLayer';
import { COMPARISON_MARKER_BORDER, COMPARISON_MARKER_RADIUS } from '@/utils/comparisonMarker';
import {
  LANDMARK_ICON_LAYER_ID,
  LANDMARK_LABEL_LAYER_ID,
} from '@/components/map/landmarkLayers';
import {
  buildTrackTimeIndex,
  trackPositionAtTime,
  type TrackTimeIndex,
} from '@/utils/trackPositionAtTime';

interface UseComparisonTrackLayersParams {
  comparisonTracks: ComparisonTrack[];
  isMapLoaded: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  /**
   * Wall-clock time of the main marker's current position. When both it and
   * a comparison track carry timestamps, the comparison marker is placed
   * where that track actually was at this instant instead of at a matching
   * fraction of its own route.
   */
  currentTime: Date | null;
  comparisonMode: 'time' | 'route';
  comparisonThresholdMeters: number;
  primaryTrack?: GPXTrack | null;
  primaryDistance: number;
  sharedTrackIds: readonly string[];
}

function layerIds(trackId: string) {
  return {
    line: `comparison-trail-line-${trackId}`,
    completedLine: `comparison-trail-completed-${trackId}`,
    positionGlow: `comparison-position-glow-${trackId}`,
    label: `comparison-track-label-${trackId}`,
  };
}

function sourceIds(trackId: string) {
  return {
    trail: `comparison-trail-${trackId}`,
    completed: `comparison-trail-completed-${trackId}`,
    position: `comparison-position-${trackId}`,
    label: `comparison-track-label-${trackId}`,
  };
}

function removeTrackLayers(map: maplibregl.Map, trackId: string) {
  const layers = { ...layerIds(trackId), divergence: `comparison-divergence-${trackId}`, divergencePoint: `comparison-divergence-point-${trackId}` };
  const sources = { ...sourceIds(trackId), divergence: `comparison-divergence-${trackId}` };
  Object.values(layers).forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  Object.values(sources).forEach((sourceId) => {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  });
}

export function useComparisonTrackLayers({
  comparisonTracks,
  isMapLoaded,
  mapRef,
  currentTime,
  comparisonMode,
  comparisonThresholdMeters,
  primaryTrack,
  primaryDistance,
  sharedTrackIds,
}: UseComparisonTrackLayersParams) {
  const hasCurrentTime = currentTime !== null;
  const timeIndexes = useMemo(() => {
    const indexes = new Map<string, TrackTimeIndex | null>();
    comparisonTracks.forEach((comparisonTrack) => {
      indexes.set(comparisonTrack.id, buildTrackTimeIndex(comparisonTrack.track));
    });
    return indexes;
  }, [comparisonTracks]);

  const divergenceByTrack = useMemo(() => {
    const result = new Map<string, GeoJSON.FeatureCollection>();
    if (comparisonMode !== 'route' || !primaryTrack?.points.length) return result;
    for (const track of comparisonTracks) {
      result.set(track.id, buildRouteDivergences(primaryTrack.points, track.track.points, comparisonThresholdMeters));
    }
    return result;
  }, [comparisonMode, comparisonTracks, primaryTrack, comparisonThresholdMeters]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current;

    comparisonTracks.forEach((comparisonTrack) => {
      const sources = sourceIds(comparisonTrack.id);
      const layers = layerIds(comparisonTrack.id);
      const coords = comparisonTrack.track.points.map((point) => [point.lon, point.lat]);
      const beforeAnnotations = [
        LANDMARK_ICON_LAYER_ID,
        LANDMARK_LABEL_LAYER_ID,
        ...ANNOTATION_LAYER_IDS,
      ].find((layerId) => map.getLayer(layerId));

      map.addSource(sources.trail, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({
        id: layers.line,
        type: 'line',
        source: sources.trail,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': comparisonTrack.color, 'line-width': 4, 'line-opacity': 0.5 },
      }, beforeAnnotations);
      map.addSource(`comparison-divergence-${comparisonTrack.id}`, {
        type: 'geojson', data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: `comparison-divergence-${comparisonTrack.id}`, type: 'line', source: `comparison-divergence-${comparisonTrack.id}`,
        paint: { 'line-color': '#ef4444', 'line-width': 5, 'line-opacity': 0.95 },
      }, beforeAnnotations);
      map.addLayer({
        id: `comparison-divergence-point-${comparisonTrack.id}`, type: 'circle', source: `comparison-divergence-${comparisonTrack.id}`,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      }, beforeAnnotations);

      map.addSource(sources.completed, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: layers.completedLine,
        type: 'line',
        source: sources.completed,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': comparisonTrack.color, 'line-width': 6 },
      }, beforeAnnotations);

      map.addSource(sources.position, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { active: true },
          geometry: { type: 'Point', coordinates: coords[0] || [0, 0] },
        },
      });
      map.addLayer({
        id: layers.positionGlow,
        type: 'circle',
        source: sources.position,
        paint: {
          'circle-radius': COMPARISON_MARKER_RADIUS,
          'circle-pitch-scale': 'viewport',
          'circle-pitch-alignment': 'viewport',
          'circle-color': comparisonTrack.color,
          // Dimmed while parked at the start or finish, so a marker waiting
          // for its own start time doesn't read as a stuck marker.
          'circle-opacity': ['case', ['get', 'shared'], 0, ['get', 'active'], 0.95, 0.2],
          'circle-stroke-width': COMPARISON_MARKER_BORDER,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-opacity': ['case', ['get', 'shared'], 0, ['get', 'active'], 1, 0.35],
        },
      }, beforeAnnotations);

      map.addSource(sources.label, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { label: comparisonTrack.name, active: true },
          geometry: { type: 'Point', coordinates: coords[0] || [0, 0] },
        },
      });
      map.addLayer({
        id: layers.label,
        type: 'symbol',
        source: sources.label,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -2],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': comparisonTrack.color,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2,
          'text-opacity': ['case', ['get', 'shared'], 0, ['get', 'active'], 1, 0.45],
        },
      }, beforeAnnotations);
    });

    return () => {
      comparisonTracks.forEach((track) => removeTrackLayers(map, track.id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonTracks.map((t) => `${t.id}:${t.color}:${t.name}`).join(','), isMapLoaded, mapRef, timeIndexes]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current;
    comparisonTracks.forEach((track) => {
      const routeActive = comparisonMode === 'route' && (!track.groupId || track.groupId === primaryTrack?.id);
      const markerVisible = track.visible && (routeActive || (comparisonMode === 'time' && !!timeIndexes.get(track.id) && hasCurrentTime));
      for (const layerId of [
        `comparison-trail-completed-${track.id}`,
        `comparison-position-glow-${track.id}`,
        `comparison-track-label-${track.id}`,
      ]) {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', markerVisible ? 'visible' : 'none');
      }
      if (map.getLayer(layerIds(track.id).line)) map.setLayoutProperty(layerIds(track.id).line, 'visibility', track.visible ? 'visible' : 'none');
      if (map.getLayer(`comparison-divergence-${track.id}`)) map.setLayoutProperty(`comparison-divergence-${track.id}`, 'visibility', track.visible && routeActive ? 'visible' : 'none');
      if (map.getLayer(`comparison-divergence-point-${track.id}`)) map.setLayoutProperty(`comparison-divergence-point-${track.id}`, 'visibility', track.visible && routeActive ? 'visible' : 'none');
      const source = mapRef.current?.getSource(`comparison-divergence-${track.id}`) as maplibregl.GeoJSONSource | undefined;
      source?.setData(divergenceByTrack.get(track.id) ?? { type: 'FeatureCollection', features: [] });
    });
  }, [comparisonTracks, comparisonMode, divergenceByTrack, isMapLoaded, mapRef, primaryTrack, timeIndexes, hasCurrentTime]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current;

    const atMs = currentTime ? currentTime.getTime() : null;

    comparisonTracks.forEach((comparisonTrack) => {
      if (!comparisonTrack.visible) return;

      const points = comparisonTrack.track.points;
      if (points.length === 0) return;

      const sources = sourceIds(comparisonTrack.id);
      const timeIndex = timeIndexes.get(comparisonTrack.id) ?? null;

      let position;
      if (comparisonMode === 'route' && primaryTrack) {
        if (comparisonTrack.groupId && comparisonTrack.groupId !== primaryTrack.id) return;
        const plan = getRouteComparisonPlan(primaryTrack, comparisonTrack.track, comparisonThresholdMeters);
        const point = interpolateTrackPoint(comparisonTrack.track, comparisonDistanceAtPrimary(plan, primaryDistance));
        if (!point) return;
        position = { ...point, state: 'during' };
      } else {
        if (atMs === null || !timeIndex) return;
        position = trackPositionAtTime(comparisonTrack.track, timeIndex, atMs);
      }
      const currentCoord: [number, number] = [position.lon, position.lat];
      const targetDistance = position.distance;
      const isActive = position.state === 'during';

      const completed: number[][] = [];
      for (const currentPoint of points) {
        if (currentPoint.distance <= targetDistance) {
          completed.push([currentPoint.lon, currentPoint.lat]);
        } else {
          break;
        }
      }
      if (completed.length === 0 || completed.at(-1)?.[0] !== currentCoord[0] || completed.at(-1)?.[1] !== currentCoord[1]) completed.push(currentCoord);
      if (completed.length === 1) completed.push(currentCoord);

      if (map.getSource(sources.completed) && completed.length > 1) {
        (map.getSource(sources.completed) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: completed },
        });
      }

      if (map.getSource(sources.position)) {
        (map.getSource(sources.position) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: { active: isActive, shared: comparisonMode === 'route' && sharedTrackIds.includes(comparisonTrack.id) },
          geometry: { type: 'Point', coordinates: currentCoord },
        });
      }

      if (map.getSource(sources.label)) {
        (map.getSource(sources.label) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: { label: comparisonTrack.name, active: isActive, shared: comparisonMode === 'route' && sharedTrackIds.includes(comparisonTrack.id) },
          geometry: { type: 'Point', coordinates: currentCoord },
        });
      }
    });
  }, [comparisonTracks, currentTime, isMapLoaded, mapRef, timeIndexes, comparisonMode, primaryTrack, primaryDistance, sharedTrackIds, comparisonThresholdMeters]);
}
