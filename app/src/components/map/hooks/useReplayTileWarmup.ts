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

const WARMUP_VIEWPORT = { width: 1920, height: 1080 };
// Discovery only needs MapLibre to submit its tile requests. Waiting for idle
// serializes the entire horizon behind slow imagery; the scheduler owns the
// completion lifecycle, so each predicted pose needs only one discovery frame.
// Keep a timeout for background tabs where requestAnimationFrame is suspended.
const DISCOVERY_RENDER_WINDOW_MS = 100;
const RESCHEDULE_INTERVAL_MS = 1500;
const NORMAL_HORIZON_MS = 20000;
const CLOSE_3D_HORIZON_MS = 45000;
const NORMAL_SAMPLE_COUNT = 12;
const CLOSE_3D_SAMPLE_COUNT = 36;

interface UseReplayTileWarmupParams {
  allCoordinates: number[][];
  animationPhase: 'preloading' | 'intro' | 'playing' | 'idle' | 'outro' | 'ended';
  cameraMode: ReplayCameraMode | 'cinematic';
  cinematicKeyframes?: PreparedCinematicKeyframe[];
  elevationData: Array<{ elevation: number; progress?: number }>;
  enabled: boolean;
  followBehindZoomLevel: number;
  isMapLoaded: boolean;
  isPlaying: boolean;
  visibleMapRef: React.MutableRefObject<maplibregl.Map | null>;
  mapStyle: string;
  playbackProgress: number;
  playbackSpeed: number;
  totalDurationMs: number;
  diagnostics: TilePreloadObserver;
}

/**
 * Uses an offscreen MapLibre instance to keep the browser's tile cache ahead of
 * the visible replay. It never mutates the customer-facing camera. High-pitch,
 * close follow-behind shots receive a wider horizon and more samples at turns.
 */
