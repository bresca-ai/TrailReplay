import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection, LineString } from 'geojson';
import type { GPXTrack, JourneySegment } from '@/types';
import { buildTrackFromRawPoints } from '@/utils/gpx/trackStats';
import { compileStory, type StoryCompileInput } from '@/utils/story/compileStory';
import type { StoryLayout } from '@/utils/story/storyDocument';
import { journeyWithCameraHop, km, northbound, settings, story } from '@/utils/story/storyTestFixtures';
import { TRANSPORT_SEGMENT_COLOR } from '@/utils/trailColorFeatures';
import type { StoryFrame } from './storyFrame';
import { buildStoryMapStyle, createStoryMap } from './storyMap';

const { FakeMap, maps } = vi.hoisted(() => {
  type Listener = () => void;
  class FakeMap {
    options: Record<string, unknown>;
    listeners = new Map<string, Set<Listener>>();
    setData = vi.fn();
    jumpTo = vi.fn();
    resize = vi.fn();
    remove = vi.fn();
    project = vi.fn<(point: [number, number]) => { x: number; y: number }>(() => ({ x: 10, y: 20 }));
    queryTerrainElevation = vi.fn<(point: unknown) => number | null>(() => 0);
    areTilesLoaded = vi.fn(() => false);
    _camera: unknown;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      maps.push(this);
    }
    getSource(id: string) { return id === 'story-progress' ? { setData: this.setData } : undefined; }
    on(event: string, listener: Listener) {
      this.listeners.set(event, (this.listeners.get(event) ?? new Set()).add(listener));
    }
    off(event: string, listener: Listener) { this.listeners.get(event)?.delete(listener); }
    once(event: string, listener: Listener) {
      const wrapped = () => { this.off(event, wrapped); listener(); };
      this.on(event, wrapped);
    }
    fire(event: string) { [...(this.listeners.get(event) ?? [])].forEach((listener) => listener()); }
  }
  const maps: FakeMap[] = [];
  return { FakeMap, maps };
});
vi.mock('maplibre-gl', async (importOriginal) => ({
  ...await importOriginal<typeof import('maplibre-gl')>(),
  Map: FakeMap,
  setWorkerUrl: vi.fn(),
}));

const dayOne = northbound('Day 1', 45, 6);
const dayTwo = northbound('Day 2', 45, 7);
const STORY_LAYERS = ['story-ghost', 'story-travelled', 'story-head'];

function styleFor(look: Partial<StoryCompileInput['settings']> = {}, options: {
  view?: StoryLayout['view']; journeySegments?: JourneySegment[]; tracks?: GPXTrack[];
} = {}) {
  const document = story(['start', km(0)]);
  const compiled = compileStory({
    document: { ...document, layout: { ...document.layout, view: options.view ?? '2d' } },
    tracks: options.tracks ?? [dayOne, dayTwo],
    journeySegments: options.journeySegments ?? journeyWithCameraHop(dayOne, dayTwo),
    textAnnotations: [],
    pictures: [],
    videos: [],
    journeyName: 'Two days',
    settings: { ...settings, ...look },
  })!;
  return { compiled, style: buildStoryMapStyle(compiled) };
}

const layerIds = (look: Partial<StoryCompileInput['settings']>) => styleFor(look).style.layers.map((layer) => layer.id);

