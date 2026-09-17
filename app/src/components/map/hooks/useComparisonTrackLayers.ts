import { useEffect, useMemo, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ComparisonTrack } from '@/types';
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
  const layers = layerIds(trackId);
  const sources = sourceIds(trackId);
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
}: UseComparisonTrackLayersParams) {
  const timeIndexes = useMemo(() => {
    const indexes = new Map<string, TrackTimeIndex | null>();
    comparisonTracks.forEach((comparisonTrack) => {
      indexes.set(comparisonTrack.id, buildTrackTimeIndex(comparisonTrack.track));
    });
    return indexes;
  }, [comparisonTracks]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current;

    comparisonTracks.forEach((comparisonTrack) => {
      const sources = sourceIds(comparisonTrack.id);
      const layers = layerIds(comparisonTrack.id);
      const coords = comparisonTrack.track.points.map((point) => [point.lon, point.lat]);

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
      });

      // A track with no timestamps gets its route drawn and nothing else:
      // there is no moment to put a marker at, and a marker frozen at the
      // start line would only read as a broken one.
      if (!timeIndexes.get(comparisonTrack.id)) return;

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
      });

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
          'circle-radius': 8,
          'circle-color': comparisonTrack.color,
          // Dimmed while parked at the start or finish, so a marker waiting
          // for its own start time doesn't read as a stuck marker.
          'circle-opacity': ['case', ['get', 'active'], 0.6, 0.2],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-opacity': ['case', ['get', 'active'], 1, 0.35],
        },
      });

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
          'text-opacity': ['case', ['get', 'active'], 1, 0.45],
        },
      });
    });

    return () => {
      comparisonTracks.forEach((track) => removeTrackLayers(map, track.id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonTracks.map((t) => `${t.id}:${t.color}:${t.name}`).join(','), isMapLoaded, mapRef, timeIndexes]);

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

      // No shared clock, no honest answer to "where was this person now".
      // The route stays drawn, but nothing pretends to move along it.
      if (atMs === null || !timeIndex) return;

      const position = trackPositionAtTime(comparisonTrack.track, timeIndex, atMs);
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
          properties: { active: isActive },
          geometry: { type: 'Point', coordinates: currentCoord },
        });
      }

      if (map.getSource(sources.label)) {
        (map.getSource(sources.label) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: { label: comparisonTrack.name, active: isActive },
          geometry: { type: 'Point', coordinates: currentCoord },
        });
      }
    });
  }, [comparisonTracks, currentTime, isMapLoaded, mapRef, timeIndexes]);
}
