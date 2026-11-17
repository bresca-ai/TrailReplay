// The story's own MapLibre instance: never the editor map, never mapGlobalRef, story-* ids only.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import { BASEMAP_FALLBACK_MAX_ZOOM, BASEMAP_PRESENTATIONS, MAP_STYLE } from '@/components/map/mapStyle';
import { longitudeStep, unwrapPath, type CompiledStory } from '@/utils/story/compileStory';
import { buildSegmentLineFeatures } from '@/utils/trailColorFeatures';
import type { LngLat, StoryFrame } from './storyFrame';
import type { ProjectPoint } from './storyWedge';

export interface StoryMap {
  show(frame: StoryFrame): void; // jumpTo(frame.camera); the travelled line and head only when travel changed
  project: ProjectPoint;
  onRender(listener: () => void): () => void; // tiles and terrain refine the projection: repaint the wedges
  tilesLoaded(): boolean; // basemap and terrain: until then a 3D projection still moves (the probe waits on it)
  resize(): void;
  destroy(): void; // map.remove()
}

/** createDefaultSettings().mapStyle, which the store boundary keeps out of reach here. */
const DEFAULT_BASEMAP = 'esri-clarity';
const LABELLED_BASEMAPS = new Set(['street', 'topo', 'outdoor']);
const WAYBACK_ATTRIBUTION = '© Esri — Source: Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community';
const HEAD_STROKE = '#F8F6F0'; // --canvas
const OCCLUSION_SAMPLES = 8;

type Style = maplibregl.StyleSpecification;
type Layer = maplibregl.LayerSpecification;
const BASE = MAP_STYLE as unknown as Style;

/** The reader's style: the selected basemap only, the route and the head; terrain and sky only in 3D. */
export function buildStoryMapStyle(story: CompiledStory): Style {
  const { look } = story;
  const color = look.trailColor;
  const segmentColor = ['coalesce', ['get', 'color'], color] as maplibregl.ExpressionSpecification; // transport grey, track colours
  const basemap = basemapOf(look);
  const labels = LABELLED_BASEMAPS.has(look.mapStyle);
  const is3d = story.layout.view === '3d';
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };

  return {
    version: 8,
    ...(is3d && { sky: BASE.sky, terrain: { source: 'terrain-dem', exaggeration: look.terrainExaggeration } }),
    sources: {
      ...basemap.sources,
      ...(labels && { 'carto-labels': BASE.sources['carto-labels'] }),
      ...(is3d && { 'terrain-dem': BASE.sources['terrain-dem'] }),
      'story-route': { type: 'geojson', data: { type: 'FeatureCollection', features: trailLines(story, lonLats(story)) } },
      'story-progress': { type: 'geojson', data: empty },
    },
    layers: [
      layerOf('base-fill'),
      ...basemap.layers,
      ...(labels ? [layerOf('carto-labels')] : []),
      {
        id: 'story-ghost', type: 'line', source: 'story-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': segmentColor, 'line-width': 4, 'line-opacity': 0.35 },
      },
      {
        id: 'story-travelled', type: 'line', source: 'story-progress', filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': segmentColor, 'line-width': 6 },
      },
      {
        id: 'story-head', type: 'circle', source: 'story-progress', filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 6, 'circle-color': color, 'circle-stroke-color': HEAD_STROKE, 'circle-stroke-width': 2 },
      },
    ],
  };
}

export function createStoryMap(container: HTMLElement, story: CompiledStory, first: StoryFrame): StoryMap {
  // Vite renames MapLibre's chunk, so the worker is not next to it; the editor map may never have run.
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  const map = new maplibregl.Map({
    container,
    style: buildStoryMapStyle(story),
    ...first.camera,
    interactive: false,
    attributionControl: { compact: true },
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    maxTileCacheSize: 256,
    centerClampedToGround: true,
  });
  const coordinates = lonLats(story);
  const is3d = story.layout.view === '3d';
  let styleReady = false;
  let latest = first;
  let drawnTravel: number | null = null;

  const drawTravelled = (frame: StoryFrame) => {
    if (!styleReady || frame.travel === drawnTravel) return;
    drawnTravel = frame.travel;
    const { head } = frame;
    map.getSource<maplibregl.GeoJSONSource>('story-progress')?.setData({
      type: 'FeatureCollection',
      features: [
        ...trailLines(story, coordinates, head),
        ...(head.visible ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: head.lngLat } }] : []),
      ],
    });
  };
  map.once('style.load', () => {
    styleReady = true;
    drawTravelled(latest);
  });
  // Compact attribution opens itself once and collapses only on 'drag', which this still map never fires.
  const collapseAttribution = () => {
    const attribution = container.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show');
    if (!attribution) return;
    attribution.classList.remove('maplibregl-compact-show');
    map.off('styledata', collapseAttribution);
    map.off('sourcedata', collapseAttribution);
  };
  map.on('styledata', collapseAttribution);
  map.on('sourcedata', collapseAttribution);

  return {
    show(frame) {
      latest = frame;
      map.jumpTo(frame.camera);
      drawTravelled(frame);
    },
    project([lon, lat]) {
      if (!styleReady) return null;
      // The world copy nearest the camera: across 180 degrees, MapLibre would project a whole world away.
      const [centerLon] = latest.camera.center;
      const near: LngLat = [centerLon + longitudeStep(centerLon, lon), lat];
      const { x, y } = map.project(near);
      const rect = container.getBoundingClientRect();
      return { x: rect.left + x, y: rect.top + y, occluded: is3d && isOccluded(map, near) };
    },
    tilesLoaded: () => map.areTilesLoaded(),
    onRender(listener) {
      map.on('render', listener);
      return () => { map.off('render', listener); };
    },
    resize() {
      map.resize();
    },
    destroy() {
      map.remove();
    },
  };
}

