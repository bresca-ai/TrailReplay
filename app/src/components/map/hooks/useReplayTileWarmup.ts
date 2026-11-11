import { REPLAY_CAMERA_MAX_PITCH } from '@/utils/cameraLimits';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  BASEMAP_PRESENTATIONS,
  MAP_STYLE,
  STATIC_BASEMAP_LAYER_IDS,
  STATIC_FALLBACK_LAYER_IDS,
} from '@/components/map/mapStyle';
import { applyConsistentBasemapTileLod } from '@/components/map/basemapTileLod';
import {
  getOpeningPreloadProgresses,
  getPredictivePlaybackPoses,
  getRouteCoordinateAtProgress,
  type ReplayCameraMode,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';
import type { PreparedCinematicKeyframe } from '@/utils/cinematicCameraPlan';
import {
  deduplicateCameraPoses,
  getReplayWarmupPose,
  sampleCameraTransition,
} from '@/utils/replayCameraWarmupPlan';
import { getMapLibreTileKey, type TilePreloadObserver } from '@/utils/tilePreloadObserver';
import {
  getTilePriority,
  getTileRequestUrl,
  preloadTileImage,
  TileRequestScheduler,
} from '@/utils/tileRequestScheduler';
import { containsPosition, type LocationFeature } from '@/utils/locationBoundaries';
import { cameraForPlace } from './useLocationChapters';
import { routeTileCorridor } from '@/utils/routeTileCorridor';
import { beginRouteTilePreload, hasRetainedTile, markRouteTile, resetRouteTileCacheStats, retainRouteTile, routeTileCacheStats, routeTileCacheVersion } from '@/utils/routeTileCache';

const WARMUP_VIEWPORT = { width: 1920, height: 1080 };
// Terrain can expose additional imagery after the first render as DEM data
// arrives. Give each view a short bounded discovery window without waiting for
// every image to finish; the independent scheduler completes the requests.
const DISCOVERY_RENDER_WINDOW_MS = 200;
const RESCHEDULE_INTERVAL_MS = 1500;
const NORMAL_HORIZON_MS = 20000;
const CLOSE_3D_HORIZON_MS = 24000;
const NORMAL_SAMPLE_COUNT = 12;
const CLOSE_3D_SAMPLE_COUNT = 20;
const DISCOVERY_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

/** Discovery needs tile IDs, while the scheduler fetches the real imagery. */
export function discoveryTileRequest(url: string, resourceType?: string): { url: string } {
  if (resourceType !== 'Tile') return { url };
  const knownImagery = /^https:\/\/(?:server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/|clarity\.maptiles\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tile\/|tile\.openstreetmap\.org\/|a\.tile\.opentopomap\.org\/|api\.mapbox\.com\/styles\/v1\/mapbox\/streets-v12\/tiles\/512\/)/i.test(url);
  return { url: knownImagery ? DISCOVERY_TILE : url };
}

/** Lower values prioritize imagery near the route's position in the frame. */
export function viewportTilePriority(
  key: string,
  project: (point: [number, number]) => { x: number; y: number },
  width: number,
  height: number,
): number {
  const [z, x, y] = key.split('/').map(Number);
  if (![z, x, y, width, height].every(Number.isFinite) || z < 0 || z > 24 || width <= 0 || height <= 0) return 0;
  const world = 2 ** z;
  const longitude = ((x + 0.5) / world) * 360 - 180;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / world))) * 180 / Math.PI;
  try {
    const point = project([longitude, latitude]);
    const distance = Math.hypot((point.x - width / 2) / width, (point.y - height * 0.58) / height);
    return Number.isFinite(distance) ? Math.min(3, distance) * 3 : 0;
  } catch {
    return 0;
  }
}

/** Seconds until a route progress is reached at the current playback speed. */
export function replayViewOffsetSeconds(progress: number, currentProgress: number, durationMs: number, speed: number): number {
  return Math.max(0, progress - currentProgress) * Math.max(0, durationMs) / 1000 / Math.max(0.25, speed);
}

