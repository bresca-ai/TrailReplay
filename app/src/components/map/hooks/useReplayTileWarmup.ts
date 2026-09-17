import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  BASEMAP_PRESENTATIONS,
  MAP_STYLE,
  STATIC_BASEMAP_LAYER_IDS,
  STATIC_FALLBACK_LAYER_IDS,
} from '@/components/map/mapStyle';
import {
  getPredictivePlaybackPoses,
  type ReplayCameraMode,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';
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
// completion lifecycle, so each predicted pose gets a short render window.
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
  elevationData: Array<{ elevation: number; progress?: number }>;
  followBehindZoomLevel: number;
  isMapLoaded: boolean;
  isPlaying: boolean;
  mapStyle: string;
  playbackProgress: number;
  playbackSpeed: number;
  totalDurationMs: number;
  diagnostics: TilePreloadObserver;
}

function deduplicatePoses(poses: ReplayCameraPose[]): ReplayCameraPose[] {
  const seen = new Set<string>();
  return poses.filter((pose) => {
    const key = `${pose.center[0].toFixed(5)}:${pose.center[1].toFixed(5)}:${pose.zoom.toFixed(1)}:${pose.pitch.toFixed(0)}:${pose.bearing.toFixed(0)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    if (!params.isMapLoaded || warmupMapRef.current || typeof document === 'undefined') return;

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

    const warmupMap = new maplibregl.Map({
      attributionControl: false,
      container,
      interactive: false,
      maxTileCacheSize: 1_200,
      style: MAP_STYLE as unknown as maplibregl.StyleSpecification,
    });
    warmupMapRef.current = warmupMap;
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
      warmupMap.remove();
      container.remove();
      warmupMapRef.current = null;
    };
  }, [params.diagnostics, params.isMapLoaded, scheduler]);

  useEffect(() => {
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
    };

    if (map.isStyleLoaded()) syncActiveBaseMap();
    else map.once('load', syncActiveBaseMap);

    return () => {
      map.off('load', syncActiveBaseMap);
    };
  }, [params.mapStyle]);

  useEffect(() => {
    if (!params.isMapLoaded) return;

    let cancelled = false;
    let isWarming = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const warmPose = (map: maplibregl.Map, pose: ReplayCameraPose) => new Promise<void>((resolve) => {
      const finish = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        isWarmupPoseActiveRef.current = false;
        resolve();
      };
      isWarmupPoseActiveRef.current = true;
      map.jumpTo(pose);
      timeoutId = setTimeout(finish, DISCOVERY_RENDER_WINDOW_MS);
    });

    const warmFuture = async () => {
      if (isWarming) return;
      const map = warmupMapRef.current;
      const current = latestParamsRef.current;
      if (!map || !map.loaded() || !current.isPlaying || current.cameraMode === 'overview') return;

      isWarming = true;

      // No cinematic-specific prediction yet — approximate with
      // follow-behind, which sits at a similar zoom/pitch, rather than
      // skipping predictive warmup for the mode entirely.
      const poseCameraMode = current.cameraMode === 'cinematic' ? 'follow-behind' : current.cameraMode;
      const isClose3D = poseCameraMode === 'follow-behind' && current.followBehindZoomLevel >= 66;
      const poses = deduplicatePoses(getPredictivePlaybackPoses({
        currentProgress: current.playbackProgress,
        horizonMs: (isClose3D ? CLOSE_3D_HORIZON_MS : NORMAL_HORIZON_MS)
          * Math.max(0.25, current.playbackSpeed),
        options: {
          cameraMode: poseCameraMode,
          coordinates: current.allCoordinates,
          elevationData: current.elevationData,
          followBehindZoomLevel: current.followBehindZoomLevel,
        },
        sampleCount: isClose3D ? CLOSE_3D_SAMPLE_COUNT : NORMAL_SAMPLE_COUNT,
        totalDurationMs: current.totalDurationMs || 60000,
      }));

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
      scheduler.clear();
      isWarmupPoseActiveRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [params.isMapLoaded, scheduler]);
}
