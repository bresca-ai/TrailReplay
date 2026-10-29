import { DEFAULT_MAP_SKY } from './mapSky';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export const BASEMAP_FALLBACK_MAX_ZOOM = 12;

export const BASEMAP_PRESENTATIONS: Record<string, {
  fallbackLayerId: string;
  fallbackSourceId: string;
  layerId: string;
  sourceId: string;
}> = {
  satellite: { layerId: 'background', sourceId: 'satellite', fallbackLayerId: 'fallback-satellite', fallbackSourceId: 'fallback-satellite' },
  street: { layerId: 'street', sourceId: 'osm', fallbackLayerId: 'fallback-osm', fallbackSourceId: 'fallback-osm' },
  topo: { layerId: 'opentopomap', sourceId: 'opentopomap', fallbackLayerId: 'fallback-opentopomap', fallbackSourceId: 'fallback-opentopomap' },
  outdoor: { layerId: 'opentopomap', sourceId: 'opentopomap', fallbackLayerId: 'fallback-opentopomap', fallbackSourceId: 'fallback-opentopomap' },
  'esri-clarity': { layerId: 'esri-clarity', sourceId: 'esri-clarity', fallbackLayerId: 'fallback-esri-clarity', fallbackSourceId: 'fallback-esri-clarity' },
  wayback: { layerId: 'wayback', sourceId: 'wayback', fallbackLayerId: 'fallback-wayback', fallbackSourceId: 'fallback-wayback' },
  'mapbox-streets': { layerId: 'mapbox-streets', sourceId: 'mapbox-streets', fallbackLayerId: 'fallback-mapbox-streets', fallbackSourceId: 'fallback-mapbox-streets' },
};

export const STATIC_BASEMAP_LAYER_IDS = [
  'background',
  'street',
  'opentopomap',
  'esri-clarity',
  'mapbox-streets',
] as const;

export const STATIC_FALLBACK_LAYER_IDS = [
  'fallback-satellite',
  'fallback-osm',
  'fallback-opentopomap',
  'fallback-esri-clarity',
  'fallback-mapbox-streets',
] as const;

const rasterSource = (tiles: readonly string[], attribution: string, tileSize = 256) => ({
  type: 'raster' as const,
  tiles: [...tiles],
  tileSize,
  attribution,
});

const fallbackRasterSource = (tiles: readonly string[], attribution: string, tileSize = 256) => ({
  ...rasterSource(tiles, attribution, tileSize),
  maxzoom: BASEMAP_FALLBACK_MAX_ZOOM,
});