export function useReplayTileWarmup(params: UseReplayTileWarmupParams) {
  const [scheduler] = useState(() => new TileRequestScheduler({
    concurrency: 6,
    load: preloadTileImage,
    onComplete: (request) => params.diagnostics.markTileReady(request.sourceId, request.key),
  }));
  const warmupMapRef = useRef<maplibregl.Map | null>(null);
  const latestParamsRef = useRef(params);
  const isWarmupPoseActiveRef = useRef(false);
  const discoveryStepRef = useRef(0);
  useEffect(() => {
    latestParamsRef.current = params;
  });

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
    // Tile discovery needs imagery and DEM requests, not a second terrain
    // mesh rendered into textures on every pose. An invisible hillshade keeps
    // the DEM source active without the expensive terrain render pass.
    const discoveryStyle: maplibregl.StyleSpecification = {
      ...MAP_STYLE as unknown as maplibregl.StyleSpecification,
      layers: [
        ...MAP_STYLE.layers as unknown as maplibregl.LayerSpecification[],
        { id: 'warmup-dem', type: 'hillshade', source: 'terrain-dem', paint: { 'hillshade-exaggeration': 0 } },
      ],
    };
    delete discoveryStyle.terrain;
    const warmupMap = new maplibregl.Map({
      attributionControl: false,
      container,
      interactive: false,
      // Match authored shots; the default 60-degree cap missed their horizon.
      maxPitch: REPLAY_CAMERA_MAX_PITCH,
      cancelPendingTileRequestsWhileZooming: false,
      // The primary map owns decoded replay tiles. Discovery only needs a
      // small working set; completed requests remain in the browser cache.
      maxTileCacheSize: 256,
      // Discovery uses CSS viewport coverage, not retina-quality output. The
      // hidden 1920x1080 retina map was competing with playback for the GPU.
      pixelRatio: 1,
      style: discoveryStyle,
    });
    warmupMapRef.current = warmupMap;
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
      const url = getTileRequestUrl(sourceId, key);
      if (url) {
        scheduler.enqueue({
          key,
          // Time-to-use dominates source type: the next DEM tile must beat a
          // base tile that is thirty seconds farther down the route.
          priority: (discoveryStepRef.current * 10) + getTilePriority(sourceId),
          sourceId,
          url,
        });
      }
    };
    const onData = (event: unknown) => {
      const key = getMapLibreTileKey(event);
      const sourceId = (event as { sourceId?: string }).sourceId;
      if (key && sourceId) params.diagnostics.markTileReady(sourceId, key);
    };
    warmupMap.on('sourcedataloading', onLoading);
    warmupMap.on('sourcedata', onData);

    return () => {
      warmupMap.off('sourcedataloading', onLoading);
      warmupMap.off('sourcedata', onData);
      resizeObserver?.disconnect();
      warmupMap.remove();
      container.remove();
      warmupMapRef.current = null;
    };
  }, [params.diagnostics, params.enabled, params.isMapLoaded, params.visibleMapRef, scheduler]);

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

    if (map.isStyleLoaded()) syncActiveBaseMap();
    else map.once('load', syncActiveBaseMap);

    return () => {
      map.off('load', syncActiveBaseMap);
    };
  }, [params.enabled, params.mapStyle]);

  useEffect(() => {
    if (!params.enabled || !params.isMapLoaded) return;

    let cancelled = false;
    let isWarming = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let finishActivePose: (() => void) | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const warmPose = (map: maplibregl.Map, pose: ReplayCameraPose) => new Promise<void>((resolve) => {
      const finish = () => {
        map.off('render', finish);
        finishActivePose = null;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        isWarmupPoseActiveRef.current = false;
        resolve();
      };
      isWarmupPoseActiveRef.current = true;
      finishActivePose = finish;
      map.once('render', finish);
      timeoutId = setTimeout(finish, DISCOVERY_RENDER_WINDOW_MS);
      map.jumpTo(pose);
    });

    const warmFuture = async () => {
      if (isWarming) return;
      const map = warmupMapRef.current;
      const current = latestParamsRef.current;
      if (
        !map
        || !map.loaded()
        || (!current.isPlaying && current.animationPhase !== 'outro')
        || current.cameraMode === 'overview'
      ) return;

      isWarming = true;

      const isClose3D = current.cameraMode === 'follow-behind' && current.followBehindZoomLevel >= 66;
      const horizonMs = (isClose3D ? CLOSE_3D_HORIZON_MS : NORMAL_HORIZON_MS)
        * Math.max(0.25, current.playbackSpeed);
      const sampleCount = isClose3D ? CLOSE_3D_SAMPLE_COUNT : NORMAL_SAMPLE_COUNT;
      const playbackPoses = current.cameraMode === 'cinematic'
        ? getOpeningPreloadProgresses(current.totalDurationMs || 60000, horizonMs, sampleCount)
            .map((offset) => getReplayWarmupPose({
              cameraMode: current.cameraMode,
              cinematicKeyframes: current.cinematicKeyframes,
              coordinates: current.allCoordinates,
              elevationData: current.elevationData,
              followBehindZoomLevel: current.followBehindZoomLevel,
              progress: Math.min(1, current.playbackProgress + offset),
            }))
            .filter((pose): pose is ReplayCameraPose => pose !== null)
        : getPredictivePlaybackPoses({
            currentProgress: current.playbackProgress,
            horizonMs,
            options: {
              cameraMode: current.cameraMode,
              coordinates: current.allCoordinates,
              elevationData: current.elevationData,
              followBehindZoomLevel: current.followBehindZoomLevel,
            },
            sampleCount,
            totalDurationMs: current.totalDurationMs || 60000,
          });

      const reachesOutro = current.animationPhase === 'outro'
        || current.playbackProgress + (horizonMs / Math.max(1, current.totalDurationMs)) >= 1;
      let outroPoses: ReplayCameraPose[] = [];
      if (reachesOutro && current.allCoordinates.length > 0) {
        const finalPose = getReplayWarmupPose({
          cameraMode: current.cameraMode,
          cinematicKeyframes: current.cinematicKeyframes,
          coordinates: current.allCoordinates,
          elevationData: current.elevationData,
          followBehindZoomLevel: current.followBehindZoomLevel,
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
        }
      }
      const poses = deduplicateCameraPoses([...playbackPoses, ...outroPoses]);

      try {
        for (const [poseIndex, pose] of poses.entries()) {
          if (cancelled) return;
          discoveryStepRef.current = poseIndex;
          await warmPose(map, pose);
        }
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
      scheduler.clear();
      isWarmupPoseActiveRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [params.enabled, params.isMapLoaded, scheduler]);
}