/** Spread the full sampling budget across the route that remains. */
export function replayWarmupHorizonMs(requestedMs: number, progress: number, durationMs: number): number {
  return Math.min(Math.max(0, requestedMs), Math.max(0, 1 - Math.max(0, Math.min(1, progress))) * Math.max(1, durationMs));
}

export function canReuseStartupWarmup(values: unknown[], previous: { values: unknown[]; at: number } | null, now: number, hasFailures: boolean): boolean {
  return Boolean(previous && now - previous.at < 300000 && !hasFailures
    && previous.values.length === values.length && previous.values.every((value, index) => value === values[index]));
}

interface UseReplayTileWarmupParams {
  allCoordinates: number[][];
  routeCoordinates?: number[][];
  animationPhase: 'preloading' | 'intro' | 'playing' | 'idle' | 'outro' | 'ended';
  cameraMode: ReplayCameraMode | 'cinematic';
  cinematicKeyframes?: PreparedCinematicKeyframe[];
  cameraStability?: number;
  aerialTerrainPlan?: number[] | null;
  aerialTerrainLoading?: boolean;
  elevationData: Array<{ elevation: number; progress?: number }>;
  enabled: boolean;
  followBehindZoomLevel: number;
  followBehindPitch?: number | null;
  isMapLoaded: boolean;
  isPlaying: boolean;
  visibleMapRef: React.MutableRefObject<maplibregl.Map | null>;
  mapStyle: string;
  playbackProgress: number;
  playbackSpeed: number;
  totalDurationMs: number;
  terrainExaggeration?: number;
  diagnostics: TilePreloadObserver;
  locationFeatures?: LocationFeature[];
  zoomToPlace?: boolean;
  onStartupReadyChange?: (ready: boolean) => void;
}

/**
 * Uses an offscreen MapLibre instance to keep the browser's tile cache ahead of
 * the visible replay. It never mutates the customer-facing camera. High-pitch,
 * close follow-behind shots receive a wider horizon and more samples at turns.
 */