const OSM_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'] as const;
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const TOPO_TILES = ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'] as const;
const TOPO_ATTRIBUTION = '© OpenTopoMap (CC-BY-SA)';
const SATELLITE_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] as const;
const SATELLITE_ATTRIBUTION = '© Esri';
const CLARITY_TILES = ['https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] as const;
const CLARITY_ATTRIBUTION = 'Tiles © Esri — Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community';
const MAPBOX_STREET_TILES = MAPBOX_TOKEN
  ? [`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`]
  : [];
const MAPBOX_ATTRIBUTION = '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const MAP_STYLE = {
  version: 8,
  sky: DEFAULT_MAP_SKY,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      ...rasterSource(OSM_TILES, OSM_ATTRIBUTION),
    },
    opentopomap: {
      ...rasterSource(TOPO_TILES, TOPO_ATTRIBUTION),
    },
    satellite: {
      ...rasterSource(SATELLITE_TILES, SATELLITE_ATTRIBUTION),
    },
    'carto-labels': {
      type: 'raster',
      tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© CartoDB',
    },
    'enhanced-hillshade': {
      type: 'raster',
      tiles: ['https://cloud.sdsc.edu/v1/AUTH_opentopography/Raster/ASTER_GDEM/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenTopography/ASTER GDEM',
    },
    opensnowmap: {
      type: 'raster',
      tiles: ['https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: 'Data © OpenStreetMap contributors ODbL, OpenSnowMap.org CC-BY-SA',
    },
    'esri-clarity': {
      ...rasterSource(CLARITY_TILES, CLARITY_ATTRIBUTION),
    },
    slope: {
      type: 'raster',
      tiles: ['slope://{z}/{x}/{y}'],
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Slope derived from AWS Terrain Tiles',
    },
    aspect: {
      type: 'raster',
      tiles: ['aspect://{z}/{x}/{y}'],
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Aspect derived from AWS Terrain Tiles',
    },
    'mapbox-streets': {
      ...rasterSource(MAPBOX_STREET_TILES, MAPBOX_ATTRIBUTION, 512),
    },
    // A bounded parent-tile pyramid remains renderable beneath the detail
    // basemap. At close zoom MapLibre overscales these z12 tiles, so a late
    // detail request degrades to softer imagery instead of the base fill.
    'fallback-osm': fallbackRasterSource(OSM_TILES, OSM_ATTRIBUTION),
    'fallback-opentopomap': fallbackRasterSource(TOPO_TILES, TOPO_ATTRIBUTION),
    'fallback-satellite': fallbackRasterSource(SATELLITE_TILES, SATELLITE_ATTRIBUTION),
    'fallback-esri-clarity': fallbackRasterSource(CLARITY_TILES, CLARITY_ATTRIBUTION),
    'fallback-mapbox-streets': fallbackRasterSource(MAPBOX_STREET_TILES, MAPBOX_ATTRIBUTION, 512),
    'buildings-vector': {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · © <a href="https://openmaptiles.org/">OpenMapTiles</a>',
    },
    'terrain-dem': {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
    },
  },
  layers: [
    // Neutral base fill underneath every raster basemap. When a tile hasn't
    // loaded yet (cold start, slow network, or the preload safety timeout firing
    // offline), the gap shows this muted color instead of glaring white. See
    // issue #63.
    { id: 'base-fill', type: 'background', paint: { 'background-color': '#141b22' } },
    { id: 'fallback-satellite', type: 'raster', source: 'fallback-satellite', paint: { 'raster-fade-duration': 0 } },
    { id: 'fallback-esri-clarity', type: 'raster', source: 'fallback-esri-clarity', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    { id: 'fallback-opentopomap', type: 'raster', source: 'fallback-opentopomap', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    { id: 'fallback-osm', type: 'raster', source: 'fallback-osm', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    { id: 'fallback-mapbox-streets', type: 'raster', source: 'fallback-mapbox-streets', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    { id: 'background', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 0 } },
    { id: 'esri-clarity', type: 'raster', source: 'esri-clarity', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    { id: 'opentopomap', type: 'raster', source: 'opentopomap', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    { id: 'street', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    { id: 'mapbox-streets', type: 'raster', source: 'mapbox-streets', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    {
      id: 'buildings-3d', type: 'fill-extrusion', source: 'buildings-vector', 'source-layer': 'building',
      minzoom: 13, layout: { visibility: 'none' },
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': '#c9c3b9',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, ['coalesce', ['get', 'render_height'], 0]],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, ['coalesce', ['get', 'render_min_height'], 0]],
        'fill-extrusion-opacity': 1,
      },
    },
    { id: 'carto-labels', type: 'raster', source: 'carto-labels', layout: { visibility: 'none' } },
    { id: 'enhanced-hillshade', type: 'raster', source: 'enhanced-hillshade', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.6 } },
    { id: 'ski-pistes', type: 'raster', source: 'opensnowmap', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9 } },
    { id: 'slope-overlay', type: 'raster', source: 'slope', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.7 } },
    { id: 'aspect-overlay', type: 'raster', source: 'aspect', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.7 } },
  ],
  terrain: {
    source: 'terrain-dem',
    exaggeration: 1.2,
  },
} as const;

export const MAP_LAYERS: Record<string, { name: string; icon: string }> = {
  satellite: { name: 'Satellite', icon: '🛰️' },
  street: { name: 'Street', icon: '🛣️' },
  opentopomap: { name: 'Topo', icon: '⛰️' },
  'enhanced-hillshade': { name: 'Terrain', icon: '🏔️' },
  'esri-clarity': { name: 'Esri Clarity', icon: '📡' },
  wayback: { name: 'Wayback', icon: '🕰️' },
  ...(MAPBOX_TOKEN ? { 'mapbox-streets': { name: 'Mapbox Streets', icon: '🗺️' } } : {}),
};