describe('buildStoryMapStyle', () => {
  it('draws only the selected basemap and its z8 fallback, then the three story layers', () => {
    expect(layerIds({ mapStyle: 'satellite' })).toEqual(['base-fill', 'fallback-satellite', 'background', ...STORY_LAYERS]);
    expect(layerIds({ mapStyle: 'esri-clarity' })).toEqual(['base-fill', 'fallback-esri-clarity', 'esri-clarity', ...STORY_LAYERS]);
    expect(layerIds({ mapStyle: 'mapbox-streets' })).toEqual(['base-fill', 'fallback-mapbox-streets', 'mapbox-streets', ...STORY_LAYERS]);
    expect(layerIds({ mapStyle: 'street' })).toEqual(['base-fill', 'fallback-osm', 'street', 'carto-labels', ...STORY_LAYERS]);

    const { style } = styleFor({ mapStyle: 'topo' });
    expect(style.layers.map((layer) => layer.id)).toEqual(['base-fill', 'fallback-opentopomap', 'opentopomap', 'carto-labels', ...STORY_LAYERS]);
    expect(Object.keys(style.sources).sort()).toEqual(['carto-labels', 'fallback-opentopomap', 'opentopomap', 'story-progress', 'story-route']);
    expect(style.layers.every((layer) => layer.layout?.visibility !== 'none')).toBe(true);
  });

  it('adds Carto labels for street, topo and outdoor only', () => {
    const labelled = ['street', 'topo', 'outdoor', 'satellite', 'esri-clarity', 'mapbox-streets'] as const;
    expect(labelled.filter((mapStyle) => layerIds({ mapStyle }).includes('carto-labels'))).toEqual(['street', 'topo', 'outdoor']);
  });

  it('draws wayback imagery only when there is a wayback URL', () => {
    const url = 'https://wayback.example/tile/1/{level}/{row}/{col}';
    const { style } = styleFor({ mapStyle: 'wayback', waybackItemURL: url });
    expect(style.layers.map((layer) => layer.id)).toEqual(['base-fill', 'fallback-wayback', 'wayback', ...STORY_LAYERS]);
    expect(style.sources.wayback).toMatchObject({ type: 'raster', tiles: ['https://wayback.example/tile/1/{z}/{y}/{x}'] });
    expect(style.sources['fallback-wayback']).toMatchObject({ maxzoom: 8 });

    expect(layerIds({ mapStyle: 'wayback', waybackItemURL: null }).filter((id) => id.includes('wayback'))).toEqual([]);
    expect(layerIds({ mapStyle: 'satellite', waybackItemURL: url }).filter((id) => id.includes('wayback'))).toEqual([]);
  });

  it('adds terrain and sky only in 3D, with the story exaggeration', () => {
    const flat = styleFor().style;
    expect(flat.terrain).toBeUndefined();
    expect(flat.sky).toBeUndefined();
    expect(flat.sources['terrain-dem']).toBeUndefined();

    const { style, compiled } = styleFor({}, { view: '3d' });
    expect(style.terrain).toEqual({ source: 'terrain-dem', exaggeration: compiled.look.terrainExaggeration });
    expect(style.sky).toBeDefined();
    expect(style.sources['terrain-dem']).toMatchObject({ type: 'raster-dem' });
  });

  it('uses plain tile URLs, never the shared trailcache protocol', () => {
    for (const mapStyle of ['satellite', 'topo', 'street', 'esri-clarity'] as const) {
      expect(JSON.stringify(styleFor({ mapStyle }, { view: '3d' }).style)).not.toContain('trailcache');
    }
  });

  it('draws the route in each segment colour, else the trail colour: ghost under travelled under head, no dashes', () => {
    const { style } = styleFor({ trailStyle: { ...settings.trailStyle, trailColor: '#123456' } });
    const byId = new Map(style.layers.map((layer) => [layer.id, layer]));
    const segmentColor = ['coalesce', ['get', 'color'], '#123456'];
    expect(byId.get('story-ghost')).toMatchObject({
      type: 'line', source: 'story-route', paint: { 'line-color': segmentColor, 'line-width': 4, 'line-opacity': 0.35 },
    });
    expect(byId.get('story-travelled')).toMatchObject({ type: 'line', source: 'story-progress', paint: { 'line-color': segmentColor, 'line-width': 6 } });
    expect(byId.get('story-head')).toMatchObject({ type: 'circle', source: 'story-progress', paint: { 'circle-color': '#123456' } });
    expect(JSON.stringify(style)).not.toContain('dasharray');
  });

  it('gives a car leg the transport grey and each track its own colour, as the video does', () => {
    const byCar = journeyWithCameraHop(dayOne, dayTwo).map((segment): JourneySegment => (
      segment.type === 'transport' ? { ...segment, mode: 'car' } : segment
    ));
    const green = { ...dayTwo, color: '#00AA00' };
    const source = styleFor({}, { journeySegments: byCar, tracks: [dayOne, green] }).style.sources['story-route'] as { data: FeatureCollection };
    expect(source.data.features.map((feature) => feature.properties?.color)).toEqual(['#C1652F', TRANSPORT_SEGMENT_COLOR, '#00AA00']);
  });

  it('leaves camera connectors out of the route and draws other transport as part of it', () => {
    const lineLons = (journeySegments: JourneySegment[]) => {
      const source = styleFor({}, { journeySegments }).style.sources['story-route'] as { data: FeatureCollection<LineString> };
      return source.data.features.map((feature) => [...new Set(feature.geometry.coordinates.map(([lon]) => lon))].sort());
    };

    expect(lineLons(journeyWithCameraHop(dayOne, dayTwo))).toEqual([[6], [7]]);
    const byCar = journeyWithCameraHop(dayOne, dayTwo).map((segment) => (
      segment.type === 'transport' ? { ...segment, mode: 'car' as const } : segment
    ));
    expect(lineLons(byCar).some((lons) => lons[0] === 6 && lons.at(-1) === 7)).toBe(true);
  });
});