export function useReplayTileWarmup(params: UseReplayTileWarmupParams) {
  const { animationPhase, onStartupReadyChange } = params;
  const latestParamsRef = useRef(params);
  const [scheduler] = useState(() => new TileRequestScheduler({
    concurrency: 6,
    load: (url, signal, request) => request?.retain ? retainRouteTile(url, signal) : preloadTileImage(url, signal),
    isCompletedAvailable: (request) => !request.retain || hasRetainedTile(request.url),
    // Keep missed predictions available, but do not let a long backlog from
    // a past view block tiles the camera is about to need after a seek.
    isStale: (request) => !request.retain && (request.neededAt ?? request.priority) < (performance.now() / 1000) - 3,
  }));
  const warmupMapRef = useRef<maplibregl.Map | null>(null);
  const warmupInitializedRef = useRef(false);
  const isWarmupPoseActiveRef = useRef(false);
  const discoveryOffsetRef = useRef(0);
  const discoveryScanTimeRef = useRef(0);
  const startupScannedRef = useRef(false);
  const startupCacheVersionRef = useRef(0);
  const completedStartupRef = useRef<{ values: unknown[]; at: number; cacheVersion: number } | null>(null);
  useEffect(() => {
    if (animationPhase === 'preloading' && onStartupReadyChange) {
      onStartupReadyChange(false);
      startupScannedRef.current = false;
      resetRouteTileCacheStats();
      if (import.meta.env.DEV) document.documentElement.dataset.tileWarmupMode = 'scan';
    }
  }, [animationPhase, onStartupReadyChange]);
  useEffect(() => {
    if (!import.meta.env.DEV || typeof document === 'undefined') return;
    const publish = () => {
      document.documentElement.dataset.tileWarmupQueue = JSON.stringify(scheduler.snapshot());
      document.documentElement.dataset.routeTileCache = JSON.stringify(routeTileCacheStats());
    };
    publish();
    const interval = window.setInterval(publish, 500);
    return () => { window.clearInterval(interval); delete document.documentElement.dataset.tileWarmupQueue; delete document.documentElement.dataset.tileWarmupMode; delete document.documentElement.dataset.routeTileCache; };
  }, [scheduler]);
  useEffect(() => {
    latestParamsRef.current = params;
  });
  useEffect(() => {
    scheduler.setOnComplete((request) => latestParamsRef.current.diagnostics.markTileReady(request.sourceId, request.key));
    return () => scheduler.setOnComplete(undefined);
  }, [scheduler]);

  useEffect(() => {
    if (!params.enabled || !params.isMapLoaded || warmupMapRef.current || typeof document === 'undefined') return;

    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    Object.assign(container.style, {
      height: `${WARMUP_VIEWPORT.height}px`,
      left: '-10000px',
      pointerEvents: 'none',
      position: 'fixed',
      top: '0',
      width: `${WARMUP_VIEWPORT.width}px`,
    });
    document.body.appendChild(container);

    const visibleContainer = params.visibleMapRef.current?.getContainer();
    if (visibleContainer) {
      container.style.width = `${visibleContainer.clientWidth || WARMUP_VIEWPORT.width}px`;
      container.style.height = `${visibleContainer.clientHeight || WARMUP_VIEWPORT.height}px`;
    }
    // A tilted camera sees a different tile footprint over mountains than it
    // does on a flat plane. Use the same terrain for discovery when active;
    // the pixel ratio and bounded cache below limit the additional GPU load.
    const discoveryStyle: maplibregl.StyleSpecification = {
      ...MAP_STYLE as unknown as maplibregl.StyleSpecification,
      layers: [
        ...MAP_STYLE.layers as unknown as maplibregl.LayerSpecification[],
        ...((params.terrainExaggeration ?? 0) > 0 ? [] : [
          { id: 'warmup-dem', type: 'hillshade' as const, source: 'terrain-dem', paint: { 'hillshade-exaggeration': 0 } },
        ]),
      ],
    };
    if ((params.terrainExaggeration ?? 0) > 0) {
      discoveryStyle.terrain = { source: 'terrain-dem', exaggeration: params.terrainExaggeration };
    } else {
      delete discoveryStyle.terrain;
    }
    const warmupMap = new maplibregl.Map({
      attributionControl: false,
      container,
      interactive: false,
      // Match authored shots; the default 60-degree cap missed their horizon.
      maxPitch: REPLAY_CAMERA_MAX_PITCH,
      cancelPendingTileRequestsWhileZooming: false,
      transformRequest: discoveryTileRequest,
      // The primary map owns decoded replay tiles. Discovery only needs a
      // small working set; completed requests remain in the browser cache.
      maxTileCacheSize: 128,
      // Discovery uses CSS viewport coverage, not retina-quality output. The
      // hidden 1920x1080 retina map was competing with playback for the GPU.
      pixelRatio: 1,
      style: discoveryStyle,
    });
    warmupMapRef.current = warmupMap;
    const onInitialLoad = () => { warmupInitializedRef.current = true; };
    warmupMap.once('style.load', onInitialLoad);
    const resizeObserver = visibleContainer ? new ResizeObserver(() => {
      const width = visibleContainer.clientWidth;
      const height = visibleContainer.clientHeight;
      if (width <= 0 || height <= 0) return;
      if (container.style.width === `${width}px` && container.style.height === `${height}px`) return;
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
      warmupMap.resize();
    }) : null;
    if (visibleContainer) resizeObserver?.observe(visibleContainer);
    const onLoading = (event: unknown) => {
      if (!isWarmupPoseActiveRef.current) return;
      const key = getMapLibreTileKey(event);
      const sourceId = (event as { sourceId?: string }).sourceId;
      if (!key || !sourceId) return;

      const presentation = BASEMAP_PRESENTATIONS[latestParamsRef.current.mapStyle]
        ?? BASEMAP_PRESENTATIONS.satellite;
      const isEssentialSource = sourceId === 'terrain-dem'
        || sourceId === presentation.sourceId
        || sourceId === presentation.fallbackSourceId;
      if (!isEssentialSource) return;

      params.diagnostics.predictTile(sourceId, key);
      const source = MAP_STYLE.sources[sourceId as keyof typeof MAP_STYLE.sources];
      const template = source && 'tiles' in source ? source.tiles[0] : undefined;
      const url = getTileRequestUrl(sourceId, key, template);
      if (url) {
        const canvas = warmupMap.getCanvas();
        const viewportPriority = viewportTilePriority(key, point => warmupMap.project(point), canvas.clientWidth, canvas.clientHeight);
        scheduler.enqueue({
          key,
          // Time-to-use dominates source type: the next DEM tile must beat a
          // base tile that is thirty seconds farther down the route.
          neededAt: discoveryScanTimeRef.current + discoveryOffsetRef.current,
          priority: discoveryScanTimeRef.current + discoveryOffsetRef.current + getTilePriority(sourceId) + viewportPriority,
          sourceId,
          url,
        });
      }
    };
    const onData = (event: unknown) => {
      const key = getMapLibreTileKey(event);
      const sourceId = (event as { sourceId?: string }).sourceId;
      // Raster discovery uses placeholder images; only the scheduler can
      // report when the corresponding real imagery has finished loading.
      if (key && sourceId === 'terrain-dem') params.diagnostics.markTileReady(sourceId, key);
    };
    warmupMap.on('sourcedataloading', onLoading);
    warmupMap.on('sourcedata', onData);

    return () => {
      warmupMap.off('sourcedataloading', onLoading);
      warmupMap.off('sourcedata', onData);
      warmupMap.off('style.load', onInitialLoad);
      resizeObserver?.disconnect();
      warmupMap.remove();
      container.remove();
      warmupMapRef.current = null;
      warmupInitializedRef.current = false;
    };
  }, [params.diagnostics, params.enabled, params.isMapLoaded, params.visibleMapRef, params.terrainExaggeration, scheduler]);

  useEffect(() => {
    if (!params.enabled) return;
    const map = warmupMapRef.current;
    if (!map) return;

    const syncActiveBaseMap = () => {
      const presentation = BASEMAP_PRESENTATIONS[latestParamsRef.current.mapStyle]
        ?? BASEMAP_PRESENTATIONS.satellite;
      const activeLayers = new Set([presentation.layerId, presentation.fallbackLayerId]);
      [...STATIC_BASEMAP_LAYER_IDS, ...STATIC_FALLBACK_LAYER_IDS].forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', activeLayers.has(layerId) ? 'visible' : 'none');
        }
      });
      applyConsistentBasemapTileLod(map, latestParamsRef.current.mapStyle);
    };

    if (warmupInitializedRef.current || map.isStyleLoaded()) syncActiveBaseMap();
    else map.once('style.load', syncActiveBaseMap);

    return () => {
      map.off('style.load', syncActiveBaseMap);
    };
  }, [params.diagnostics, params.enabled, params.isMapLoaded, params.mapStyle, params.terrainExaggeration]);

  useEffect(() => {
    if (!params.enabled || !params.isMapLoaded) return;

    let cancelled = false;
    let isWarming = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let finishActivePose: (() => void) | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const warmPose = (map: maplibregl.Map, pose: ReplayCameraPose) => new Promise<void>((resolve) => {
      const finish = () => {
        finishActivePose = null;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve();
      };
      finishActivePose = finish;
      timeoutId = setTimeout(finish, DISCOVERY_RENDER_WINDOW_MS);
      const current = latestParamsRef.current;
      const visiblePadding = current.visibleMapRef.current?.getPadding();
      map.jumpTo({ ...pose, padding: visiblePadding ?? { top: current.cameraMode === 'aerial-follow' ? map.getCanvas().clientHeight * 0.16 : 0, bottom: 0, left: 0, right: 0 } });
    });

    const warmFuture = async () => {
      if (isWarming) return;
      const map = warmupMapRef.current;
      const current = latestParamsRef.current;
      if (
        !map
        || !warmupInitializedRef.current
        || (!current.isPlaying && !['preloading', 'intro', 'outro'].includes(current.animationPhase))
        || current.cameraMode === 'overview'
        || (current.cameraMode === 'aerial-follow' && current.aerialTerrainLoading)
      ) return;

      const viewport = current.visibleMapRef.current?.getContainer();
      const startupValues = [current.allCoordinates, current.routeCoordinates, current.elevationData, current.aerialTerrainPlan,
        current.cinematicKeyframes, current.cameraMode, current.cameraStability, current.mapStyle,
        current.followBehindZoomLevel, current.followBehindPitch, current.totalDurationMs,
        current.terrainExaggeration, current.locationFeatures, current.zoomToPlace,
        viewport?.clientWidth, viewport?.clientHeight];
      const previous = completedStartupRef.current;
      if (current.animationPhase === 'preloading' && current.onStartupReadyChange && !startupScannedRef.current
        && previous?.cacheVersion === routeTileCacheVersion()
        && canReuseStartupWarmup(startupValues, previous, performance.now(), scheduler.hasFailures())) {
        startupScannedRef.current = true;
        if (import.meta.env.DEV) document.documentElement.dataset.tileWarmupMode = 'reuse';
      }

      if (current.animationPhase === 'preloading' && current.onStartupReadyChange && startupScannedRef.current) {
        if (scheduler.pendingRetained() === 0) {
          if (!scheduler.hasFailures() && startupCacheVersionRef.current === routeTileCacheVersion()) {
            completedStartupRef.current = { values: startupValues, at: performance.now(), cacheVersion: routeTileCacheVersion() };
          }
          current.onStartupReadyChange(true);
        }
        return;
      }

      isWarming = true;
      isWarmupPoseActiveRef.current = true;
      // Do not discard the backlog: MapLibre can retain discovery tiles and
      // will not emit sourcedataloading again when a later scan revisits them.
      // A monotonic scan time lets new nearby views compete with older future
      // views while preserving requests that may never be rediscovered.
      discoveryScanTimeRef.current = performance.now() / 1000;

      const isClose3D = current.cameraMode === 'aerial-follow' || (current.cameraMode === 'follow-behind' && current.followBehindZoomLevel >= 66);
      const startupScan = current.animationPhase === 'preloading' && Boolean(current.onStartupReadyChange);
      if (startupScan) {
        startupCacheVersionRef.current = routeTileCacheVersion();
        beginRouteTilePreload();
        // Camera samples can skip a narrow valley or a fast turn. Request a
        // continuous corridor independently so every route section has local
        // imagery even when the projected viewport changes between samples.
        const presentation = BASEMAP_PRESENTATIONS[current.mapStyle] ?? BASEMAP_PRESENTATIONS.satellite;
        const source = MAP_STYLE.sources[presentation.sourceId as keyof typeof MAP_STYLE.sources];
        const template = source && 'tiles' in source ? source.tiles[0] : undefined;
        const route = current.routeCoordinates ?? current.allCoordinates;
        const sources = [{ id: presentation.sourceId, template, zooms: [11, 12, 13, 14, 15, 16], maxRingZoom: 16 },
          ...((current.terrainExaggeration ?? 0) > 0 ? [{ id: 'terrain-dem', template: undefined, zooms: [12, 13, 14, 15], maxRingZoom: 15 }] : [])];
        // Enqueue every tile touched by the track before its surrounding ring.
        // Both classes stay ahead of the far-away viewport discoveries.
        for (const radius of [0, 1]) {
          for (const source of sources) for (const zoom of source.zooms) {
            if (radius === 1 && zoom > source.maxRingZoom) continue;
            for (const key of routeTileCorridor(route, zoom, radius)) {
              const url = getTileRequestUrl(source.id, key, source.template);
              if (!url) continue;
              markRouteTile(url);
              current.diagnostics.predictTile(source.id, key);
              scheduler.enqueue({ key, sourceId: source.id, url, retain: true,
                priority: discoveryScanTimeRef.current - (radius === 0 ? 200 : 100), neededAt: discoveryScanTimeRef.current + 120 });
            }
          }
        }
      }
      const horizonMs = replayWarmupHorizonMs(
        startupScan ? current.totalDurationMs :
        (isClose3D ? CLOSE_3D_HORIZON_MS : NORMAL_HORIZON_MS) * Math.max(0.25, current.playbackSpeed),
        current.playbackProgress,
        current.totalDurationMs || 60000,
      );
      const sampleCount = startupScan ? Math.max(32, Math.min(96, Math.ceil(current.totalDurationMs / 1000))) : isClose3D ? CLOSE_3D_SAMPLE_COUNT : NORMAL_SAMPLE_COUNT;
      const viewOffsets = new Map<ReplayCameraPose, number>();
      const playbackPoses = current.cameraMode === 'cinematic' || current.cameraMode === 'aerial-follow'
        ? getOpeningPreloadProgresses(current.totalDurationMs || 60000, horizonMs, sampleCount)
            .map((offset) => {
              const progress = Math.min(1, current.playbackProgress + offset);
              const pose = getReplayWarmupPose({
              cameraMode: current.cameraMode,
              cinematicKeyframes: current.cinematicKeyframes,
              aerialTerrainPlan: current.aerialTerrainPlan,
              cameraStability: current.cameraStability,
              totalDurationMs: current.totalDurationMs,
              coordinates: current.allCoordinates,
              elevationData: current.elevationData,
              followBehindZoomLevel: current.followBehindZoomLevel,
              followBehindPitch: current.followBehindPitch,
              progress,
            });
              return pose;
            })
            .filter((pose): pose is ReplayCameraPose => pose !== null)
        : getPredictivePlaybackPoses({
            currentProgress: current.playbackProgress,
            horizonMs,
            options: {
              cameraMode: current.cameraMode,
              coordinates: current.allCoordinates,
              elevationData: current.elevationData,
              followBehindZoomLevel: current.followBehindZoomLevel,
              followBehindPitch: current.followBehindPitch,
            },
            sampleCount,
            totalDurationMs: current.totalDurationMs || 60000,
          });

      playbackPoses.forEach((pose, index) => {
        const offset = (horizonMs / Math.max(1, current.totalDurationMs)) * index / Math.max(1, playbackPoses.length - 1);
        viewOffsets.set(pose, replayViewOffsetSeconds(Math.min(1, current.playbackProgress + offset), current.playbackProgress, current.totalDurationMs, current.playbackSpeed));
      });

      const reachesOutro = current.animationPhase === 'outro'
        || current.playbackProgress + (horizonMs / Math.max(1, current.totalDurationMs)) >= 1 - 1e-9;
      let outroPoses: ReplayCameraPose[] = [];
      if (reachesOutro && current.allCoordinates.length > 0) {
        const finalPose = getReplayWarmupPose({
          cameraMode: current.cameraMode,
          cinematicKeyframes: current.cinematicKeyframes,
          aerialTerrainPlan: current.aerialTerrainPlan,
          cameraStability: current.cameraStability,
          totalDurationMs: current.totalDurationMs,
          coordinates: current.allCoordinates,
          elevationData: current.elevationData,
          followBehindZoomLevel: current.followBehindZoomLevel,
          followBehindPitch: current.followBehindPitch,
          progress: 1,
        });
        const bounds = new maplibregl.LngLatBounds();
        current.allCoordinates.forEach((coordinate) => bounds.extend(coordinate as [number, number]));
        const outroCamera = map.cameraForBounds(bounds, { padding: 100, bearing: 0 });
        const outroCenter = outroCamera?.center ? maplibregl.LngLat.convert(outroCamera.center) : null;
        if (finalPose && outroCamera && outroCenter) {
          outroPoses = sampleCameraTransition(finalPose, {
            center: [outroCenter.lng, outroCenter.lat],
            zoom: outroCamera.zoom ?? map.getZoom(),
            pitch: 45,
            bearing: 0,
          });
          outroPoses.forEach(pose => viewOffsets.set(pose, replayViewOffsetSeconds(1, current.playbackProgress, current.totalDurationMs, current.playbackSpeed)));
        }
      }
      // Route-only prediction misses the wide country/region views entirely.
      // Discover the next places and sample the zoom path on the hidden map,
      // keeping the visible camera untouched.
      const placePoses: ReplayCameraPose[] = [];
      if (current.zoomToPlace && current.locationFeatures?.length) {
        const end = Math.min(1, current.playbackProgress + horizonMs / Math.max(1, current.totalDurationMs));
        const seen = new Set<string>();
        for (let i = 0; i <= 48 && seen.size < 3; i++) {
          const progress = current.playbackProgress + (end - current.playbackProgress) * i / 48;
          const point = getRouteCoordinateAtProgress(current.allCoordinates, progress);
          if (!point) continue;
          const feature = current.locationFeatures.find(item => containsPosition(item, point));
          if (!feature || seen.has(feature.properties.id)) continue;
          seen.add(feature.properties.id);
          const target = cameraForPlace(map, feature, point);
          const from = getReplayWarmupPose({ cameraMode: current.cameraMode, cinematicKeyframes: current.cinematicKeyframes, aerialTerrainPlan: current.aerialTerrainPlan, cameraStability: current.cameraStability, totalDurationMs: current.totalDurationMs,
            coordinates: current.allCoordinates, elevationData: current.elevationData, followBehindZoomLevel: current.followBehindZoomLevel, progress });
          if (target && from) {
            const transition = sampleCameraTransition(from, target, 12);
            transition.forEach(pose => viewOffsets.set(pose, replayViewOffsetSeconds(progress, current.playbackProgress, current.totalDurationMs, current.playbackSpeed)));
            placePoses.push(...transition);
          }
        }
      }
      // Overview transitions can contain dozens of samples. Interleave them
      // with the route so they cannot delay every flight viewport until after
      // the marker has already passed it. Start with the immediate route view.
      const upcomingPoses: ReplayCameraPose[] = [];
      for (let i = 0; i < Math.max(playbackPoses.length, placePoses.length); i++) {
        if (playbackPoses[i]) upcomingPoses.push(playbackPoses[i]);
        if (placePoses[i]) upcomingPoses.push(placePoses[i]);
      }
      const poses = deduplicateCameraPoses([...upcomingPoses, ...outroPoses]);

      try {
        for (const pose of poses) {
          if (cancelled) return;
          discoveryOffsetRef.current = viewOffsets.get(pose) ?? 0;
          await warmPose(map, pose);
        }
        if (startupScan && !cancelled) startupScannedRef.current = true;
      } finally {
        isWarming = false;
      }
    };

    // Scan the whole horizon quickly; request completion is deliberately owned
    // by the independent queue rather than by the offscreen map's idle state.
    void warmFuture();
    intervalId = setInterval(() => { void warmFuture(); }, RESCHEDULE_INTERVAL_MS);

    return () => {
      cancelled = true;
      finishActivePose?.();
      scheduler.cancelPending();
      isWarmupPoseActiveRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [params.enabled, params.isMapLoaded, scheduler]);
}
