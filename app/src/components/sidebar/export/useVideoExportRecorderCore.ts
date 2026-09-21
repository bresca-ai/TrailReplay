import { calculateCurrentLiveStats } from '@/components/stats/liveStats';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/store/useAppStore';
import type { StatId } from '@/types';
import { getActivityIconOption, isSvgActivityIcon } from '@/utils/activityIcons';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import {
  buildJourneyDistanceProfile,
  getJourneyPointAtDistance,
  getJourneyPointAtProgress,
  getSegmentAtDistance,
  getSegmentAtProgress,
  type JourneyPoint,
} from '@/utils/journeyUtils';
import { mapGlobalRef } from '@/utils/mapRef';
import {
  getIntroCameraPose,
  getOpeningPreloadProgresses,
  getPlaybackCameraPose,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';
import { getStatAvailability, isStatAvailable } from '@/utils/statAvailability';
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatSpeedFromKmh,
  formatStatsDuration,
} from '@/utils/units';
import { estimateFileSize } from '@/utils/videoExport';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawExportFrame } from './drawExportFrame';
import { MP4_MIME_TYPES } from './exportConfig';
import { waitForSettledFrame } from './exportMapSettle';
import { getOverlayRefreshIntervalMs } from './exportOverlay';
import { isWebCodecsMp4Supported, type Mp4CanvasEncoder } from './mp4CanvasEncoder';
import type { StudioDeliveryJob, StudioDeliveryRequest } from './studioDelivery';
import { useExportOverlayCapture } from './useExportOverlayCapture';

const EXPORT_TILE_PRELOAD_TIMEOUT_MS = 6000;
const EXPORT_OPENING_WINDOW_MS = 20000;
const EXPORT_OPENING_SAMPLE_COUNT = 8;
// A studio frame stops waiting after this long so one unreachable tile cannot
// strand a 1800-frame export. Measured worst-case settle on satellite + terrain
// at 4K was 1.27s, so this leaves an order of magnitude of headroom.
const STUDIO_FRAME_SETTLE_TIMEOUT_MS = 10_000;

export type StudioDeliveryStatus = 'idle' | 'registering' | 'uploading' | 'emailing' | 'sent' | 'failed';

export interface UseVideoExportRecorderOptions {
  studioDelivery?: StudioDeliveryRequest;
}