const frameAt = (travel: number, head: Partial<StoryFrame['head']> = {}): StoryFrame => ({
  scrollTop: 0, travel, section: 0, camera: { center: [6, 45 + travel / 1e6], zoom: 12, pitch: 0, bearing: 0 },
  head: { lngLat: [6, 45.003], coordIndex: 3, visible: true, ...head },
  media: [], place: { key: 'cover', fraction: 0 },
});

function open(view: StoryLayout['view'] = '2d') {
  const { compiled } = styleFor({}, { view });
  const container = document.createElement('div');
  container.getBoundingClientRect = () => DOMRect.fromRect({ x: 640, y: 100, width: 640, height: 700 });
  const storyMap = createStoryMap(container, compiled, frameAt(0));
  return { storyMap, map: maps.at(-1)!, compiled, container };
}

const drawn = (map: InstanceType<typeof FakeMap>) => (map.setData.mock.lastCall![0] as FeatureCollection).features.map((feature) => feature.geometry.type);

afterEach(() => {
  maps.length = 0;
  vi.unstubAllGlobals();
});

describe('createStoryMap', () => {
  it('opens a still map on the first frame, without the editor map options', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { map, compiled, container } = open();
    expect(map.options).toMatchObject({
      container,
      style: buildStoryMapStyle(compiled),
      center: [6, 45], zoom: 12, pitch: 0, bearing: 0,
      interactive: false,
      attributionControl: { compact: true },
      pixelRatio: 2,
      maxTileCacheSize: 256,
      centerClampedToGround: true,
    });
  });

  it('moves the camera every frame but redraws the travelled line only when travel changes', () => {
    const { storyMap, map } = open();
    storyMap.show(frameAt(100));
    expect(map.jumpTo).toHaveBeenLastCalledWith(frameAt(100).camera);
    expect(map.setData).not.toHaveBeenCalled();

    map.fire('style.load');
    expect(map.setData).toHaveBeenCalledOnce();
    expect(drawn(map)).toEqual(['LineString', 'Point']);

    storyMap.show(frameAt(100));
    expect(map.jumpTo).toHaveBeenCalledTimes(2);
    expect(map.setData).toHaveBeenCalledOnce();

    storyMap.show(frameAt(200, { visible: false }));
    expect(map.setData).toHaveBeenCalledTimes(2);
    expect(drawn(map)).toEqual(['LineString']);
  });

  it('projects to viewport px once the style has loaded, never occludes in 2D, and says when its tiles have loaded', () => {
    const { storyMap, map } = open();
    expect(storyMap.project([6, 45])).toBeNull();
    map.fire('style.load');
    expect(storyMap.project([6, 45])).toEqual({ x: 650, y: 120, occluded: false });
    expect(map.queryTerrainElevation).not.toHaveBeenCalled();
    expect(storyMap.tilesLoaded()).toBe(false);
    map.areTilesLoaded.mockReturnValue(true);
    expect(storyMap.tilesLoaded()).toBe(true);
  });

  it('marks a point occluded in 3D when terrain rises above the line from the camera', () => {
    const { storyMap, map } = open('3d');
    map._camera = { transform: { getCameraLngLat: () => [6, 44.9], getCameraAltitude: () => 3000 } };
    map.fire('style.load');
    expect(storyMap.project([6, 45])).toMatchObject({ occluded: false });

    const latOf = (point: unknown) => (Array.isArray(point) ? point[1] : (point as { lat: number }).lat);
    map.queryTerrainElevation.mockImplementation((point) => (Math.abs(latOf(point) - 44.95) < 0.01 ? 4000 : 0));
    expect(storyMap.project([6, 45])).toMatchObject({ x: 650, y: 120, occluded: true });
  });

  it('collapses the compact attribution MapLibre opens on load, once, and keeps its button', () => {
    const { map, container } = open();
    container.innerHTML = '<details class="maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show" open>'
      + '<summary class="maplibregl-ctrl-attrib-button" aria-label="Toggle attribution"></summary>'
      + '<div class="maplibregl-ctrl-attrib-inner">© Esri</div></details>';
    const attribution = container.querySelector('.maplibregl-ctrl-attrib')!;
    map.fire('sourcedata');
    expect(attribution.classList.contains('maplibregl-compact-show')).toBe(false);
    expect(attribution.classList.contains('maplibregl-compact')).toBe(true);
    expect(attribution.querySelector('summary')).toHaveAccessibleName('Toggle attribution');

    attribution.classList.add('maplibregl-compact-show');
    map.fire('sourcedata');
    map.fire('styledata');
    expect(attribution.classList.contains('maplibregl-compact-show')).toBe(true);
  });

  it('projects a point across 180 degrees in the world copy beside the camera', () => {
    const { storyMap, map } = open();
    map.fire('style.load');
    storyMap.show({ ...frameAt(0), camera: { ...frameAt(0).camera, center: [179.99, -17] } });
    storyMap.project([-179.98, -17]);
    expect(map.project.mock.lastCall![0][0]).toBeCloseTo(180.02, 9);
  });

  it('draws the route and its travelled part across 180 degrees the short way', () => {
    const wrap = (lon: number) => ((lon + 540) % 360) - 180;
    const crossing = buildTrackFromRawPoints({
      idPrefix: 'track',
      name: 'Taveuni',
      rawPoints: Array.from({ length: 21 }, (_, index) => ({
        lat: -17, lon: wrap(179.95 + index * 0.005), elevation: 0, time: null, heartRate: null, cadence: null, power: null, temperature: null,
      })),
    });
    const { compiled, style } = styleFor({}, { tracks: [crossing], journeySegments: [{ id: 'day', type: 'track', trackId: crossing.id, duration: 1 }] });
    const lons = (lines: FeatureCollection) => (lines.features[0].geometry as LineString).coordinates.map(([lon]) => lon);
    const longestStep = (path: number[]) => Math.max(...path.slice(1).map((lon, index) => Math.abs(lon - path[index])));

    const ghost = lons((style.sources['story-route'] as { data: FeatureCollection }).data);
    expect(ghost).toHaveLength(21);
    expect(longestStep(ghost)).toBeLessThan(0.006);

    createStoryMap(document.createElement('div'), compiled, frameAt(0, { lngLat: [-179.988, -17], coordIndex: 12 }));
    const map = maps.at(-1)!;
    map.fire('style.load');
    const travelled = lons(map.setData.mock.lastCall![0] as FeatureCollection);
    expect(longestStep(travelled)).toBeLessThan(0.006);
    expect(travelled.at(-1)).toBeCloseTo(180.012, 9);
  });

  it('passes render events to the listener until it unsubscribes, and removes the map on destroy', () => {
    const { storyMap, map } = open();
    const listener = vi.fn();
    const unsubscribe = storyMap.onRender(listener);
    map.fire('render');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    map.fire('render');
    expect(listener).toHaveBeenCalledOnce();

    storyMap.resize();
    expect(map.resize).toHaveBeenCalledOnce();
    storyMap.destroy();
    expect(map.remove).toHaveBeenCalledOnce();
  });
});
