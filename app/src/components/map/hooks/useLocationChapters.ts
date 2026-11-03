/* The displayed state mirrors the imperative MapLibre source and its async lifecycle. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { LngLatBounds, LngLat, type Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { containsPosition, countryEmoji, levelCode, loadRouteBoundaries, type LocationFeature } from '@/utils/locationBoundaries';
import type { LocationChapterSettings } from '@/types';
import { INTRO_DURATION } from '@/components/playback/PlaybackProvider';
import { getIntroLevels, getMinimumStaySeconds, getZoomDurationSeconds, introStage, locationChapterIntroCameraRef, locationChapterIntroStagesRef, locationChapterIntroProgressRef, type LocationChapterCameraCue } from '@/utils/locationChapterCamera';
import type { LocationLevel } from '@/utils/locationBoundaries';
const SOURCE = 'location-chapter', FILL = 'location-chapter-fill', GLOW = 'location-chapter-glow', LINE = 'location-chapter-line';
const TRACE_SOURCE = 'location-chapter-trace', TRACE = 'location-chapter-trace-line';
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
type PlaceCamera = { center: [number, number]; zoom: number; pitch: number; bearing: number };
type IntroStage = { level: LocationLevel; feature: LocationFeature; camera?: PlaceCamera };
const emptyStages: IntroStage[] = [];
export function cameraForPlace(map: MapLibreMap, feature: LocationFeature, point: Position): PlaceCamera | undefined {
  const bounds = new LngLatBounds();
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  // Distant islands should not shrink the part of the place containing the trip.
  const localPolygon = polygons.find(polygon => containsPosition({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: polygon } }, point));
  if (localPolygon) for (const ring of localPolygon) for (const coordinate of ring) bounds.extend([coordinate[0], coordinate[1]]);
  if (bounds.isEmpty() || bounds.getEast() - bounds.getWest() >= 180) return undefined;
  try {
    const camera = map.cameraForBounds(bounds, { padding: 40, maxZoom: 13, pitch: 0, bearing: 0 });
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
  const [introLayers, setIntroLayers] = useState<Array<{ level: LocationLevel; features: LocationFeature[] }>>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [introProgress, setIntroProgress] = useState(0);
  const [layerRevision, setLayerRevision] = useState(0);
  const previous = useRef<{ id: string; level: LocationLevel | 'off'; start: number; feature: LocationFeature; startedInIntro: boolean; suppressReveal?: boolean; target?: PlaceCamera } | null>(null);
  const cameraCueRef = useRef<LocationChapterCameraCue | null>(null);
  const candidate = useRef<{ id: string; since: number } | null>(null);
  const mode = settings?.level ?? 'off';
  const introZoom = Boolean(settings?.introZoomToPlace ?? settings?.zoomToPlace);
  const introKey = getIntroLevels(settings).join(',');
  const [introResult, setIntroResult] = useState<{ features: LocationFeature[]; layers: typeof introLayers; coordinates: number[][]; mode: string; enabled: boolean; stages: IntroStage[] }>();
  const introCurrent = introResult?.features === features && introResult.layers === introLayers && introResult.coordinates === coordinates && introResult.mode === mode && introResult.enabled === introZoom;
  const introStages = introCurrent ? introResult?.stages ?? emptyStages : emptyStages;
  const introCamera = introStages[0]?.camera;
  const introRegionCamera = introStages[1]?.camera;
  useEffect(() => {
    const map = mapRef.current, first = coordinates[0];
    const enabled = introZoom;
    const stages = loaded && first ? introLayers.flatMap(({ level, features: items }) => {
      const feature = items.find(item => containsPosition(item, first));
      return feature ? [{ level, feature, camera: enabled && map ? cameraForPlace(map, feature, first) : undefined }] : [];
    }) : [];
    setIntroResult({ features, layers: introLayers, coordinates, mode, enabled, stages });
    const camera = stages[0]?.camera;
    locationChapterIntroCameraRef.current = camera;
    const stageCameras = stages.flatMap(stage => stage.camera ? [stage.camera] : []);
    locationChapterIntroStagesRef.current = stageCameras;
    return () => { if (locationChapterIntroCameraRef.current === camera) locationChapterIntroCameraRef.current = undefined; if (locationChapterIntroStagesRef.current === stageCameras) locationChapterIntroStagesRef.current = []; };
  }, [coordinates, features, introLayers, introZoom, loaded, mapRef, mode]);
  useEffect(() => {
    let cancelled = false;
    setFeatures([]); setIntroLayers([]); setMissing([]); setError(false); previous.current = null; cameraCueRef.current = null; candidate.current = null; setLabel(''); setCredit('');
    if (mode === 'off' || !coordinates.length) { setLoading(false); return; }
    setLoading(true);
    const stride = Math.max(1, Math.floor(coordinates.length / 5000));
    const samples = coordinates.filter((_, i) => i % stride === 0 || i === coordinates.length - 1) as Position[];
    const selected = introKey ? introKey.split(',') as LocationLevel[] : [];
    const missingSet = new Set<string>();
    const load = (points: Position[], level: LocationLevel) => loadRouteBoundaries(points, level, countries => { countries.forEach(country => missingSet.add(`${country} (${levelCode(level)})`)); });
    Promise.all([load(samples, mode), ...selected.map(level => level === mode ? Promise.resolve(null) : load([samples[0]], level).catch(() => { missingSet.add(levelCode(level)); return []; }))]).then(([items, ...layers]) => {
      if (!cancelled) {
        const routeFeatures = items ?? [];
        const openingLayers = selected.map((level, index) => ({ level, features: layers[index] ?? routeFeatures }));
        for (const layer of openingLayers) {
          if (!layer.features.some(feature => containsPosition(feature, samples[0]))) missingSet.add(levelCode(layer.level));
        }
        setFeatures(routeFeatures);
        setIntroLayers(openingLayers);
        setMissing([...missingSet]); setError(routeFeatures.length === 0); setLoading(false);
      }
    }).catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [coordinates, introKey, mode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || mode === 'off' || (phase !== 'intro' && phase !== 'preloading')) { setIntroProgress(0); return; }
    const update = () => setIntroProgress(locationChapterIntroProgressRef.current);
    if (phase === 'intro') map.on('move', update);
    return () => { if (phase === 'intro') map.off('move', update); };
  }, [loaded, mapRef, mode, phase]);
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
    if (!map || !loaded || !map.getSource(SOURCE)) { cameraCueRef.current = null; return; }
    const stage = introStage(introProgress, introStages.length);
    let active = mode !== 'off' && current && (phase === 'playing' || phase === 'intro' || phase === 'preloading')
      ? phase === 'playing' ? previous.current && features.includes(previous.current.feature) && containsPosition(previous.current.feature, [current.lon, current.lat]) ? previous.current.feature : features.find(feature => containsPosition(feature, [current.lon, current.lat])) : introStages[stage.index]?.feature : undefined;
    if (previous.current && time < previous.current.start) { previous.current = null; candidate.current = null; }
    // Larger areas default to a small jitter filter. Local areas default to
    // immediate entry so a short passage in a compressed video is not lost.
    if (previous.current && phase === 'playing' && previous.current.id !== active?.properties.id && !(previous.current.startedInIntro && time < 500)) {
      const nextId = active?.properties.id ?? '';
      if (candidate.current?.id !== nextId || time < candidate.current.since) candidate.current = { id: nextId, since: time };
      const delay = settings ? getMinimumStaySeconds(settings) * 1000 : 500;
      if (time - candidate.current.since < delay) active = previous.current.feature;
      else candidate.current = null;
    } else candidate.current = null;
    if (!active) { if (previous.current) { (map.getSource(SOURCE) as GeoJSONSource).setData(empty); (map.getSource(TRACE_SOURCE) as GeoJSONSource | undefined)?.setData(empty); } previous.current = null; cameraCueRef.current = null; setLabel(''); setCredit(''); return; }
    const activeLevel = phase === 'playing' && active === previous.current?.feature ? previous.current.level
      : phase === 'playing' ? mode : introStages[stage.index]?.level ?? mode;
    if (previous.current?.id !== active.properties.id || previous.current?.level !== activeLevel || time < previous.current.start) {
      // If the moving level was already shown earlier in a multi-level intro,
      // switching back to it is bookkeeping, not a new place entry. Otherwise
      // a country followed by a region and district immediately replays the
      // country and starts another zoom at the beginning of the route.
      const alreadyShown = phase === 'playing' && previous.current?.startedInIntro
        && introStages.some(item => item.level === mode && item.feature.properties.id === active!.properties.id);
      const target = phase === 'playing' && !alreadyShown && settings?.zoomToPlace ? cameraForPlace(map, active, [current!.lon, current!.lat]) : undefined;
      previous.current = { id: active.properties.id, level: activeLevel, start: time, feature: active, startedInIntro: Boolean(alreadyShown) || phase === 'intro' || phase === 'preloading', suppressReveal: Boolean(alreadyShown), target };
      (map.getSource(SOURCE) as GeoJSONSource).setData(active);
      const polygons = active.geometry.type === 'Polygon' ? [active.geometry.coordinates] : active.geometry.coordinates;
      (map.getSource(TRACE_SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: polygons.map(polygon => polygon[0]).filter(Boolean) } });
    }
    const age = Math.max(0, time - previous.current.start) + (previous.current.startedInIntro && phase === 'playing' ? INTRO_DURATION : 0);
    const revealDuration = Math.max(2000, Math.min(8000, (settings?.durationSeconds ?? 4.5) * 1000));
    const zoomDuration = settings ? getZoomDurationSeconds(settings) * 1000 : revealDuration;
    const canZoom = Boolean(settings?.zoomToPlace && !previous.current.startedInIntro && cameraCanFollow && previous.current.target && phase === 'playing');
    const duration = canZoom ? Math.max(revealDuration, zoomDuration) : revealDuration;
    // Route time is frozen at zero throughout the opening camera fly-in.
    // Show the starting place there, then finish its fade on the route clock.
    const introOpacity = introStages.length > 1 ? Math.min(1, stage.local / .12, (1 - stage.local) / .12) : 1;
    const fadeIn = mode === 'country' || mode === 'region' ? 500 : 150;
    const opacity = phase === 'preloading' || previous.current.suppressReveal ? 0 : phase === 'intro' ? introOpacity : Math.min(1, age / fadeIn, Math.max(0, (duration - age) / 800));
    // For a place overview, let the camera arrive before drawing the border;
    // otherwise the trace has already finished while the viewer is zooming out.
    const traceProgress = phase === 'intro' ? stage.local / .7 : canZoom
      ? (age - zoomDuration * .3) / Math.max(1, zoomDuration * .4)
      : age / Math.min(3000, duration * .7);
    const baseLineOpacity = settings?.traceBorder !== false && traceProgress < 1 ? opacity * .3 : opacity;
    const target = previous.current.target;
    cameraCueRef.current = canZoom && target && age < zoomDuration
      ? { target, startTime: previous.current.start, duration: zoomDuration } : null;
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
    const flag = settings?.showFlag && previous.current.level === 'country' ? countryEmoji(active.properties.iso2) : '';
    setLabel(opacity > 0 && (settings?.showName || flag) ? `${flag} ${settings?.showName ? active.properties.name : ''}`.trim() : '');
  }, [cameraCanFollow, current, features, introProgress, introStages, layerRevision, loaded, mapRef, mode, phase, settings, time]);
  const preparingCamera = loaded && mode !== 'off' && (features.length > 0 || introLayers.some(layer => layer.features.length > 0)) && !introCurrent;
  return { label, error, credit, missing, loading: loading || preparingCamera, introCamera, introRegionCamera, introStages, cameraCueRef, features };
}
