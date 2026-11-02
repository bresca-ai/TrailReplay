/* The displayed state mirrors the imperative MapLibre source and its async lifecycle. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { LngLatBounds, LngLat, type Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { containsPosition, countryEmoji, loadRouteBoundaries, type LocationFeature } from '@/utils/locationBoundaries';
import type { LocationChapterSettings } from '@/types';
const SOURCE = 'location-chapter', FILL = 'location-chapter-fill', LINE = 'location-chapter-line';
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
export function useLocationChapters(mapRef: RefObject<MapLibreMap | null>, loaded: boolean, settings: LocationChapterSettings | undefined,
  coordinates: number[][], current: { lon: number; lat: number } | null, time: number, phase: string, cameraCanFollow = true) {
  const [features, setFeatures] = useState<LocationFeature[]>([]), [error, setError] = useState(false), [label, setLabel] = useState(''), [credit, setCredit] = useState(''), [loading, setLoading] = useState(false);
  const previous = useRef<{ id: string; start: number; feature: LocationFeature; target?: { lng: number; lat: number; zoom: number } } | null>(null);
  const candidate = useRef<{ id: string; since: number } | null>(null);
  const mode = settings?.level ?? 'off';
  useEffect(() => {
    let cancelled = false;
    setFeatures([]); setError(false); previous.current = null; candidate.current = null; setLabel(''); setCredit('');
    if (mode === 'off' || !coordinates.length) { setLoading(false); return; }
    setLoading(true);
    const stride = Math.max(1, Math.floor(coordinates.length / 5000));
    const samples = coordinates.filter((_, i) => i % stride === 0 || i === coordinates.length - 1) as Position[];
    loadRouteBoundaries(samples, mode).then(items => { if (!cancelled) { setFeatures(items); setError(items.length === 0); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [coordinates, mode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || mode === 'off') return;
    const ensure = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource(SOURCE)) { previous.current = null; map.addSource(SOURCE, { type: 'geojson', data: empty }); }
      if (!map.getLayer(FILL)) map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': '#ffbd66', 'fill-opacity': 0 } });
      if (!map.getLayer(LINE)) map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': '#ffbd66', 'line-width': 3, 'line-opacity': 0 } });
    };
    ensure(); map.on('styledata', ensure);
    return () => { map.off('styledata', ensure); if (map.getLayer(LINE)) map.removeLayer(LINE); if (map.getLayer(FILL)) map.removeLayer(FILL); if (map.getSource(SOURCE)) map.removeSource(SOURCE); };
  }, [loaded, mapRef, mode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getSource(SOURCE)) return;
    let active = mode !== 'off' && current && (phase === 'playing' || phase === 'intro')
      ? features.find(feature => containsPosition(feature, [current.lon, current.lat])) : undefined;
    if (previous.current && time < previous.current.start) { previous.current = null; candidate.current = null; }
    // Ignore brief boundary jitter; the first location is immediate.
    if (previous.current && phase === 'playing' && previous.current.id !== active?.properties.id) {
      const nextId = active?.properties.id ?? '';
      if (candidate.current?.id !== nextId || time < candidate.current.since) candidate.current = { id: nextId, since: time };
      if (time - candidate.current.since < 500) active = previous.current.feature;
      else candidate.current = null;
    } else candidate.current = null;
    if (!active) { if (previous.current) (map.getSource(SOURCE) as GeoJSONSource).setData(empty); previous.current = null; setLabel(''); setCredit(''); return; }
    if (previous.current?.id !== active.properties.id || time < previous.current.start) {
      const bounds = new LngLatBounds();
      const polygons = active.geometry.type === 'Polygon' ? [active.geometry.coordinates] : active.geometry.coordinates;
      // Frame only the landmass containing the route, not distant islands.
      const localPolygon = polygons.find(polygon => containsPosition({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: polygon } }, [current!.lon, current!.lat]));
      if (localPolygon) for (const ring of localPolygon) for (const point of ring) bounds.extend([point[0], point[1]]);
      let target: { lng: number; lat: number; zoom: number } | undefined;
      if (!bounds.isEmpty() && bounds.getEast() - bounds.getWest() < 180) {
        try {
          const camera = map.cameraForBounds(bounds, { padding: 40, maxZoom: 8 });
          if (camera?.center && typeof camera.zoom === 'number') { const center = LngLat.convert(camera.center); target = { lng: center.lng, lat: center.lat, zoom: camera.zoom }; }
        } catch { /* A very small viewport may not admit a fitted camera. */ }
      }
      previous.current = { id: active.properties.id, start: time, feature: active, target };
      (map.getSource(SOURCE) as GeoJSONSource).setData(active);
    }
    const age = Math.max(0, time - previous.current.start);
    const duration = Math.max(2000, Math.min(8000, (settings?.durationSeconds ?? 4.5) * 1000));
    const opacity = Math.min(1, age / 500, Math.max(0, (duration - age) / 800));
    const target = previous.current.target;
    if (settings?.zoomToPlace && cameraCanFollow && target && phase === 'playing' && age > 0 && age < duration) {
      const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
      const weight = Math.min(smooth(age / (duration * .3)), smooth((duration - age) / (duration * .3)));
      const center = map.getCenter();
      const deltaLng = ((target.lng - center.lng + 540) % 360) - 180;
      map.jumpTo({ center: [center.lng + deltaLng * weight, center.lat + (target.lat - center.lat) * weight],
        zoom: map.getZoom() + (Math.min(map.getZoom(), target.zoom) - map.getZoom()) * weight,
        pitch: map.getPitch() * (1 - weight) });
    }
    if (map.getLayer(LINE) && map.getLayer(FILL)) {
      map.setPaintProperty(LINE, 'line-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(LINE, 'line-width', settings?.width ?? 3);
      map.setPaintProperty(LINE, 'line-opacity', opacity);
      map.setPaintProperty(FILL, 'fill-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(FILL, 'fill-opacity', settings?.fill ? opacity * 0.18 : 0);
    }
    setCredit(opacity > 0 ? active.properties.credit : '');
    const flag = settings?.showFlag ? countryEmoji(active.properties.iso2) : '';
    setLabel(opacity > 0 && (settings?.showName || flag) ? `${flag} ${settings?.showName ? active.properties.name : ''}`.trim() : '');
  }, [cameraCanFollow, current, features, loaded, mapRef, mode, phase, settings, time]);
  return { label, error, credit, loading };
}
