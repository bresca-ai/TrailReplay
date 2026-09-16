import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import fixWebmDuration from 'fix-webm-duration';
import { useAppStore } from '@/store/useAppStore';
import { getStatAvailability, isStatAvailable } from '@/utils/statAvailability';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { estimateFileSize } from '@/utils/videoExport';
import { mapGlobalRef } from '@/utils/mapRef';
import { useI18n } from '@/i18n/useI18n';
import { getCropRegion } from '@/utils/crop';
import {
  getBlobSizeBucket,
  getProgressBucket,
  getVideoExportAnalyticsParams,
  trackEvent,
} from '@/utils/analytics';
import { getActivityIconOption, isSvgActivityIcon } from '@/utils/activityIcons';
import { getTriggeredPlaybackItems, getTriggeredPlaybackPictures } from '@/utils/playbackPictures';
import { playbackTimeForRoute, routeTimeForPlayback } from '@/utils/annotationTiming';
import { getActivePlaybackAnnotationId } from '@/utils/playbackAnnotations';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { sideAnnotationContent } from '@/components/annotations/sideAnnotationContent';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import {
  buildJourneyDistanceProfile,
  getSegmentAtDistance,
  getSegmentAtProgress,
  getJourneyPointAtDistance,
  getJourneyPointAtProgress,
  type JourneyPoint,
} from '@/utils/journeyUtils';
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatSpeedFromKmh,
  formatStatsDuration,
} from '@/utils/units';
import { calculateCurrentLiveStats } from '@/components/stats/liveStats';
import type { StatId } from '@/types';
import {
  getSupportedMimeType,
  getVideoBitrate,
  MP4_MIME_TYPES,
} from './exportConfig';
import {
  createMp4CanvasEncoder,
  isWebCodecsMp4Supported,
  type Mp4CanvasEncoder,
} from './mp4CanvasEncoder';
import { getOverlayRefreshIntervalMs } from './exportOverlay';
import { waitForSettledFrame } from './exportMapSettle';
import {
  createStudioDeliveryJob,
  deliverStudioExport,
  isValidDeliveryEmail,
  localStudioDownload,
  shouldAutoDownloadVideo,
  type StudioDeliveryJob,
  type StudioDeliveryRequest,
} from './studioDelivery';
import { useExportOverlayCapture } from './useExportOverlayCapture';
import { INTRO_DURATION, OUTRO_DELAY, OUTRO_DURATION } from '@/components/playback/PlaybackProvider';
import {
  getIntroCameraPose,
  getOpeningPreloadProgresses,
  getPlaybackCameraPose,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';

const EXPORT_MAP_SETTLE_MS = 150;
const EXPORT_TILE_PRELOAD_TIMEOUT_MS = 6000;
const EXPORT_OPENING_WINDOW_MS = 20000;
const EXPORT_OPENING_SAMPLE_COUNT = 8;
// A studio frame stops waiting after this long so one unreachable tile cannot
// strand a 1800-frame export. Measured worst-case settle on satellite + terrain
// at 4K was 1.27s, so this leaves an order of magnitude of headroom.
const STUDIO_FRAME_SETTLE_TIMEOUT_MS = 10_000;

function extractCssUrl(value: string): string | null {
  const match = value.match(/url\((['"]?)(.*?)\1\)/);
  return match?.[2] ?? null;
}

function drawTintedSvgIcon(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  options: {
    centerX: number;
    centerY: number;
    color: string;
    height: number;
    width: number;
  },
) {
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.max(1, Math.round(options.width));
  offscreen.height = Math.max(1, Math.round(options.height));
  const offscreenContext = offscreen.getContext('2d');
  if (!offscreenContext) return;

  offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
  offscreenContext.drawImage(image, 0, 0, offscreen.width, offscreen.height);
  offscreenContext.globalCompositeOperation = 'source-in';
  offscreenContext.fillStyle = options.color;
  offscreenContext.fillRect(0, 0, offscreen.width, offscreen.height);

  context.drawImage(
    offscreen,
    options.centerX - options.width / 2,
    options.centerY - options.height / 2,
    options.width,
    options.height,
  );
}

export type StudioDeliveryStatus = 'idle' | 'registering' | 'uploading' | 'emailing' | 'sent' | 'failed';

interface UseVideoExportRecorderOptions {
  studioDelivery?: StudioDeliveryRequest;
}

export function useVideoExportRecorder(options: UseVideoExportRecorderOptions = {}) {
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
    if (!recordingCanvasRef.current || !recordingContextRef.current) return;
    const { width: recordW, height: recordH } = videoExportSettings.resolution;
    const context = recordingContextRef.current;
    const mapCanvas = (mapGlobalRef.current?.getCanvas()
      ?? document.querySelector('.maplibregl-canvas')) as HTMLCanvasElement | null;
    const container = document.getElementById('map-capture-container');

    if (!mapCanvas || !container) {
      context.fillStyle = '#000';
      context.fillRect(0, 0, recordW, recordH);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const { cropX, cropY, cropW, cropH } = getCropRegion(containerRect, recordW, recordH);
    const pixelScaleX = mapCanvas.width / containerRect.width;
    const pixelScaleY = mapCanvas.height / containerRect.height;

    context.drawImage(
      mapCanvas,
      cropX * pixelScaleX,
      cropY * pixelScaleY,
      cropW * pixelScaleX,
      cropH * pixelScaleY,
      0,
      0,
      recordW,
      recordH,
    );

    if (cachedOverlayRef.current) {
      context.drawImage(cachedOverlayRef.current, 0, 0, recordW, recordH);
    }

    // DOM overlays are not part of MapLibre's canvas. Paint the side panel
    // explicitly for video frames, including the slowed section of the route.
    const currentState = useAppStore.getState();
    const activeId = getActivePlaybackAnnotationId({
      annotations: currentState.textAnnotations,
      currentTime: currentState.playback.currentTime,
      totalDuration: currentState.playback.totalDuration,
      phase: currentState.animationPhase,
    });
    const sideAnnotation = currentState.textAnnotations.find((item) => item.id === activeId && item.presentation === 'side-panel');
    if (sideAnnotation) {
      const panel = container.querySelector('.tr-annotation-side-panel');
      const rect = panel?.getBoundingClientRect();
      if (rect) {
        const x = (rect.left - containerRect.left - cropX) * (recordW / cropW);
        const y = (rect.top - containerRect.top - cropY) * (recordH / cropH);
        const w = rect.width * (recordW / cropW);
        const h = rect.height * (recordH / cropH);
        const scale = recordW / cropW;
        const copy = sideAnnotationContent(localizedAnnotation(sideAnnotation, currentState.settings.language));
        const inset = 24 * scale;
        const contentX = x + inset;
        const maxWidth = w - inset * 2;
        context.save();
        context.shadowColor = 'rgba(3,13,16,0.32)';
        context.shadowBlur = 30 * scale;
        context.shadowOffsetY = 15 * scale;
        const background = context.createLinearGradient(x, y, x + w, y + h);
        background.addColorStop(0, '#1e2b2d');
        background.addColorStop(1, '#0d1619');
        context.fillStyle = background;
        context.beginPath();
        context.roundRect(x, y, w, h, 20 * scale);
        context.fill();
        context.shadowColor = 'transparent';
        context.strokeStyle = 'rgba(255,255,255,0.18)';
        context.lineWidth = scale;
        context.stroke();
        context.clip();
        context.fillStyle = sideAnnotation.color;
        context.fillRect(x, y, w, 4 * scale);

        const logoX = contentX;
        const logoY = y + 22 * scale;
        context.fillStyle = 'rgba(255,255,255,0.09)';
        context.beginPath();
        context.roundRect(logoX, logoY, 44 * scale, 44 * scale, 13 * scale);
        context.fill();
        context.strokeStyle = sideAnnotation.color;
        context.lineWidth = 1.2 * scale;
        context.stroke();
        context.font = `${24 * scale}px sans-serif`;
        context.textAlign = 'center';
        context.fillStyle = '#fff';
        context.fillText(sideAnnotation.logo || '●', logoX + 22 * scale, logoY + 31 * scale);
        context.textAlign = 'left';
        context.font = `800 ${10 * scale}px sans-serif`;
        context.fillStyle = 'rgba(245,246,237,0.58)';
        context.fillText(t('annotations.sidePanelEyebrow').toLocaleUpperCase(), logoX + 56 * scale, logoY + 16 * scale);
        if (copy.code) {
          context.font = `800 ${18 * scale}px sans-serif`;
          context.fillStyle = sideAnnotation.color;
          context.fillText(copy.code, logoX + 56 * scale, logoY + 37 * scale);
        }
        context.fillStyle = sideAnnotation.color;
        context.fillRect(x + w - 49 * scale, logoY + 10 * scale, 25 * scale, 2 * scale);

        const drawWrapped = (value: string, font: string, lineHeight: number, baseline: number, maxLines: number) => {
          context.font = font;
          const words = value.split(/\s+/).filter(Boolean);
          let line = '';
          let drawn = 0;
          let currentY = baseline;
          for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (context.measureText(next).width > maxWidth && line) {
              context.fillText(line, contentX, currentY);
              currentY += lineHeight * scale;
              drawn += 1;
              if (drawn >= maxLines) return currentY;
              line = word;
            } else line = next;
          }
          if (line && drawn < maxLines) {
            context.fillText(line, contentX, currentY);
            currentY += lineHeight * scale;
          }
          return currentY;
        };

        context.fillStyle = '#f8f8f1';
        let nextY = drawWrapped(copy.title, `800 ${23 * scale}px sans-serif`, 27, y + 104 * scale, 3);
        if (copy.meta) {
          context.fillStyle = sideAnnotation.color;
          nextY = drawWrapped(copy.meta, `750 ${12 * scale}px sans-serif`, 17, nextY + 5 * scale, 2);
        }
        if (copy.description) {
          const dividerY = nextY + 11 * scale;
          context.strokeStyle = 'rgba(255,255,255,0.16)';
          context.lineWidth = scale;
          context.beginPath();
          context.moveTo(contentX, dividerY);
          context.lineTo(x + w - inset, dividerY);
          context.stroke();
          context.fillStyle = 'rgba(245,246,237,0.58)';
          context.font = `800 ${10 * scale}px sans-serif`;
          context.fillText(t('annotations.sidePanelDetails').toLocaleUpperCase(), contentX, dividerY + 22 * scale);
          context.fillStyle = 'rgba(251,251,246,0.88)';
          drawWrapped(copy.description, `500 ${13 * scale}px sans-serif`, 20, dividerY + 45 * scale, 12);
        }
        context.restore();
      }
    }

    const scaleX = recordW / cropW;
    const scaleY = recordH / cropH;

    // Before the stats and markers, so the popup stays behind them exactly as
    // it did when the clip frame was still baked into the cached snapshot.
    drawVideoFrame(context, {
      containerRect,
      cropX,
      cropY,
      scaleToRecording: scaleX,
    });

    // The static elevation profile remains in the cached DOM snapshot, while
    // its progress fill and label are cheap native-canvas primitives. Drawing
    // only those moving pieces here keeps them at the actual video frame rate
    // without running html2canvas 30 or 60 times per second.
    drawStatsValues(context, {
      containerRect,
      cropX,
      cropY,
      recordW,
      recordH,
      scaleToRecording: scaleX,
    });
    drawElevationProgress(context, {
      recordW,
      recordH,
      scaleToRecording: scaleX,
    });

    // The photo popup should read as fully in front of everything else
    // (matching the live view's z-index stacking): neither the route
    // position marker nor the small photo-pin markers should paint over it.
    const pictureHoldActive = Boolean(
      document.querySelector('.tr-picture-popup') || document.querySelector('.tr-video-popup'),
    );

    // Photo pin markers along the route (`usePictureMarkers.ts`) live as
    // MapLibre DOM markers outside the WebGL canvas, so — like the position
    // marker below — they need to be manually recreated here or they never
    // appear in the exported video at all.
    if (!pictureHoldActive) document.querySelectorAll('.tr-picture-marker').forEach((markerEl) => {
      const rect = (markerEl as HTMLElement).getBoundingClientRect();
      const centerX = (rect.left + rect.width / 2 - containerRect.left - cropX) * scaleX;
      const centerY = (rect.top + rect.height / 2 - containerRect.top - cropY) * scaleY;
      const radius = (rect.width / 2) * scaleX;
      if (radius <= 0) return;
      if (centerX < -radius || centerX > recordW + radius || centerY < -radius || centerY > recordH + radius) return;

      const computed = getComputedStyle(markerEl as HTMLElement);
      context.save();
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.closePath();
      context.fillStyle = computed.backgroundColor || 'rgba(255, 152, 0, 0.9)';
      context.fill();

      const thumb = markerEl.querySelector('img') as HTMLImageElement | null;
      if (thumb && thumb.complete && thumb.naturalWidth > 0) {
        context.clip();
        context.drawImage(thumb, centerX - radius, centerY - radius, radius * 2, radius * 2);
      }
      context.restore();

      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.lineWidth = (parseFloat(computed.borderWidth) || 3) * scaleX;
      context.strokeStyle = computed.borderColor || '#ffffff';
      context.stroke();
    });

    const markerContainer = pictureHoldActive ? null : document.querySelector('.tr-marker') as HTMLElement | null;
    if (markerContainer) {
      const markerRect = markerContainer.getBoundingClientRect();
      const markerX = (markerRect.left + markerRect.width / 2 - containerRect.left - cropX) * scaleX;
      const markerY = (markerRect.top + markerRect.height / 2 - containerRect.top - cropY) * scaleY;

      const circleElement = markerContainer.querySelector('div') as HTMLElement | null;
      if (circleElement) {
        const circleSize = parseFloat(circleElement.style.width || '0');
        const scaledRadius = (circleSize / 2) * scaleX;
        const borderColor = circleElement.style.borderColor || '#FF9800';

        context.fillStyle = circleElement.style.background || 'rgba(255, 152, 0, 0.25)';
        context.beginPath();
        context.arc(markerX, markerY, scaledRadius, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = borderColor;
        context.lineWidth = 2 * scaleX;
        context.stroke();
      }

      const markerIcon = markerContainer.querySelector('span') as HTMLElement | null;
      if (markerIcon) {
        const markerIconWidth = parseFloat(markerIcon.style.width || '24') * scaleX;
        const markerIconHeight = parseFloat(markerIcon.style.height || '24') * scaleY;
        const maskImage = markerIcon.style.maskImage || markerIcon.style.webkitMaskImage || '';
        const maskUrl = extractCssUrl(maskImage);

        if (maskUrl) {
          const markerSvg = svgMarkerImageCacheRef.current.get(maskUrl);
          if (markerSvg) {
            drawTintedSvgIcon(context, markerSvg, {
              centerX: markerX,
              centerY: markerY,
              color: markerIcon.style.backgroundColor || '#000000',
              width: markerIconWidth,
              height: markerIconHeight,
            });
          } else {
            preloadSvgMarkerIcon(maskUrl);
          }
        } else if (markerIcon.textContent) {
          const fontSize = Math.round(parseFloat(markerIcon.style.fontSize || '24') * scaleX);
          context.font = `${fontSize}px serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillStyle = '#000000';
          context.fillText(markerIcon.textContent, markerX, markerY);
        }
      }

      const trackLabel = getTrackLabel(useAppStore.getState().playback.progress);
      if (trackLabel?.text) {
        const labelFontSize = 12 * scaleY;
        const markerTop = markerY - (markerRect.height / 2) * scaleY;

        context.save();
        context.font = `700 ${labelFontSize}px JetBrains Mono, monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        context.lineJoin = 'round';
        context.strokeStyle = '#ffffff';
        context.lineWidth = 3 * scaleY;
        context.strokeText(trackLabel.text, markerX, markerTop - 8 * scaleY);
        context.fillStyle = trackLabel.color;
        context.fillText(trackLabel.text, markerX, markerTop - 8 * scaleY);
        context.restore();
      }
    }

    if (cachedLogoRef.current) {
      // Size relative to the long edge (fixed per quality level regardless
      // of aspect ratio - see getResolution), not the frame width. Basing it
      // on width alone made the watermark shrink drastically for portrait
      // (9:16) and square exports, since their width is the *short* edge.
      const longEdge = Math.max(recordW, recordH);
      const logoWidth = Math.round(longEdge * 0.16);
      const logoHeight = Math.round(logoWidth / 2.5);
      const margin = Math.round(longEdge * 0.025);
      const logoX = recordW - logoWidth - margin;
      const logoY = margin;
      context.save();
      context.globalAlpha = 0.85;
      context.drawImage(cachedLogoRef.current, logoX, logoY, logoWidth, logoHeight);
      context.restore();
    }

    if (Date.now() - overlayLastUpdateRef.current >= overlayRefreshIntervalMs && !overlayBusyRef.current) {
      updateOverlayAsync(recordW, recordH);
    }
  }, [cachedOverlayRef, drawElevationProgress, drawStatsValues, drawVideoFrame, getTrackLabel, overlayBusyRef, overlayLastUpdateRef, overlayRefreshIntervalMs, preloadSvgMarkerIcon, t, updateOverlayAsync, videoExportSettings.resolution]);

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

  // Flush the WebCodecs-encoded MP4 once recording has stopped. Standard
  // exports download immediately; Studio exports are delivered by email.
  const finalizeWebCodecsExport = useCallback(async () => {
    const encoder = mp4EncoderRef.current;
    if (!encoder) return;
    mp4EncoderRef.current = null;
    useWebCodecsRef.current = false;

    if (recordingCancelledRef.current) {
      encoder.close();
      setIsExporting(false);
      resetPlayback();
      return;
    }

    try {
      const blob = await encoder.finalize();
      if (blob.size > 0) {
        const studioStats = studioStatsRef.current;
        const wasStudioQuality = studioQualityRef.current;
        const studioTimedOut = wasStudioQuality && studioStats.timedOutFrames > 0;

        setExportedBlob(blob);
        // Never claim a clean studio render when some frames gave up waiting —
        // those frames contain exactly the soft fallback tiles this mode sells
        // the absence of.
        setExportStage(studioTimedOut
          ? t('export.stageCompleteStudioPartial', { frames: studioStats.timedOutFrames })
          : t('export.stageComplete'));
        setExportProgress(100);
        trackEvent('export_completed', {
          ...getVideoExportAnalyticsParams(videoExportSettings, 'mp4', playback.totalDuration),
          export_blob_size_bucket: getBlobSizeBucket(blob.size),
          export_encoder_path: 'webcodecs',
          export_quality_mode: wasStudioQuality ? 'studio' : 'standard',
          export_studio_timed_out_frames: studioStats.timedOutFrames,
        });

        if (shouldAutoDownloadVideo(wasStudioQuality ? 'studio' : 'standard', localStudioDownload)) {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `trail-replay-${Date.now()}.mp4`;
          anchor.click();
          URL.revokeObjectURL(url);
        }

        const deliveryJob = studioDeliveryJobRef.current;
        if (wasStudioQuality && deliveryJob) {
          try {
            const deliveryResult = await deliverStudioExport(deliveryJob, blob, (phase) => {
              setStudioDeliveryStatus(phase);
              setExportStage(phase === 'uploading'
                ? t('export.stageUploadingVideo')
                : t('export.stageEmailingLink'));
            });
            setStudioDeliveryStatus('sent');
            setStudioDeliveryError(null);
            setExportStage(t('export.stageEmailSent'));
            trackEvent('studio_export_delivery_completed', {
              provider: deliveryResult.provider ?? 'unknown',
            });
          } catch (deliveryError) {
            console.error('Studio export delivery failed', deliveryError);
            const message = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
            setStudioDeliveryStatus('failed');
            setStudioDeliveryError(message);
            setExportStage(t('export.stageDeliveryFailed'));
            trackEvent('export_failed', {
              export_failure_scope: 'studio_delivery',
              export_format: 'mp4',
              export_encoder_path: 'webcodecs',
            });
          }
        }
      } else {
        setExportStage(t('export.stageFailedNoData'));
        trackEvent('export_failed', {
          export_failure_scope: 'no_data',
          export_format: 'mp4',
          export_encoder_path: 'webcodecs',
        });
      }
    } catch (error) {
      console.error('WebCodecs export failed', error);
      setExportStage(t('export.stageFailedWithError', { error: (error as Error).message }));
      trackEvent('export_failed', {
        export_failure_scope: 'encoder_finalize',
        export_format: 'mp4',
        export_encoder_path: 'webcodecs',
      });
    } finally {
      restoreStudioMapSettings();
      studioDeliveryJobRef.current = null;
      studioQualityRef.current = false;
      setIsDeterministicExport(false);
      setIsExporting(false);
      // Deterministic export drives the animation directly through its outro.
      // Restore an idle, replayable timeline once the file has been finalized.
      resetPlayback();
    }
  }, [playback.totalDuration, resetPlayback, restoreStudioMapSettings, setExportProgress, setExportStage, setIsDeterministicExport, setIsExporting, t, videoExportSettings]);

  const finishRecording = useCallback(() => {
    if (!isRecordingRef.current) return;

    isRecordingRef.current = false;

    if (frameCleanupRef.current) {
      frameCleanupRef.current();
      frameCleanupRef.current = null;
    }
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }

    setExportStage(t('export.stageFinalizing'));

    if (useWebCodecsRef.current) {
      void finalizeWebCodecsExport();
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Flush the trailing partial timeslice before stopping so the tail of
      // the animation isn't dropped from the recording.
      if (recorder.state === 'recording') {
        try {
          recorder.requestData();
        } catch {
          // requestData can throw if the recorder already stopped; ignore.
        }
      }
      recorder.stop();
    }
  }, [finalizeWebCodecsExport, setExportStage, t]);

  /**
   * Studio export is bound by tile network latency, not by the video's own
   * duration, so a percentage of the timeline sits near-still for minutes and
   * reads as a hang. Report encoded frames and a rolling estimate instead.
   * Time spent with the tab hidden is excluded: rAF is frozen there, so the
   * export makes no progress and that wall clock would poison the average.
   */
  const describeRecordingStage = useCallback((frameIndex: number, frameCount: number) => {
    if (!studioQualityRef.current) return t('export.recording');

    const hiddenMs = hiddenMsRef.current
      + (hiddenSinceRef.current === null ? 0 : performance.now() - hiddenSinceRef.current);
    const elapsedMs = performance.now() - recordingStartTimeRef.current - hiddenMs;
    const remainingMs = (elapsedMs / Math.max(1, frameIndex)) * Math.max(0, frameCount - frameIndex);
    const minutes = Math.round(remainingMs / 60000);

    return minutes < 1
      ? t('export.studioProgressSoon', { frame: frameIndex, total: frameCount })
      : t('export.studioProgress', { frame: frameIndex, total: frameCount, minutes });
  }, [t]);

  const runDeterministicExport = useCallback(async () => {
    if (!mp4EncoderRef.current) return;

    const { fps } = videoExportSettings;
    const frameDurationMs = 1000 / fps;
    const store = useAppStore.getState();
    const routeDurationMs = store.playback.totalDuration;
    const annotations = store.textAnnotations;
    const outputDurationMs = playbackTimeForRoute(routeDurationMs, routeDurationMs, annotations);
    // Preview speed only affects interactive playback. Export always preserves
    // the configured journey duration on the encoded timeline.
    const frameCount = Math.ceil(outputDurationMs / frameDurationMs);
    const progressUpdateInterval = Math.max(1, Math.round(fps / 5));

    setIsDeterministicExport(true);
    store.setPlayback({ isPlaying: true, currentTime: 0, progress: 0 });
    // Start the cinematic movement first and wait for its first rendered frame.
    // This ensures the video begins from the actual introductory camera pose,
    // rather than catching the map halfway through a state transition.
    store.setCinematicPlayed(false);
    store.setAnimationPhase('intro');
    setExportStage(t('export.recordingIntro'));
    await waitForMapFrame();
    await captureDeterministicPhase(INTRO_DURATION, 0);

    if (!isRecordingRef.current || recordingCancelledRef.current) return;

    store.setCinematicPlayed(true);
    store.setAnimationPhase('playing');
    setExportStage(describeRecordingStage(0, frameCount));
    let encodedDurationMs = INTRO_DURATION;
    // Mirrors App.tsx's live-playback picture trigger (`getTriggeredPlaybackPictures`),
    // but drives its own hold here so the export can freeze the route
    // position for the picture's full `displayDuration` instead of just
    // showing the popup over an already-advancing timeline.
    const shownPictureIds = new Set<string>();
    const shownVideoIds = new Set<string>();
    let previousProgress = 0;

    // The intro already contains the progress-zero pose. Begin at the first
    // advancing route frame so the cut into the route has no duplicate hold.
    for (let frameIndex = 1; frameIndex <= frameCount; frameIndex += 1) {
      if (!isRecordingRef.current || recordingCancelledRef.current) break;

      const currentTime = routeTimeForPlayback(Math.min(outputDurationMs, frameIndex * frameDurationMs), routeDurationMs, annotations);
      const progress = routeDurationMs > 0 ? currentTime / routeDurationMs : 1;
      useAppStore.getState().setPlayback({ currentTime, progress });
      if (frameIndex % progressUpdateInterval === 0) {
        setExportStage(describeRecordingStage(frameIndex, frameCount));
      }
      await waitForExportFrame();

      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      captureFrame();
      // Match the original `(fixedBase + frameIndex * frameDurationMs)`
      // timestamp math exactly: increment before encoding, so frame 1 lands
      // at `INTRO_DURATION + frameDurationMs`, not `INTRO_DURATION` (which
      // would collide with the intro phase's own last encoded timestamp).
      encodedDurationMs += frameDurationMs;
      await encodeWebCodecsFrame(encodedDurationMs * 1000);

      if (frameIndex % progressUpdateInterval === 0 || frameIndex === frameCount) {
        setExportProgress((frameIndex / frameCount) * 100);
        setExportStage(describeRecordingStage(frameIndex, frameCount));
      }

      const triggeredPictures = getTriggeredPlaybackPictures({
        pictures,
        previousProgress,
        currentProgress: progress,
        shownPictureIds,
        queuedPictureIds: [],
      });
      const triggeredVideos = getTriggeredPlaybackItems({
        items: videos,
        previousProgress,
        currentProgress: progress,
        shownItemIds: shownVideoIds,
        queuedItemIds: [],
      });
      previousProgress = progress;

      // Photos and clips that fall in the same frame are held in route order,
      // so the export cuts between them the way the live replay does.
      const triggeredMedia = [
        ...triggeredPictures.map((picture) => ({ kind: 'picture' as const, picture })),
        ...triggeredVideos.map((video) => ({ kind: 'video' as const, video })),
      ].sort((a, b) => (
        (a.kind === 'picture' ? a.picture.progress : a.video.progress)
        - (b.kind === 'picture' ? b.picture.progress : b.video.progress)
      ));

      for (const media of triggeredMedia) {
        if (!isRecordingRef.current || recordingCancelledRef.current) break;

        if (media.kind === 'picture') {
          const picture = media.picture;
          shownPictureIds.add(picture.id);
          store.setSelectedPictureId(picture.id);
          const holdTimestampOffset = encodedDurationMs;
          const holdDurationMs = picture.displayDuration || 5000;
          // `progress`/`currentTime` are left untouched for the whole hold, so
          // the map/marker stay frozen; only `exportPictureHoldElapsedMs`
          // advances, driving the popup's own zoom/progress-bar animation.
          await capturePictureHold(holdDurationMs, holdTimestampOffset);
          encodedDurationMs = holdTimestampOffset + holdDurationMs;
          store.setSelectedPictureId(null);
          store.setExportPictureHoldElapsedMs(null);
          continue;
        }

        const video = media.video;
        shownVideoIds.add(video.id);
        // A clip whose file was never re-linked has nothing to decode; the
        // export skips it rather than freezing on a placeholder for its whole
        // length.
        if (video.isPlaceholder) continue;

        const holdTimestampOffset = encodedDurationMs;
        store.setExportVideoHoldTimeSeconds(0);
        store.setSelectedVideoId(video.id);
        const decodedDuration = await waitForVideoPopup();
        const clipDuration = decodedDuration ?? video.durationSeconds ?? 0;
        if (clipDuration > 0) {
          const heldMs = await captureVideoHold(clipDuration, holdTimestampOffset);
          encodedDurationMs = holdTimestampOffset + heldMs;
        }
        store.setSelectedVideoId(null);
        store.setExportVideoHoldTimeSeconds(null);
      }
    }

    if (!recordingCancelledRef.current && isRecordingRef.current) {
      // Mirror the on-screen finale: a short hold at the finish, then the
      // outward camera move. Both are encoded before the file is finalized.
      store.setPlayback({ isPlaying: false, currentTime: routeDurationMs, progress: 1 });
      if (OUTRO_DELAY > 0) {
        store.setAnimationPhase('playing');
        await captureDeterministicPhase(OUTRO_DELAY, encodedDurationMs);
        encodedDurationMs += OUTRO_DELAY;
      }

      if (!isRecordingRef.current || recordingCancelledRef.current) return;
      store.setAnimationPhase('outro');
      setExportStage(t('export.recordingOutro'));
      await captureDeterministicPhase(OUTRO_DURATION, encodedDurationMs);
    }

    if (!recordingCancelledRef.current) finishRecording();
  }, [captureDeterministicPhase, capturePictureHold, captureVideoHold, captureFrame, describeRecordingStage, encodeWebCodecsFrame, finishRecording, pictures, setExportProgress, setExportStage, setIsDeterministicExport, t, videoExportSettings, videos, waitForExportFrame, waitForMapFrame, waitForVideoPopup]);

  useEffect(() => {
    if (!isRecordingRef.current) return;

    // The deterministic renderer reports encoded frames itself. React playback
    // updates must not overwrite its Studio ETA or reset the phase label.
    if (useWebCodecsRef.current) return;

    if (animationPhase === 'playing') {
      setExportProgress(playback.progress * 100);
      setExportStage(t('export.recording'));
    } else if (animationPhase === 'intro') {
      setExportStage(t('export.recordingIntro'));
    } else if (animationPhase === 'outro') {
      setExportStage(t('export.recordingOutro'));
    }

    if (animationPhase === 'ended') {
      setTimeout(() => {
        finishRecording();
      }, 1000);
    }
  }, [animationPhase, finishRecording, playback.progress, setExportProgress, setExportStage, t]);

  // Fallback path when WebCodecs MP4 encoding isn't available: record the canvas
  // stream with MediaRecorder. For WebM output we patch the duration on stop so
  // the file stays seekable and doesn't freeze in players other than Chrome.
  const setupMediaRecorderFallback = useCallback(() => {
    if (!recordingCanvasRef.current) return;

    const stream = recordingCanvasRef.current.captureStream(videoExportSettings.fps);
    const { mimeType, actualFormat: recordedFormat } = getSupportedMimeType(videoExportSettings.format);
    const extension = recordedFormat === 'mp4' ? 'mp4' : 'webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: getVideoBitrate(videoExportSettings.quality),
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      // A cancelled export still fires onstop; don't save or download it.
      if (recordingCancelledRef.current) {
        setIsExporting(false);
        resetPlayback();
        return;
      }
      let blob = new Blob(recordedChunksRef.current, { type: mimeType });
      if (blob.size > 0) {
        // MediaRecorder writes WebM without a Duration/Cues header, so many
        // players (QuickTime, Windows, social uploads, editors) freeze after
        // the first cluster. Patch in the real measured duration so the file
        // is seekable and plays to the end everywhere.
        if (recordedFormat === 'webm') {
          const durationMs = recordingStartTimeRef.current > 0
            ? performance.now() - recordingStartTimeRef.current
            : 0;
          if (durationMs > 0) {
            try {
              blob = await fixWebmDuration(blob, durationMs, { logger: false });
            } catch (fixError) {
              console.warn('Failed to patch WebM duration, using raw recording', fixError);
            }
          }
        }

        setExportedBlob(blob);
        setExportStage(t('export.stageComplete'));
        setExportProgress(100);
        trackEvent('export_completed', {
          ...getVideoExportAnalyticsParams(videoExportSettings, extension, playback.totalDuration),
          export_blob_size_bucket: getBlobSizeBucket(blob.size),
          export_encoder_path: 'mediarecorder',
        });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `trail-replay-${Date.now()}.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        setExportStage(t('export.stageFailedNoData'));
        trackEvent('export_failed', {
          export_failure_scope: 'no_data',
          export_format: extension,
          export_encoder_path: 'mediarecorder',
        });
      }
      setIsExporting(false);
      // The screen-recording fallback completes after the normal animation has
      // reached its finale. Reset so the next Play starts a fresh replay.
      resetPlayback();
    };

    recorder.onerror = (event) => {
      // On weaker hardware the encoder can stall or error partway through a
      // high-resolution recording. Stop the capture loop and let onstop
      // finalize whatever was captured so the user still gets a video.
      console.error('MediaRecorder error during export', event);
      trackEvent('export_failed', {
        export_failure_scope: 'recorder_error',
        export_format: recordedFormat,
        export_encoder_path: 'mediarecorder',
      });
      if (frameCleanupRef.current) {
        frameCleanupRef.current();
        frameCleanupRef.current = null;
      }
      if (frameRequestRef.current) {
        cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }
      isRecordingRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };

    recorder.start(100);
  }, [playback.totalDuration, resetPlayback, setExportProgress, setExportStage, setIsExporting, t, videoExportSettings]);

  const handleStartExport = useCallback(async () => {
    const mapCanvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null;
    if (!mapCanvas) {
      alert(t('export.noCanvas'));
      return;
    }
    if (videoExportSettings.qualityMode === 'studio') {
      if (!studioSupported) {
        alert(t('export.qualityModeStudioUnavailable'));
        return;
      }
      if (!localStudioDownload && (!studioDelivery || !isValidDeliveryEmail(studioDelivery.email))) {
        alert(t('export.studioEmailRequired'));
        return;
      }
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStage(t('export.stagePreparing'));
    setExportedBlob(null);
    setStudioDeliveryStatus('idle');
    setStudioDeliveryError(null);
    studioDeliveryJobRef.current = null;
    recordedChunksRef.current = [];
    recordingCancelledRef.current = false;
    setIsDeterministicExport(false);
    useWebCodecsRef.current = false;
    mp4EncoderRef.current = null;
    resetOverlayCapture();
    trackEvent('export_started', {
      ...getVideoExportAnalyticsParams(videoExportSettings, actualFormat, playback.totalDuration),
      export_include_stats: includeStats,
      export_include_elevation: includeElevation,
      track_count: tracks.length,
      picture_count: pictures.length,
      journey_segment_count: journeySegments.length,
      camera_mode: cameraSettings.mode,
      camera_preset: cameraSettings.mode === 'follow-behind' ? cameraSettings.followBehindPreset : 'not_applicable',
      // How much of the cinematic camera was actually authored, so exports
      // can be told apart from ones that only visited the mode.
      cinematic_keyframe_count: useAppStore.getState().cinematicCameraKeyframes.length,
      transport_segment_count: journeySegments.filter((segment) => segment.type === 'transport').length,
      map_style: mapStyle,
      terrain_3d_enabled: show3DTerrain,
    });
    trackEvent('feature_used', {
      feature_name: 'camera_mode',
      feature_value: cameraSettings.mode,
      feature_context: 'video_export',
    });
    if (cameraSettings.mode === 'follow-behind') {
      trackEvent('feature_used', {
        feature_name: 'follow_behind_distance',
        feature_value: cameraSettings.followBehindPreset,
        feature_context: 'video_export',
      });
    }
    visibleStats.forEach((statistic) => {
      trackEvent('feature_used', {
        feature_name: 'statistic',
        feature_value: statistic,
        feature_context: 'video_export',
      });
    });

    try {
      const { width, height } = videoExportSettings.resolution;

      setExportStage(t('export.stageCreateCanvas'));
      if (!recordingCanvasRef.current) {
        recordingCanvasRef.current = document.createElement('canvas');
      }
      recordingCanvasRef.current.width = width;
      recordingCanvasRef.current.height = height;
      recordingContextRef.current = recordingCanvasRef.current.getContext('2d');

      setExportStage(t('export.stageLoadOverlay'));
      await loadHtml2Canvas();

      cachedLogoRef.current = null;
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          cachedLogoRef.current = image;
          resolve();
        };
        image.onerror = () => resolve();
        image.src = '/media/images/logohorizontal.svg';
      });

      await updateOverlayAsync(width, height);

      setExportStage(t('export.stageResetting'));
      const exportSpeed = useAppStore.getState().playback.speed;
      resetPlayback();
      setSpeed(exportSpeed);
      setCinematicPlayed(false);

      setExportStage(t('export.stagePreparing'));
      await preloadExportOpeningTiles();

      // Let MapLibre complete its reset pose before starting the intro and its
      // first encoded frame. This avoids a recording that begins mid-reframe.
      await new Promise((resolve) => setTimeout(resolve, EXPORT_MAP_SETTLE_MS));

      setExportStage(t('export.stageSetupRecorder'));

      // Preferred path: encode MP4 with WebCodecs + mp4-muxer. This produces a
      // clean, seekable file with a real moov/duration, avoiding the fragmented
      // MediaRecorder MP4 that freezes after the first fragment in many players.
      if (videoExportSettings.format === 'mp4') {
        try {
          mp4EncoderRef.current = await createMp4CanvasEncoder({
            width,
            height,
            fps: videoExportSettings.fps,
            bitrate: getVideoBitrate(videoExportSettings.quality),
          });
          useWebCodecsRef.current = mp4EncoderRef.current !== null;
        } catch (encoderError) {
          console.warn('WebCodecs MP4 encoder unavailable, falling back to MediaRecorder', encoderError);
          mp4EncoderRef.current = null;
          useWebCodecsRef.current = false;
        }
      }

      if (videoExportSettings.qualityMode === 'studio' && !useWebCodecsRef.current) {
        throw new Error(t('export.qualityModeStudioUnavailable'));
      }

      if (!useWebCodecsRef.current) {
        setupMediaRecorderFallback();
      }

      // Studio pacing only exists on the deterministic WebCodecs path. The
      // MediaRecorder fallback records against wall clock, so pausing between
      // frames to wait for tiles would stretch the video rather than sharpen it.
      studioQualityRef.current =
        videoExportSettings.qualityMode === 'studio' && useWebCodecsRef.current;
      studioStatsRef.current = { frames: 0, timedOutFrames: 0, waitedMs: 0 };
      hiddenMsRef.current = 0;
      hiddenSinceRef.current = document.hidden ? performance.now() : null;
      if (studioQualityRef.current) {
        if (!localStudioDownload) {
          setStudioDeliveryStatus('registering');
          setExportStage(t('export.stageRegisteringDelivery'));
          try {
            studioDeliveryJobRef.current = await createStudioDeliveryJob({
              email: studioDelivery!.email,
              marketingConsent: studioDelivery!.marketingConsent,
              locale: language,
              settings: {
                quality: videoExportSettings.quality,
                qualityMode: 'studio',
                aspectRatio: videoExportSettings.aspectRatio,
                fps: videoExportSettings.fps,
                durationMs: playback.totalDuration,
              },
            });
          } catch (deliveryError) {
            const message = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
            setStudioDeliveryStatus('failed');
            setStudioDeliveryError(message);
            throw deliveryError;
          }
        }
        applyStudioMapSettings();
        await requestScreenWakeLock();
      }

      setExportStage(t('export.stageStartingRecording'));
      recordingStartTimeRef.current = performance.now();
      isRecordingRef.current = true;

      setExportStage(t('export.stageRecordingAnimation'));
      if (useWebCodecsRef.current) {
        void runDeterministicExport().catch((error) => {
          console.error('Deterministic export failed', error);
          setExportStage(t('export.stageFailedWithError', { error: (error as Error).message }));
          finishRecording();
        });
      } else {
        startFrameCapture();
        await new Promise((resolve) => setTimeout(resolve, 200));
        play();
      }
    } catch (error) {
      console.error('Export failed:', error);
      trackEvent('export_failed', {
        export_failure_scope: 'setup',
        export_format: actualFormat,
        export_encoder_path: useWebCodecsRef.current ? 'webcodecs' : 'unknown',
      });
      setExportStage(t('export.stageFailedWithError', { error: (error as Error).message }));
      restoreStudioMapSettings();
      studioDeliveryJobRef.current = null;
      studioQualityRef.current = false;
      setIsExporting(false);
      setIsDeterministicExport(false);
      resetPlayback();
      isRecordingRef.current = false;
      if (mp4EncoderRef.current) {
        mp4EncoderRef.current.close();
        mp4EncoderRef.current = null;
      }
      useWebCodecsRef.current = false;
    }
  }, [actualFormat, applyStudioMapSettings, cameraSettings.followBehindPreset, cameraSettings.mode, finishRecording, includeElevation, includeStats, journeySegments, language, loadHtml2Canvas, mapStyle, pictures.length, play, playback.totalDuration, preloadExportOpeningTiles, requestScreenWakeLock, resetOverlayCapture, resetPlayback, restoreStudioMapSettings, runDeterministicExport, setCinematicPlayed, setExportProgress, setExportStage, setIsDeterministicExport, setIsExporting, setSpeed, setupMediaRecorderFallback, show3DTerrain, startFrameCapture, studioDelivery, studioSupported, t, tracks.length, updateOverlayAsync, videoExportSettings, visibleStats]);

  // `requestAnimationFrame` does not fire while the tab is hidden, so the whole
  // export — standard and studio alike — stalls until the user comes back.
  // Track that time so the studio ETA is not poisoned by it, and say so.
  useEffect(() => {
    if (!isExporting) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenSinceRef.current = performance.now();
        return;
      }
      if (hiddenSinceRef.current !== null) {
        hiddenMsRef.current += performance.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;
      }
      // The screen lock is dropped by the browser whenever the page is hidden,
      // so it has to be taken again on the way back.
      if (studioQualityRef.current && !wakeLockRef.current) void requestScreenWakeLock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isExporting, requestScreenWakeLock]);

  const handleCancelExport = useCallback(() => {
    const exportEncoderPath = useWebCodecsRef.current ? 'webcodecs' : 'mediarecorder';
    isRecordingRef.current = false;
    recordingCancelledRef.current = true;
    resetOverlayCapture();
    restoreStudioMapSettings();
    studioDeliveryJobRef.current = null;
    studioQualityRef.current = false;

    if (frameCleanupRef.current) {
      frameCleanupRef.current();
      frameCleanupRef.current = null;
    }
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mp4EncoderRef.current) {
      mp4EncoderRef.current.close();
      mp4EncoderRef.current = null;
    }
    useWebCodecsRef.current = false;
    setIsDeterministicExport(false);

    trackEvent('export_cancelled', {
      export_progress_bucket: getProgressBucket(exportProgress),
      export_format: actualFormat,
      export_encoder_path: exportEncoderPath,
    });
    setIsExporting(false);
    setExportProgress(0);
    setExportStage('');
    resetPlayback();
  }, [actualFormat, exportProgress, resetOverlayCapture, resetPlayback, restoreStudioMapSettings, setExportProgress, setExportStage, setIsDeterministicExport, setIsExporting]);

  const handleDownload = useCallback(() => {
    if (!exportedBlob) return;

    const extension = exportedBlob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(exportedBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `trail-replay-${Date.now()}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    trackEvent('export_downloaded_again', { export_format: extension });
  }, [exportedBlob]);

  const resetExportResult = useCallback(() => {
    setExportedBlob(null);
    setStudioDeliveryStatus('idle');
    setStudioDeliveryError(null);
    setExportProgress(0);
    setExportStage('');
  }, [setExportProgress, setExportStage]);

  return {
    actualFormat,
    estimatedSize,
    exportProgress,
    exportStage,
    exportedBlob,
    handleCancelExport,
    handleDownload,
    handleStartExport,
    isExporting,
    mp4Supported,
    resetExportResult,
    studioDeliveryError,
    studioDeliveryStatus,
    studioSupported,
  };
}
