/* The displayed state mirrors the imperative MapLibre source and its async lifecycle. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { LngLatBounds, LngLat, type Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { containsPosition, countryEmoji, loadRouteBoundaries, type LocationFeature } from '@/utils/locationBoundaries';
import type { LocationChapterSettings } from '@/types';
import { INTRO_DURATION } from '@/components/playback/PlaybackProvider';
import { locationChapterIntroCameraRef, locationChapterIntroProgressRef } from '@/utils/locationChapterCamera';
const SOURCE = 'location-chapter', FILL = 'location-chapter-fill', GLOW = 'location-chapter-glow', LINE = 'location-chapter-line';
const TRACE_SOURCE = 'location-chapter-trace', TRACE = 'location-chapter-trace-line';
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
      // Leave room for video crops and overlays as well as the live map viewport.
      return { center: [center.lng, center.lat], zoom: Math.max(0, camera.zoom - 0.5), pitch: 0, bearing: 0 };
    }
  } catch { /* A very small viewport may not admit a fitted camera. */ }
  return undefined;
}
export function useLocationChapters(mapRef: RefObject<MapLibreMap | null>, loaded: boolean, settings: LocationChapterSettings | undefined,
  coordinates: number[][], current: { lon: number; lat: number } | null, time: number, phase: string, cameraCanFollow = true) {
  const [features, setFeatures] = useState<LocationFeature[]>([]), [error, setError] = useState(false), [label, setLabel] = useState(''), [credit, setCredit] = useState(''), [loading, setLoading] = useState(false);
  const [introCountries, setIntroCountries] = useState<LocationFeature[]>([]);
  const [introRegion, setIntroRegion] = useState(false);
  const [introProgress, setIntroProgress] = useState(0);
  const [layerRevision, setLayerRevision] = useState(0);
  const previous = useRef<{ id: string; start: number; feature: LocationFeature; startedInIntro: boolean; target?: PlaceCamera } | null>(null);
  const candidate = useRef<{ id: string; since: number } | null>(null);
  const mode = settings?.level ?? 'off';
  const countryFirst = mode === 'region' && Boolean(settings?.introCountryFirst);
  const [introResult, setIntroResult] = useState<{ features: LocationFeature[]; countries: LocationFeature[]; coordinates: number[][]; mode: string; enabled: boolean; countryFirst: boolean; camera?: PlaceCamera; regionCamera?: PlaceCamera }>();
  const introCurrent = introResult?.features === features && introResult.countries === introCountries && introResult.coordinates === coordinates && introResult.mode === mode && introResult.countryFirst === countryFirst && introResult.enabled === Boolean(settings?.zoomToPlace);
  const introCamera = introCurrent ? introResult?.camera : undefined;
  const introRegionCamera = introCurrent ? introResult?.regionCamera : undefined;
  useEffect(() => {
    const map = mapRef.current, first = coordinates[0];
    const enabled = Boolean(settings?.zoomToPlace);
    const overviewFeatures = countryFirst && introCountries.length ? introCountries : features;
    const feature = loaded && map && first && enabled && mode !== 'off' ? overviewFeatures.find(item => containsPosition(item, first)) : undefined;
    const camera = map && first && feature ? cameraForPlace(map, feature, first) : undefined;
    const region = countryFirst && first ? features.find(item => containsPosition(item, first)) : undefined;
    const regionCamera = enabled && map && first && region ? cameraForPlace(map, region, first) : undefined;
    setIntroResult({ features, countries: introCountries, coordinates, mode, enabled, countryFirst, camera, regionCamera });
    locationChapterIntroCameraRef.current = camera;
    return () => { if (locationChapterIntroCameraRef.current === camera) locationChapterIntroCameraRef.current = undefined; };
  }, [coordinates, countryFirst, features, introCountries, loaded, mapRef, mode, settings?.zoomToPlace]);
  useEffect(() => {
    let cancelled = false;
    setFeatures([]); setIntroCountries([]); setError(false); previous.current = null; candidate.current = null; setLabel(''); setCredit('');
    if (mode === 'off' || !coordinates.length) { setLoading(false); return; }
    setLoading(true);
    const stride = Math.max(1, Math.floor(coordinates.length / 5000));
    const samples = coordinates.filter((_, i) => i % stride === 0 || i === coordinates.length - 1) as Position[];
    Promise.all([loadRouteBoundaries(samples, mode), countryFirst ? loadRouteBoundaries([samples[0]], 'country').catch(() => []) : Promise.resolve([])]).then(([items, countries]) => { if (!cancelled) { setFeatures(items); setIntroCountries(countries); setError(items.length === 0); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [coordinates, countryFirst, mode]);
  useEffect(() => {
    const map = mapRef.current, first = coordinates[0];
    if (!map || !loaded || mode === 'off' || !first || (phase !== 'intro' && phase !== 'preloading')) { setIntroRegion(false); setIntroProgress(0); return; }
    const update = () => {
      const progress = locationChapterIntroProgressRef.current;
      setIntroProgress(progress);
      if (countryFirst && progress >= 0.5) setIntroRegion(true);
    };
    if (phase === 'intro') map.on('move', update);
    return () => { if (phase === 'intro') map.off('move', update); };
  }, [coordinates, countryFirst, loaded, mapRef, mode, phase]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || mode === 'off') return;
    let installing = false;
    const ensure = () => {
      if (installing || (map.getSource(SOURCE) && map.getSource(TRACE_SOURCE) && map.getLayer(FILL) && map.getLayer(GLOW) && map.getLayer(LINE) && map.getLayer(TRACE))) return;
      installing = true;
      try {
        // isStyleLoaded() includes pending tile requests; a loaded style can
        // accept layers while those requests are still in flight.
        if (!map.getSource(SOURCE)) { previous.current = null; map.addSource(SOURCE, { type: 'geojson', data: empty }); }
        if (!map.getLayer(FILL)) map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': '#ffbd66', 'fill-opacity': 0 } });
        if (!map.getLayer(GLOW)) map.addLayer({ id: GLOW, type: 'line', source: SOURCE, paint: { 'line-color': '#ffbd66', 'line-width': 10, 'line-blur': 5, 'line-opacity': 0 } });
        if (!map.getLayer(LINE)) map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': '#ffbd66', 'line-width': 3, 'line-opacity': 0 } });
        if (!map.getSource(TRACE_SOURCE)) map.addSource(TRACE_SOURCE, { type: 'geojson', data: empty, lineMetrics: true });
        if (!map.getLayer(TRACE)) map.addLayer({ id: TRACE, type: 'line', source: TRACE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 5, 'line-opacity': 0 } });
        setLayerRevision(revision => revision + 1);
      } catch {
        // A style replacement may not be ready yet. Retry on the next event.
      } finally { installing = false; }
    };
    map.on('styledata', ensure); map.on('sourcedata', ensure); map.on('idle', ensure); ensure();
    return () => { map.off('styledata', ensure); map.off('sourcedata', ensure); map.off('idle', ensure); if (map.getLayer(TRACE)) map.removeLayer(TRACE); if (map.getLayer(LINE)) map.removeLayer(LINE); if (map.getLayer(GLOW)) map.removeLayer(GLOW); if (map.getLayer(FILL)) map.removeLayer(FILL); if (map.getSource(TRACE_SOURCE)) map.removeSource(TRACE_SOURCE); if (map.getSource(SOURCE)) map.removeSource(SOURCE); };
  }, [loaded, mapRef, mode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getSource(SOURCE)) return;
    const introFeatures = countryFirst && !introRegion && introCountries.length ? introCountries : features;
    let active = mode !== 'off' && current && (phase === 'playing' || phase === 'intro' || phase === 'preloading')
      ? (phase === 'playing' ? features : introFeatures).find(feature => containsPosition(feature, [current.lon, current.lat])) : undefined;
    if (previous.current && time < previous.current.start) { previous.current = null; candidate.current = null; }
    // Ignore brief boundary jitter; the first location is immediate.
    if (previous.current && phase === 'playing' && previous.current.id !== active?.properties.id && !(previous.current.startedInIntro && time < 500)) {
      const nextId = active?.properties.id ?? '';
      if (candidate.current?.id !== nextId || time < candidate.current.since) candidate.current = { id: nextId, since: time };
      if (time - candidate.current.since < 500) active = previous.current.feature;
      else candidate.current = null;
    } else candidate.current = null;
    if (!active) { if (previous.current) { (map.getSource(SOURCE) as GeoJSONSource).setData(empty); (map.getSource(TRACE_SOURCE) as GeoJSONSource | undefined)?.setData(empty); } previous.current = null; setLabel(''); setCredit(''); return; }
    if (previous.current?.id !== active.properties.id || time < previous.current.start) {
      const target = phase === 'playing' && settings?.zoomToPlace ? cameraForPlace(map, active, [current!.lon, current!.lat]) : undefined;
      previous.current = { id: active.properties.id, start: time, feature: active, startedInIntro: phase === 'intro' || phase === 'preloading', target };
      (map.getSource(SOURCE) as GeoJSONSource).setData(active);
      const polygons = active.geometry.type === 'Polygon' ? [active.geometry.coordinates] : active.geometry.coordinates;
      (map.getSource(TRACE_SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: polygons.map(polygon => polygon[0]).filter(Boolean) } });
    }
    const age = Math.max(0, time - previous.current.start) + (previous.current.startedInIntro && phase === 'playing' ? INTRO_DURATION : 0);
    const duration = Math.max(2000, Math.min(8000, (settings?.durationSeconds ?? 4.5) * 1000));
    // Route time is frozen at zero throughout the opening camera fly-in.
    // Show the starting place there, then finish its fade on the route clock.
    const introOpacity = countryFirst && introCountries.length ? (introRegion
      ? Math.min(1, Math.max(0, (introProgress - 0.49) / 0.06))
      : Math.min(1, Math.max(0, (0.5 - introProgress) / 0.06))) : 1;
    const opacity = phase === 'preloading' ? 0 : phase === 'intro' ? introOpacity : Math.min(1, age / 500, Math.max(0, (duration - age) / 800));
    const traceProgress = phase === 'intro' ? (countryFirst ? (introRegion ? (introProgress - .5) / .25 : introProgress / .35) : introProgress / .4) : age / Math.min(3000, duration * .7);
    const baseLineOpacity = settings?.traceBorder !== false && traceProgress < 1 ? opacity * .3 : opacity;
    const target = previous.current.target;
    if (settings?.zoomToPlace && !previous.current.startedInIntro && cameraCanFollow && target && phase === 'playing' && age > 0 && age < duration) {
      const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
      const weight = Math.min(smooth(age / (duration * .3)), smooth((duration - age) / (duration * .3)));
      const center = map.getCenter();
      const deltaLng = ((target.center[0] - center.lng + 540) % 360) - 180;
      map.jumpTo({ center: [center.lng + deltaLng * weight, center.lat + (target.center[1] - center.lat) * weight], zoom: map.getZoom() + (Math.min(map.getZoom(), target.zoom) - map.getZoom()) * weight, pitch: map.getPitch() * (1 - weight) });
    }
    if (map.getLayer(LINE) && map.getLayer(GLOW) && map.getLayer(FILL)) {
      map.setPaintProperty(GLOW, 'line-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(GLOW, 'line-width', (settings?.width ?? 3) + 8);
      map.setPaintProperty(GLOW, 'line-opacity', baseLineOpacity * 0.4);
      map.setPaintProperty(LINE, 'line-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(LINE, 'line-width', settings?.width ?? 3);
      map.setPaintProperty(LINE, 'line-opacity', baseLineOpacity);
      map.setPaintProperty(FILL, 'fill-color', settings?.color ?? '#ffbd66');
      map.setPaintProperty(FILL, 'fill-opacity', settings?.fill ? opacity * 0.18 : 0);
    }
    if (map.getLayer(TRACE)) {
      const stop = Math.max(.0001, Math.min(.9999, traceProgress));
      map.setPaintProperty(TRACE, 'line-width', (settings?.width ?? 3) + 2);
      map.setPaintProperty(TRACE, 'line-gradient', ['step', ['line-progress'], settings?.color ?? '#ffbd66', stop, 'rgba(0,0,0,0)']);
      map.setPaintProperty(TRACE, 'line-opacity', settings?.traceBorder !== false ? opacity : 0);
    }
    setCredit(opacity > 0 ? active.properties.credit : '');
    const flag = settings?.showFlag ? countryEmoji(active.properties.iso2) : '';
    setLabel(opacity > 0 && (settings?.showName || flag) ? `${flag} ${settings?.showName ? active.properties.name : ''}`.trim() : '');
  }, [cameraCanFollow, countryFirst, current, features, introCountries, introProgress, introRegion, layerRevision, loaded, mapRef, mode, phase, settings, time]);
  const preparingCamera = !error && loaded && mode !== 'off' && Boolean(settings?.zoomToPlace) && features.length > 0 && !introCurrent;
  return { label, error, credit, loading: loading || preparingCamera, introCamera, introRegionCamera };
}
