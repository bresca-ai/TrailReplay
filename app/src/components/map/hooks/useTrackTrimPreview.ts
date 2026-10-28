import { useEffect, useMemo, type RefObject } from 'react';
import type { Map, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { useAppStore } from '@/store/useAppStore';
import type { GPXTrack } from '@/types';
import type { TrackTrimRange } from '@/utils/gpx/trimTrack';

const SOURCE = 'track-trim-preview';
const LAYERS = ['trim-original', 'trim-outline', 'trim-selected', 'trim-endpoints'];

export function buildTrackTrimPreviewData(track: GPXTrack, range: TrackTrimRange): FeatureCollection<LineString | Point> {
  const coordinates = track.points.map((point) => [point.lon, point.lat]);
  const selected = coordinates.slice(range.startIndex, range.endIndex + 1);
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { part: 'original' }, geometry: { type: 'LineString', coordinates } },
      { type: 'Feature', properties: { part: 'selected' }, geometry: { type: 'LineString', coordinates: selected } },
      { type: 'Feature', properties: { part: 'start' }, geometry: { type: 'Point', coordinates: selected[0] } },
      { type: 'Feature', properties: { part: 'end' }, geometry: { type: 'Point', coordinates: selected[selected.length - 1] } },
    ],
  };
}

export function useTrackTrimPreview(mapRef: RefObject<Map | null>, isMapLoaded: boolean) {
  const range = useAppStore((state) => state.trackTrimPreview);
  const track = useAppStore((state) => state.tracks.find((entry) => entry.id === state.trackTrimPreview?.trackId));
  const isExporting = useAppStore((state) => state.isExporting);
  const data = useMemo(() => track && range ? buildTrackTrimPreviewData(track, range) : null, [track, range]);
  const visible = Boolean(data) && !isExporting;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !visible) return;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const addLine = (id: string, part: string, color: string, width: number) => map.addLayer({
      id, type: 'line', source: SOURCE, filter: ['==', ['get', 'part'], part],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width },
    });
    addLine(LAYERS[0], 'original', '#64748b', 8);
    addLine(LAYERS[1], 'selected', '#ffffff', 10);
    addLine(LAYERS[2], 'selected', '#C1652F', 6);
    map.addLayer({
      id: LAYERS[3], type: 'circle', source: SOURCE,
      filter: ['in', ['get', 'part'], ['literal', ['start', 'end']]],
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'part'], 'start', '#16a34a', '#dc2626'],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
      },
    });
    return () => {
      [...LAYERS].reverse().forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [mapRef, isMapLoaded, visible]);

  useEffect(() => {
    if (!visible || !isMapLoaded || !data) return;
    const frame = requestAnimationFrame(() => {
      (mapRef.current?.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(data);
    });
    return () => cancelAnimationFrame(frame);
  }, [mapRef, isMapLoaded, visible, data]);
}
