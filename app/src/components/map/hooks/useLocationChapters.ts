/* The displayed state mirrors the imperative MapLibre source and its async lifecycle. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { LngLatBounds, LngLat, type Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { containsPosition, countryEmoji, loadRouteBoundaries, type LocationFeature } from '@/utils/locationBoundaries';
import type { LocationChapterSettings } from '@/types';
import { INTRO_DURATION } from '@/components/playback/PlaybackProvider';
import { locationChapterIntroCameraRef } from '@/utils/locationChapterCamera';
const SOURCE = 'location-chapter', FILL = 'location-chapter-fill', GLOW = 'location-chapter-glow', LINE = 'location-chapter-line';
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
type PlaceCamera = { center: [number, number]; zoom: number; pitch: number; bearing: number };
function cameraForPlace(map: MapLibreMap, feature: LocationFeature, point: Position): PlaceCamera | undefined {
  const bounds = new LngLatBounds();
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  // Distant islands should not shrink the part of the place containing the trip.
  const localPolygon = polygons.find(polygon => containsPosition({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: polygon } }, point));
  if (localPolygon) for (const ring of localPolygon) for (const coordinate of ring) bounds.extend([coordinate[0], coordinate[1]]);
  if (bounds.isEmpty() || bounds.getEast() - bounds.getWest() >= 180) return undefined;
  try {
    const camera = map.cameraForBounds(bounds, { padding: 40, maxZoom: 8, pitch: 0, bearing: 0 });
    if (camera?.center && typeof camera.zoom === 'number') {
      const center = LngLat.convert(camera.center);
      return { center: [center.lng, center.lat], zoom: camera.zoom, pitch: 0, bearing: 0 };
    }
  } catch { /* A very small viewport may not admit a fitted camera. */ }
  return undefined;
}
export function useLocationChapters(mapRef: RefObject<MapLibreMap | null>, loaded: boolean, settings: LocationChapterSettings | undefined,
  coordinates: number[][], current: { lon: number; lat: number } | null, time: number, phase: string) {
  const [features, setFeatures] = useState<LocationFeature[]>([]), [error, setError] = useState(false), [label, setLabel] = useState(''), [credit, setCredit] = useState(''), [loading, setLoading] = useState(false);
  const [layerRevision, setLayerRevision] = useState(0);
  const previous = useRef<{ id: string; start: number; feature: LocationFeature; startedInIntro: boolean } | null>(null);
  const candidate = useRef<{ id: string; since: number } | null>(null);
  const mode = settings?.level ?? 'off';
  const [introResult, setIntroResult] = useState<{ features: LocationFeature[]; coordinates: number[][]; mode: string; enabled: boolean; camera?: PlaceCamera }>();
  const introCurrent = introResult?.features === features && introResult.coordinates === coordinates && introResult.mode === mode && introResult.enabled === Boolean(settings?.zoomToPlace);
  const introCamera = introCurrent ? introResult?.camera : undefined;
  useEffect(() => {
    const map = mapRef.current, first = coordinates[0];
    const enabled = Boolean(settings?.zoomToPlace);
    const feature = loaded && map && first && enabled && mode !== 'off' ? features.find(item => containsPosition(item, first)) : undefined;
    const camera = map && first && feature ? cameraForPlace(map, feature, first) : undefined;
    setIntroResult({ features, coordinates, mode, enabled, camera });
    locationChapterIntroCameraRef.current = camera;
    return () => { if (locationChapterIntroCameraRef.current === camera) locationChapterIntroCameraRef.current = undefined; };
  }, [coordinates, features, loaded, mapRef, mode, settings?.zoomToPlace]);
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
    let installing = false;
    const ensure = () => {
      if (installing || (map.getSource(SOURCE) && map.getLayer(FILL) && map.getLayer(GLOW) && map.getLayer(LINE))) return;
      installing = true;
      try {
        // isStyleLoaded() includes pending tile requests; a loaded style can
        // accept layers while those requests are still in flight.
        if (!map.getSource(SOURCE)) { previous.current = null; map.addSource(SOURCE, { type: 'geojson', data: empty }); }
        if (!map.getLayer(FILL)) map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': '#ffbd66', 'fill-opacity': 0 } });
        if (!map.getLayer(GLOW)) map.addLayer({ id: GLOW, type: 'line', source: SOURCE, paint: { 'line-color': '#ffbd66', 'line-width': 10, 'line-blur': 5, 'line-opacity': 0 } });
        if (!map.getLayer(LINE)) map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': '#ffbd66', 'line-width': 3, 'line-opacity': 0 } });
        setLayerRevision(revision => revision + 1);
      } catch {
        // A style replacement may not be ready yet. Retry on the next event.
      } finally { installing = false; }
    };
    map.on('styledata', ensure); map.on('sourcedata', ensure); map.on('idle', ensure); ensure();
    return () => { map.off('styledata', ensure); map.off('sourcedata', ensure); map.off('idle', ensure); if (map.getLayer(LINE)) map.removeLayer(LINE); if (map.getLayer(GLOW)) map.removeLayer(GLOW); if (map.getLayer(FILL)) map.removeLayer(FILL); if (map.getSource(SOURCE)) map.removeSource(SOURCE); };
  }, [loaded, mapRef, mode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getSource(SOURCE)) return;
    let active = mode !== 'off' && current && (phase === 'playing' || phase === 'intro' || phase === 'preloading')
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
      previous.current = { id: active.properties.id, start: time, feature: active, startedInIntro: phase === 'intro' || phase === 'preloading' };
      (map.getSource(SOURCE) as GeoJSONSource).setData(active);
    }
    const age = Math.max(0, time - previous.current.start) + (previous.current.startedInIntro && phase === 'playing' ? INTRO_DURATION : 0);
    const duration = Math.max(2000, Math.min(8000, (settings?.durationSeconds ?? 4.5) * 1000));
    // Route time is frozen at zero throughout the opening camera fly-in.
    // Show the starting place there, then finish its fade on the route clock.
    const opacity = phase === 'preloading' ? 0 : phase === 'intro' ? 1 : Math.min(1, age / 500, Math.max(0, (duration - age) / 800));
    if (map.getLayer(LINE) && map.getLayer(GLOW) && map.getLayer(FILL)) {
      map.setPaintProperty(GLOW, 'line-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(GLOW, 'line-width', (settings?.width ?? 3) + 8);
      map.setPaintProperty(GLOW, 'line-opacity', opacity * 0.4);
      map.setPaintProperty(LINE, 'line-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(LINE, 'line-width', settings?.width ?? 3);
      map.setPaintProperty(LINE, 'line-opacity', opacity);
      map.setPaintProperty(FILL, 'fill-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(FILL, 'fill-opacity', settings?.fill ? opacity * 0.18 : 0);
    }
    setCredit(opacity > 0 ? active.properties.credit : '');
    const flag = settings?.showFlag ? countryEmoji(active.properties.iso2) : '';
    setLabel(opacity > 0 && (settings?.showName || flag) ? `${flag} ${settings?.showName ? active.properties.name : ''}`.trim() : '');
  }, [current, features, layerRevision, loaded, mapRef, mode, phase, settings, time]);
  const preparingCamera = !error && loaded && mode !== 'off' && Boolean(settings?.zoomToPlace) && features.length > 0 && !introCurrent;
  return { label, error, credit, loading: loading || preparingCamera, introCamera };
}