function basemapOf(look: CompiledStory['look']): { sources: Style['sources']; layers: Layer[] } {
  if (look.mapStyle === 'wayback' && look.waybackItemURL) {
    const tiles = [look.waybackItemURL.replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}')];
    return {
      sources: {
        'fallback-wayback': { type: 'raster', tiles, tileSize: 256, maxzoom: BASEMAP_FALLBACK_MAX_ZOOM, attribution: '© Esri' },
        wayback: { type: 'raster', tiles, tileSize: 256, attribution: WAYBACK_ATTRIBUTION },
      },
      layers: [
        { id: 'fallback-wayback', type: 'raster', source: 'fallback-wayback', paint: { 'raster-fade-duration': 0 } },
        { id: 'wayback', type: 'raster', source: 'wayback', paint: { 'raster-fade-duration': 0 } },
      ],
    };
  }
  // Wayback without a URL has no imagery of its own; the default imagery beats an empty fill.
  const presentation = (look.mapStyle !== 'wayback' && BASEMAP_PRESENTATIONS[look.mapStyle]) || BASEMAP_PRESENTATIONS[DEFAULT_BASEMAP];
  return {
    sources: {
      [presentation.fallbackSourceId]: BASE.sources[presentation.fallbackSourceId],
      [presentation.sourceId]: BASE.sources[presentation.sourceId],
    },
    layers: [layerOf(presentation.fallbackLayerId), layerOf(presentation.layerId)],
  };
}

/** A MAP_STYLE layer, shown: the editor style hides all but satellite until its effects run. */
function layerOf(id: string): Layer {
  const layer = BASE.layers.find((candidate) => candidate.id === id)!;
  return { ...layer, layout: { ...layer.layout, visibility: 'visible' } } as Layer;
}

/** Unwrapped, so a line across 180 degrees stays short instead of circling the world. */
function lonLats(story: CompiledStory): number[][] {
  return unwrapPath(story.route.coordinates.map((point): LngLat => [point.lon, point.lat]));
}

/** Every segment but camera connectors, as solid lines; with `head`, only the part behind it. */
function trailLines(story: CompiledStory, coordinates: number[][], head?: StoryFrame['head']) {
  const { route, look } = story;
  const behind = head && coordinates[head.coordIndex][0];
  return buildSegmentLineFeatures({
    coordinates,
    segmentTimings: route.segmentTimings,
    fallbackColor: look.trailColor,
    ...(head && behind !== undefined && {
      maxCoordIndex: head.coordIndex,
      partialEndpoint: [behind + longitudeStep(behind, head.lngLat[0]), head.lngLat[1]] as LngLat,
      partialSegmentIndex: route.coordinates[head.coordIndex].segmentIndex,
    }),
  });
}

interface CameraTransform { getCameraLngLat(): maplibregl.LngLat; getCameraAltitude(): number }

/**
 * Whether 3D terrain hides `point`: any of 8 samples on the straight line from the camera to the point lies
 * under the ground. MapLibre 6 keeps the camera on `_camera.transform`, outside the documented surface; if
 * that moves, the point counts as visible.
 */
function isOccluded(map: maplibregl.Map, point: LngLat): boolean {
  const transform = (map as unknown as { _camera?: { transform?: Partial<CameraTransform> } })._camera?.transform;
  if (typeof transform?.getCameraLngLat !== 'function' || typeof transform.getCameraAltitude !== 'function') return false;
  const camera = maplibregl.MercatorCoordinate.fromLngLat(transform.getCameraLngLat(), transform.getCameraAltitude());
  const target = maplibregl.MercatorCoordinate.fromLngLat(point, map.queryTerrainElevation(point) ?? 0);
  for (let index = 1; index <= OCCLUSION_SAMPLES; index += 1) {
    const t = index / (OCCLUSION_SAMPLES + 1);
    const sample = new maplibregl.MercatorCoordinate(
      camera.x + (target.x - camera.x) * t,
      camera.y + (target.y - camera.y) * t,
      camera.z + (target.z - camera.z) * t,
    );
    const ground = map.queryTerrainElevation(sample.toLngLat());
    if (ground !== null && ground > sample.toAltitude()) return true;
  }
  return false;
}