export function useVideoExportRecorderCore(options: UseVideoExportRecorderOptions = {}) {
  const { t, language } = useI18n();
  const { studioDelivery } = options;
  const videoExportSettings = useAppStore((state) => state.videoExportSettings);
  const configuredStats = useAppStore((state) => state.settings.visibleStats);
  const showElevationProfile = useAppStore((state) => state.settings.showElevationProfile);
  const mapStyle = useAppStore((state) => state.settings.mapStyle);
  const show3DTerrain = useAppStore((state) => state.settings.show3DTerrain);
  const tracks = useAppStore((state) => state.tracks);
  const visibleStats = useMemo(() => {
    const availability = getStatAvailability(tracks);
    return configuredStats.filter((id) => isStatAvailable(id, availability));
  }, [configuredStats, tracks]);
  const pictures = useAppStore((state) => state.pictures);
  const videos = useAppStore((state) => state.videos);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const trailStyle = useAppStore((state) => state.settings.trailStyle);
  const cameraSettings = useAppStore((state) => state.cameraSettings);
  const playback = useAppStore((state) => state.playback);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const isExporting = useAppStore((state) => state.isExporting);
  const exportProgress = useAppStore((state) => state.exportProgress);
  const exportStage = useAppStore((state) => state.exportStage);
  const setIsExporting = useAppStore((state) => state.setIsExporting);
  const setIsDeterministicExport = useAppStore((state) => state.setIsDeterministicExport);
  const setExportProgress = useAppStore((state) => state.setExportProgress);
  const setExportStage = useAppStore((state) => state.setExportStage);
  const resetPlayback = useAppStore((state) => state.resetPlayback);
  const setSpeed = useAppStore((state) => state.setSpeed);
  const play = useAppStore((state) => state.play);
  const setCinematicPlayed = useAppStore((state) => state.setCinematicPlayed);
  const {
    activeTrack,
    cameraPathCoordinates,
    computedJourney,
    elevationData,
    segmentTimings,
    totalDistance,
  } = useComputedJourney();
  const journeyDistanceProfile = useMemo(
    () => computedJourney ? buildJourneyDistanceProfile(computedJourney.coordinates) : null,
    [computedJourney],
  );

  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [studioDeliveryStatus, setStudioDeliveryStatus] = useState<StudioDeliveryStatus>('idle');
  const [studioDeliveryError, setStudioDeliveryError] = useState<string | null>(null);

  const studioSupported = useMemo(() => isWebCodecsMp4Supported(), []);
  const mp4Supported = useMemo(
    () => studioSupported || MP4_MIME_TYPES.some((mimeType) => MediaRecorder.isTypeSupported(mimeType)),
    [studioSupported]
  );
  const actualFormat = videoExportSettings.format === 'mp4' && !mp4Supported ? 'webm' : videoExportSettings.format;
  const estimatedSize = estimateFileSize(playback.totalDuration, videoExportSettings);
  const includeStats = visibleStats.length > 0;
  const includeElevation = showElevationProfile;
  const overlayRefreshIntervalMs = useMemo(() => getOverlayRefreshIntervalMs(videoExportSettings.fps), [videoExportSettings.fps]);
  const getStatsValues = useCallback((progress: number): Partial<Record<StatId, string>> => {
    const state = useAppStore.getState();
    const routeTimingMode = state.playback.routeTimingMode;
    let journeyPosition: JourneyPoint | null = null;
    if (computedJourney) {
      journeyPosition = routeTimingMode === 'uniform' && journeyDistanceProfile
        ? getJourneyPointAtDistance(
            journeyDistanceProfile,
            journeyDistanceProfile.totalDistance * progress,
          )
        : getJourneyPointAtProgress(progress, computedJourney.coordinates, segmentTimings);
    } else if (activeTrack) {
      const trackPosition = interpolateTrackPoint(activeTrack, activeTrack.totalDistance * progress);
      if (trackPosition) {
        journeyPosition = {
          ...trackPosition,
          segmentIndex: 0,
          segmentType: 'track',
          trackId: activeTrack.id,
        };
      }
    }
    if (!journeyPosition) return {};
    const currentStats = calculateCurrentLiveStats({
      activeTrack,
      computedJourney,
      currentPosition: journeyPosition,
      playbackProgress: progress,
      restartPerTrack: state.settings.journeyStatsMode === 'per-track',
      segmentTimings,
      totalDistance,
      tracks: state.tracks,
      videoDurationSeconds: state.playback.totalDuration / 1000,
    });
    const isInTransport = journeyPosition.segmentType === 'transport';
    const values: Partial<Record<StatId, string>> = {};

    visibleStats.forEach((id) => {
      switch (id) {
        case 'duration':
          values[id] = formatStatsDuration(currentStats.duration);
          break;
        case 'movingDuration':
          values[id] = formatStatsDuration(currentStats.movingDuration);
          break;
        case 'distance':
          values[id] = formatDistance(currentStats.distance, state.settings.unitSystem);
          break;
        case 'pace':
          values[id] = isInTransport
            ? '--'
            : formatPace(
                state.settings.paceMode === 'per-km'
                  ? currentStats.rollingSpeed
                  : currentStats.averageSpeed,
                state.settings.unitSystem,
              );
          break;
        case 'elevation':
          values[id] = isInTransport
            ? '--'
            : formatElevation(currentStats.elevationGain, state.settings.unitSystem);
          break;
        case 'speed':
          values[id] = formatSpeedFromKmh(currentStats.currentSpeed, state.settings.unitSystem);
          break;
        case 'altitude':
          values[id] = currentStats.altitude !== null
            ? formatElevation(currentStats.altitude, state.settings.unitSystem)
            : '--';
          break;
        case 'heartRate':
          if (currentStats.heartRate) {
            values[id] = `${Math.round(currentStats.heartRate)} ${t('stats.bpm')}`;
          }
          break;
      }
    });

    return values;
  }, [activeTrack, computedJourney, journeyDistanceProfile, segmentTimings, t, totalDistance, visibleStats]);
  const getTrackLabel = useCallback((progress: number): { color: string; text: string } | null => {
    const state = useAppStore.getState();
    if (!state.settings.trailStyle.showTrackLabels) return null;

    if (!computedJourney) {
      return activeTrack
        ? { color: state.settings.trailStyle.trailColor, text: activeTrack.name }
        : null;
    }

    const currentSegment = state.playback.routeTimingMode === 'uniform' && journeyDistanceProfile
      ? getSegmentAtDistance(
          journeyDistanceProfile,
          journeyDistanceProfile.totalDistance * progress,
          segmentTimings,
        )
      : getSegmentAtProgress(progress, segmentTimings);
    const trackId = currentSegment?.segment.type === 'track'
      ? currentSegment.segment.trackId
      : undefined;
    const track = trackId ? state.tracks.find((candidate) => candidate.id === trackId) : null;
    return track
      ? { color: track.color || state.settings.trailStyle.trailColor, text: track.name }
      : null;
  }, [activeTrack, computedJourney, journeyDistanceProfile, segmentTimings]);
  const {
    cachedOverlayRef,
    drawElevationProgress,
    drawStatsValues,
    drawVideoFrame,
    loadHtml2Canvas,
    overlayBusyRef,
    overlayLastUpdateRef,
    resetOverlayCapture,
    updateOverlayAsync,
  } = useExportOverlayCapture({
    elevationData,
    getStatsValues,
    includeElevation,
    includeStats,
  });

  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef(0);
  const isRecordingRef = useRef(false);
  const recordingCancelledRef = useRef(false);
  const mp4EncoderRef = useRef<Mp4CanvasEncoder | null>(null);
  const useWebCodecsRef = useRef(false);
  const setUseWebCodecs = useCallback((enabled: boolean) => {
    useWebCodecsRef.current = enabled;
  }, []);
  const frameRequestRef = useRef<number | null>(null);
  const frameCleanupRef = useRef<(() => void) | null>(null);
  const cachedLogoRef = useRef<HTMLImageElement | null>(null);
  const svgMarkerImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingSvgMarkerLoadsRef = useRef<Set<string>>(new Set());
  // Studio quality is decided once when the export starts. Reading the store
  // mid-export would let a settings change swap the frame pacing halfway
  // through a recording.
  const studioQualityRef = useRef(false);
  const studioStatsRef = useRef({ frames: 0, timedOutFrames: 0, waitedMs: 0 });
  const rasterFadeRestoreRef = useRef<Array<() => void>>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const hiddenSinceRef = useRef<number | null>(null);
  const hiddenMsRef = useRef(0);
  const studioDeliveryJobRef = useRef<StudioDeliveryJob | null>(null);

  const preloadSvgMarkerIcon = useCallback((url: string) => {
    if (!url || svgMarkerImageCacheRef.current.has(url) || pendingSvgMarkerLoadsRef.current.has(url)) {
      return;
    }

    pendingSvgMarkerLoadsRef.current.add(url);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      svgMarkerImageCacheRef.current.set(url, image);
      pendingSvgMarkerLoadsRef.current.delete(url);
    };
    image.onerror = () => {
      pendingSvgMarkerLoadsRef.current.delete(url);
    };
    image.src = url;
  }, []);

  useEffect(() => {
    const iconValues = new Set<string>([trailStyle.currentIcon]);
    tracks.forEach((track) => iconValues.add(track.activityIcon));

    iconValues.forEach((iconValue) => {
      if (!isSvgActivityIcon(iconValue)) return;
      const svgIconUrl = getActivityIconOption(iconValue)?.content;
      if (svgIconUrl) {
        preloadSvgMarkerIcon(svgIconUrl);
      }
    });
  }, [preloadSvgMarkerIcon, tracks, trailStyle.currentIcon]);

  const captureFrame = useCallback(() => {
    drawExportFrame({
      recordingCanvasRef,
      recordingContextRef,
      videoExportSettings,
      cachedOverlayRef,
      drawVideoFrame,
      drawStatsValues,
      drawElevationProgress,
      svgMarkerImageCacheRef,
      preloadSvgMarkerIcon,
      getTrackLabel,
      cachedLogoRef,
      overlayLastUpdateRef,
      overlayBusyRef,
      overlayRefreshIntervalMs,
      updateOverlayAsync,
      t,
    });
  }, [cachedOverlayRef, drawElevationProgress, drawStatsValues, drawVideoFrame, getTrackLabel, overlayBusyRef, overlayLastUpdateRef, overlayRefreshIntervalMs, preloadSvgMarkerIcon, t, updateOverlayAsync, videoExportSettings]);

  // When encoding via WebCodecs, push the freshly drawn canvas to the encoder.
  // No-op for the MediaRecorder path, which samples the canvas stream itself.
  const encodeWebCodecsFrame = useCallback(async (timestampMicros?: number) => {
    if (!useWebCodecsRef.current || !mp4EncoderRef.current || !recordingCanvasRef.current) return;
    const elapsedMicros = timestampMicros ?? (performance.now() - recordingStartTimeRef.current) * 1000;
    await mp4EncoderRef.current.encodeCanvas(recordingCanvasRef.current, elapsedMicros);
  }, []);

  const startFrameCapture = useCallback(() => {
    const map = mapGlobalRef.current;
    const targetFrameInterval = 1000 / videoExportSettings.fps;
    let lastCaptureTime = 0;

    if (!map) {
      const captureLoop = () => {
        if (!isRecordingRef.current) return;
        const now = performance.now();
        if (now - lastCaptureTime >= targetFrameInterval) {
          captureFrame();
          void encodeWebCodecsFrame();
          lastCaptureTime = now;
        }
        frameRequestRef.current = requestAnimationFrame(captureLoop);
      };
      frameRequestRef.current = requestAnimationFrame(captureLoop);
      return;
    }

    const onRender = () => {
      if (!isRecordingRef.current) return;
      const now = performance.now();
      if (now - lastCaptureTime >= targetFrameInterval) {
        captureFrame();
        void encodeWebCodecsFrame();
        lastCaptureTime = now;
      }
    };

    map.on('render', onRender);
    frameCleanupRef.current = () => map.off('render', onRender);

    const keepRendering = () => {
      if (!isRecordingRef.current) return;
      map.triggerRepaint();
      frameRequestRef.current = requestAnimationFrame(keepRendering);
    };
    frameRequestRef.current = requestAnimationFrame(keepRendering);
  }, [captureFrame, encodeWebCodecsFrame, videoExportSettings.fps]);

  const waitForMapFrame = useCallback(async () => {
    // Let React commit the new replay state, then wait for MapLibre to draw it.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const map = mapGlobalRef.current;
    if (!map) return;

    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      map.once('render', finish);
      map.triggerRepaint();
      // A render event is normally immediate. Keep export cancellable if a map
      // implementation declines to render while its style is changing.
      requestAnimationFrame(() => requestAnimationFrame(finish));
    });
  }, []);

  // Advances the map by exactly one rendered frame. The paired rAF fallback
  // keeps a studio export cancellable if a style refuses to render.
  const renderMapOnce = useCallback(async () => {
    const map = mapGlobalRef.current;
    if (!map) return;
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        map.off('render', finish);
        resolve();
      };
      map.once('render', finish);
      map.triggerRepaint();
      requestAnimationFrame(() => requestAnimationFrame(finish));
    });
  }, []);

  /**
   * Studio pacing: hold each frame until every tile for its pose has loaded.
   *
   * Standard export's `waitForMapFrame` only proves the map drew something.
   * Measured on a 60s satellite replay, 80% of frames were drawn against the
   * coarse z12 fallback pyramid because their detail tiles were still in
   * flight. This trades wall clock (roughly 6x) for a video in which no frame
   * shows the fallback basemap.
   */
  const waitForMapSettled = useCallback(async () => {
    const map = mapGlobalRef.current;
    if (!map) {
      await waitForMapFrame();
      return;
    }

    const result = await waitForSettledFrame(map, {
      isCancelled: () => recordingCancelledRef.current || !isRecordingRef.current,
      nextTask: () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      now: () => performance.now(),
      renderOnce: renderMapOnce,
      timeoutMs: STUDIO_FRAME_SETTLE_TIMEOUT_MS,
    });

    const stats = studioStatsRef.current;
    stats.frames += 1;
    stats.waitedMs += result.waitedMs;
    if (result.timedOut) stats.timedOutFrames += 1;
  }, [renderMapOnce, waitForMapFrame]);

  /**
   * Frame pacing for the route playback loop.
   *
   * Only the route loop can be settled. The intro (`flyTo`) and outro
   * (`fitBounds`) are time-based MapLibre camera animations that advance on
   * wall clock, so pausing between frames does not hold the camera still — it
   * lets the animation run ahead, dropping intro content from the video. They
   * are also `isMoving()` throughout, so every one of their frames would burn
   * the full settle timeout. The route loop drives the camera with `jumpTo`
   * from explicit progress, so it holds still while tiles load, and it is the
   * overwhelming majority of frames anyway.
   */
  const waitForExportFrame = useCallback(async () => {
    if (studioQualityRef.current) {
      await waitForMapSettled();
      return;
    }
    await waitForMapFrame();
  }, [waitForMapFrame, waitForMapSettled]);

  /**
   * Raster tiles crossfade in over ~300ms, so a tile can be fully loaded and
   * still be captured mid-fade — which reads as exactly the softness studio
   * mode exists to remove. Disable the transition while recording.
   */
  const applyStudioMapSettings = useCallback(() => {
    const map = mapGlobalRef.current;
    if (!map) return;

    const restores: Array<() => void> = [];
    const layers = map.getStyle()?.layers ?? [];
    layers.forEach((layer) => {
      if (layer.type !== 'raster') return;
      try {
        const previous = map.getPaintProperty(layer.id, 'raster-fade-duration');
        map.setPaintProperty(layer.id, 'raster-fade-duration', 0);
        restores.push(() => {
          try {
            map.setPaintProperty(layer.id, 'raster-fade-duration', previous ?? undefined);
          } catch {
            // The layer can be gone if the basemap changed during the export.
          }
        });
      } catch {
        // Ignore layers that reject the property rather than abort the export.
      }
    });
    rasterFadeRestoreRef.current = restores;
  }, []);

  const restoreStudioMapSettings = useCallback(() => {
    rasterFadeRestoreRef.current.forEach((restore) => restore());
    rasterFadeRestoreRef.current = [];

    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    void wakeLock?.release().catch(() => {
      // Already released by the browser (tab hidden, display slept).
    });
  }, []);

  // A studio export runs for minutes rather than seconds, so the display going
  // to sleep mid-recording is a real risk. Best effort: the export still works
  // without the lock.
  const requestScreenWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (!nav.wakeLock) return;
      wakeLockRef.current = await nav.wakeLock.request('screen');
    } catch {
      // Denied, unsupported, or the document was already hidden.
    }
  }, []);

  const preloadExportOpeningTiles = useCallback(async () => {
    const map = mapGlobalRef.current;
    if (!map || cameraSettings.mode === 'overview' || cameraPathCoordinates.length === 0) return;

    const routeDurationMs = useAppStore.getState().playback.totalDuration || 60_000;
    // Tile prefetch has no cinematic-specific pose logic yet — approximate
    // with follow-behind, which sits at a similar zoom/pitch. The actual
    // export render loop (useTrailPlaybackCamera) does use the real
    // cinematic poses, so this only affects which tiles get warmed early.
    const poseCameraMode = cameraSettings.mode === 'cinematic' ? 'follow-behind' : cameraSettings.mode;
    const introPose = getIntroCameraPose({
      cameraMode: poseCameraMode,
      coordinates: cameraPathCoordinates,
      elevationData,
      followBehindZoomLevel: cameraSettings.followBehindZoomLevel,
      progress: 0,
    });
    const poses = [
      introPose,
      ...getOpeningPreloadProgresses(
        routeDurationMs,
        EXPORT_OPENING_WINDOW_MS,
        EXPORT_OPENING_SAMPLE_COUNT,
      ).map((progress) => getPlaybackCameraPose({
        cameraMode: poseCameraMode,
        coordinates: cameraPathCoordinates,
        elevationData,
        followBehindZoomLevel: cameraSettings.followBehindZoomLevel,
        progress,
      })),
    ].filter((pose): pose is ReplayCameraPose => pose !== null);

    const overview = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
    const deadline = Date.now() + EXPORT_TILE_PRELOAD_TIMEOUT_MS;

    for (const pose of poses) {
      if (recordingCancelledRef.current || Date.now() >= deadline) break;
      map.jumpTo(pose);
      await new Promise<void>((resolve) => {
        let complete = false;
        const finish = () => {
          if (complete) return;
          complete = true;
          map.off('idle', finish);
          resolve();
        };
        map.once('idle', finish);
        window.setTimeout(finish, Math.max(0, deadline - Date.now()));
      });
    }

    map.jumpTo(overview);
    await waitForMapFrame();
  }, [cameraPathCoordinates, cameraSettings.followBehindZoomLevel, cameraSettings.mode, elevationData, waitForMapFrame]);

  const captureDeterministicPhase = useCallback(async (
    durationMs: number,
    timestampOffsetMs: number,
  ) => {
    const frameDurationMs = 1000 / videoExportSettings.fps;
    const frameCount = Math.max(1, Math.ceil(durationMs / frameDurationMs));
    const phaseStartTime = performance.now();

    for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      // Deliberately standard pacing even in studio mode — see the note on
      // `waitForExportFrame` for why the intro/outro cannot be settled.
      await waitForMapFrame();
      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      captureFrame();
      await encodeWebCodecsFrame((timestampOffsetMs + (frameIndex * frameDurationMs)) * 1000);
      if (frameIndex < frameCount) {
        // Map rendering already consumes part of this frame's budget. Waiting a
        // full additional frame interval made the intro/outro take roughly twice
        // as long to export, while the encoded timestamps and pixels stayed the
        // same. Only wait for the remainder needed to preserve their timeline.
        const nextFrameDueAt = phaseStartTime + ((frameIndex + 1) * frameDurationMs);
        const remainingDelayMs = Math.max(0, nextFrameDueAt - performance.now());
        if (remainingDelayMs > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remainingDelayMs));
        }
      }
    }
  }, [captureFrame, encodeWebCodecsFrame, videoExportSettings.fps, waitForMapFrame]);

  // Holds on a picture popup for `durationMs`, forcing a fresh DOM-overlay
  // capture every single encoded frame instead of the ~12fps throttle
  // `captureFrame` otherwise applies (see `getOverlayRefreshIntervalMs`) —
  // that throttle is fine for slow-moving stats/elevation overlays, but made
  // the popup's zoom/opacity transition look stepped and laggy since it was
  // only being re-rasterized a handful of times over its whole animation.
  // The route position/camera stay frozen throughout (only
  // `exportPictureHoldElapsedMs` advances), so there's no need for the map
  // to actually repaint each frame the way `captureDeterministicPhase` waits
  // for — that lets this run faster too.
  const capturePictureHold = useCallback(async (
    durationMs: number,
    timestampOffsetMs: number,
  ) => {
    const frameDurationMs = 1000 / videoExportSettings.fps;
    const frameCount = Math.max(1, Math.ceil(durationMs / frameDurationMs));
    const { width: recordW, height: recordH } = videoExportSettings.resolution;
    const phaseStartTime = performance.now();

    for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      useAppStore.getState().setExportPictureHoldElapsedMs(frameIndex * frameDurationMs);
      // Let React commit the new elapsed value (and the popup's CSS
      // transition tick forward in the DOM) before rasterizing it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      await updateOverlayAsync(recordW, recordH);
      captureFrame();
      await encodeWebCodecsFrame((timestampOffsetMs + (frameIndex * frameDurationMs)) * 1000);
      if (frameIndex < frameCount) {
        const nextFrameDueAt = phaseStartTime + ((frameIndex + 1) * frameDurationMs);
        const remainingDelayMs = Math.max(0, nextFrameDueAt - performance.now());
        if (remainingDelayMs > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remainingDelayMs));
        }
      }
    }
  }, [captureFrame, encodeWebCodecsFrame, updateOverlayAsync, videoExportSettings.fps, videoExportSettings.resolution]);

  /** Blocks until the popup's clip has actually decoded the frame asked for. */
  const waitForVideoSeek = useCallback(async (targetSeconds: number, toleranceSeconds: number) => {
    const deadline = performance.now() + 2000;
    for (;;) {
      const element = document.querySelector('.tr-video-popup video') as HTMLVideoElement | null;
      if (!element) return;
      const settled = !element.seeking
        && element.readyState >= 2
        && Math.abs(element.currentTime - targetSeconds) <= toleranceSeconds;
      if (settled || performance.now() > deadline) return;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, []);

  // Holds on a clip for its own length, one encoded frame at a time.
  //
  // The clip is never *played* during an export. Frame capture and encoding
  // take far longer than real time, so a playing clip would have run most of
  // the way through by the time a handful of frames had been written, and the
  // exported result would be a few stuttering stills. Instead the popup seeks
  // to the exact point the timeline is at, and this waits for that seek to land
  // before rasterizing — the same reason `capturePictureHold` drives the photo
  // animation from the encoded frame index rather than from wall-clock time.
  const captureVideoHold = useCallback(async (
    clipDurationSeconds: number,
    timestampOffsetMs: number,
  ) => {
    const frameDurationMs = 1000 / videoExportSettings.fps;
    const durationMs = Math.max(frameDurationMs, clipDurationSeconds * 1000);
    const frameCount = Math.max(1, Math.ceil(durationMs / frameDurationMs));
    const { width: recordW, height: recordH } = videoExportSettings.resolution;
    // A seek lands on a decoded frame, which for a variable-frame-rate phone
    // clip need not be the exact instant asked for.
    const seekTolerance = Math.max(0.1, (frameDurationMs / 1000) * 2);

    for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      const targetSeconds = Math.min(clipDurationSeconds, (frameIndex * frameDurationMs) / 1000);
      useAppStore.getState().setExportVideoHoldTimeSeconds(targetSeconds);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await waitForVideoSeek(targetSeconds, seekTolerance);
      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      await updateOverlayAsync(recordW, recordH);
      captureFrame();
      await encodeWebCodecsFrame((timestampOffsetMs + (frameIndex * frameDurationMs)) * 1000);
    }

    return frameCount * frameDurationMs;
  }, [captureFrame, encodeWebCodecsFrame, updateOverlayAsync, videoExportSettings.fps, videoExportSettings.resolution, waitForVideoSeek]);

  /**
   * Waits for the popup the store just asked for to exist and to have decoded
   * something, and reports the length the element itself gives — the import may
   * not have been able to read one.
   */
  const waitForVideoPopup = useCallback(async (): Promise<number | null> => {
    const deadline = performance.now() + 5000;
    for (;;) {
      const element = document.querySelector('.tr-video-popup video') as HTMLVideoElement | null;
      const duration = element?.duration;
      if (element && element.readyState >= 2) {
        return Number.isFinite(duration) && (duration ?? 0) > 0 ? duration! : null;
      }
      if (performance.now() > deadline) return null;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, []);

  return {
    t, language, studioDelivery, videoExportSettings, mapStyle, show3DTerrain, tracks,
    visibleStats, pictures, videos, journeySegments, cameraSettings, playback, animationPhase,
    isExporting, exportProgress, exportStage, setIsExporting, setIsDeterministicExport, setExportProgress, setExportStage,
    resetPlayback, setSpeed, play, setCinematicPlayed, exportedBlob, setExportedBlob, studioDeliveryStatus,
    setStudioDeliveryStatus, studioDeliveryError, setStudioDeliveryError, studioSupported, mp4Supported, actualFormat, estimatedSize,
    includeStats, includeElevation, loadHtml2Canvas, resetOverlayCapture, updateOverlayAsync, recordingCanvasRef, recordingContextRef,
    mediaRecorderRef, recordedChunksRef, recordingStartTimeRef, isRecordingRef, recordingCancelledRef, mp4EncoderRef, useWebCodecsRef, setUseWebCodecs,
    frameRequestRef, frameCleanupRef, cachedLogoRef, studioQualityRef, studioStatsRef, wakeLockRef, hiddenSinceRef,
    hiddenMsRef, studioDeliveryJobRef, captureFrame, encodeWebCodecsFrame, startFrameCapture, waitForMapFrame, waitForExportFrame,
    applyStudioMapSettings, restoreStudioMapSettings, requestScreenWakeLock, preloadExportOpeningTiles, captureDeterministicPhase, capturePictureHold, captureVideoHold,
    waitForVideoPopup,
  };
}
