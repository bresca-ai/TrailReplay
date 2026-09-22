import { useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getElevationAtProgress } from '@/components/map/elevationProfile';
import { TRANSPORT_ICONS } from '@/utils/journeyUtils';
import { convertElevation } from '@/utils/units';
import type { StatId } from '@/types';
import {
  getCapturedCanvasDrawSize,
  getElevationOverlayDrawRect,
  getExportOverlayMetrics,
  getExportedOverlayFontSize,
  getObjectContainRect,
  getPopupOverlayDrawRect,
  getStatsOverlayDrawRect,
  getStatsValueTimelineBucket,
  isDrawableRect,
} from './exportOverlay';

type Html2Canvas = (
  element: HTMLElement,
  options: {
    backgroundColor: string | null;
    scale: number;
    logging: boolean;
    useCORS: boolean;
    allowTaint?: boolean;
    ignoreElements?: (element: Element) => boolean;
    onclone?: (documentClone: Document) => void;
    width?: number;
    height?: number;
  }
) => Promise<HTMLCanvasElement>;

declare global {
  interface Window {
    html2canvas?: Html2Canvas;
  }
}

interface UseExportOverlayCaptureOptions {
  elevationData: Array<{
    elevation: number;
    progress: number;
    segmentIndex: number;
    segmentType: 'track' | 'transport';
  }>;
  includeElevation: boolean;
  includeStats: boolean;
  getStatsValues: (progress: number) => Partial<Record<StatId, string>>;
}

export function useExportOverlayCapture({
  elevationData,
  getStatsValues,
  includeElevation,
  includeStats,
}: UseExportOverlayCaptureOptions) {
  const cachedOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const cachedPopupOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const overlayBusyRef = useRef(false);
  const overlayLastUpdateRef = useRef(0);
  const html2CanvasLoaderRef = useRef<Promise<boolean> | null>(null);
  const overlayRunIdRef = useRef(0);
  const elevationPathCacheRef = useRef(new Map<string, Path2D>());
  const statsValuesCacheRef = useRef<{
    timelineBucket: number;
    values: Partial<Record<StatId, string>>;
  }>({ timelineBucket: -1, values: {} });
  const elevationSegments = useMemo(() => {
    const segments = new Map<number, {
      points: Array<{ elevation: number; progress: number }>;
      type: 'track' | 'transport';
    }>();

    elevationData.forEach((sample) => {
      const segment = segments.get(sample.segmentIndex) ?? {
        points: [],
        type: sample.segmentType,
      };
      segment.points.push({ elevation: sample.elevation, progress: sample.progress });
      segments.set(sample.segmentIndex, segment);
    });
    segments.forEach((segment) => segment.points.sort((a, b) => a.progress - b.progress));
    return segments;
  }, [elevationData]);

  const loadHtml2Canvas = useCallback(async (): Promise<boolean> => {
    if (window.html2canvas) return true;
    if (html2CanvasLoaderRef.current) return html2CanvasLoaderRef.current;

    html2CanvasLoaderRef.current = new Promise((resolve) => {
      const existingScript = document.querySelector('script[data-trailreplay-html2canvas="true"]') as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true), { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.crossOrigin = 'anonymous';
      script.dataset.trailreplayHtml2canvas = 'true';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    return html2CanvasLoaderRef.current;
  }, []);

  const updateOverlayAsync = useCallback(async (recordW: number, recordH: number) => {
    const capture = window.html2canvas;
    if (overlayBusyRef.current || !capture) return;
    const runId = overlayRunIdRef.current;
    overlayBusyRef.current = true;
    overlayLastUpdateRef.current = Date.now();

    try {
      const container = document.getElementById('map-capture-container');
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const { cropX, cropY, scaleToRecording, margin } = getExportOverlayMetrics(containerRect, recordW, recordH);
      const overlay = document.createElement('canvas');
      overlay.width = recordW;
      overlay.height = recordH;
      const overlayContext = overlay.getContext('2d');
      if (!overlayContext) return;
      const popupOverlay = document.querySelector('.tr-picture-popup, .tr-video-popup')
        ? document.createElement('canvas')
        : null;
      if (popupOverlay) {
        popupOverlay.width = recordW;
        popupOverlay.height = recordH;
      }
      const popupOverlayContext = popupOverlay?.getContext('2d');
      let hasPopupOverlay = false;

      if (includeStats) {
        const statsElement = document.querySelector('.tr-stats-overlay') as HTMLElement | null;
        if (statsElement) {
          try {
            const statsCaptureScale = 4;
            const statsRect = statsElement.getBoundingClientRect();
            const captureCanvas = await capture(statsElement, {
              backgroundColor: null,
              scale: statsCaptureScale,
              logging: false,
              useCORS: true,
              allowTaint: true,
              width: statsElement.offsetWidth,
              height: statsElement.offsetHeight,
              ignoreElements: (element) => element.hasAttribute('data-export-stat-value'),
              // Capture the intrinsic 1x overlay, then apply statsScale once
              // in the export layout math below. Otherwise html2canvas may
              // bake the preview's ancestor transform into the bitmap and the
              // compositor would scale it a second time.
              onclone: (documentClone) => {
                const scaleWrapper = documentClone.querySelector('[data-stats-scale-wrapper]') as HTMLElement | null;
                if (scaleWrapper) scaleWrapper.style.transform = 'none';
              },
            });
            const { drawWidth, drawHeight } = getCapturedCanvasDrawSize(captureCanvas, scaleToRecording, statsCaptureScale);
            const hasCustomPosition = useAppStore.getState().settings.statsPosition !== null;
            const statsScale = useAppStore.getState().settings.statsScale ?? 1;
            const statsDrawRect = getStatsOverlayDrawRect({
              captureCanvas: { width: drawWidth, height: drawHeight }, scaleToRecording: 1, positionScale: scaleToRecording, recordW, recordH, margin,
              sizeScale: statsScale,
              ...(hasCustomPosition && { elementRect: statsRect, containerRect, cropX, cropY }),
            });
            overlayContext.drawImage(captureCanvas, 0, 0, captureCanvas.width, captureCanvas.height, statsDrawRect.drawX, statsDrawRect.drawY, statsDrawRect.drawWidth, statsDrawRect.drawHeight);
          } catch { /* Skip overlay when capture fails. */ }
        }
      }

      if (includeElevation) {
        const elevationElement = document.getElementById('mapElevationProfile') as HTMLElement | null;
        if (elevationElement) {
          try {
            const captureCanvas = await capture(elevationElement, {
              backgroundColor: null,
              scale: 1,
              logging: false,
              useCORS: true,
              // The progress fill and elevation label are drawn directly onto
              // every video frame below. Keeping them out of this comparatively
              // expensive DOM snapshot prevents a stale 12fps copy underneath.
              ignoreElements: (element) => element.hasAttribute('data-export-elevation-dynamic'),
            });
            const rect = getElevationOverlayDrawRect({ captureCanvas, scaleToRecording, recordW, recordH, margin });
            overlayContext.drawImage(captureCanvas, 0, 0, captureCanvas.width, captureCanvas.height, rect.drawX, rect.drawY, rect.drawWidth, rect.drawHeight);
          } catch { /* Skip overlay when capture fails. */ }
        }
      }

      const picturePopupElement = document.querySelector('.tr-picture-popup') as HTMLElement | null;
      if (picturePopupElement) {
        try {
          const popupRect = picturePopupElement.getBoundingClientRect();
          const popupDrawRect = getPopupOverlayDrawRect({ popupRect, containerRect, cropX, cropY, scaleToRecording });
          if (popupOverlayContext && isDrawableRect(popupDrawRect)) {
            // html2canvas doesn't reliably support `object-fit: contain` —
            // it can tile/repeat the source image to fill the element's box
            // instead of letterboxing it, which showed up as the correctly
            // sized photo with a stretched, repeated copy behind it. Skip
            // the <img> in this capture entirely (chrome only: rounded
            // corners, shadow, progress bar, caption gradient) and rely
            // solely on the manually contain-fitted `drawImage` below for
            // the actual photo.
            const captureCanvas = await capture(picturePopupElement, {
              backgroundColor: null,
              scale: 1,
              logging: false,
              useCORS: true,
              allowTaint: true,
              ignoreElements: (element) => element.tagName === 'IMG',
            });
            popupOverlayContext.drawImage(captureCanvas, 0, 0, captureCanvas.width, captureCanvas.height, popupDrawRect.drawX, popupDrawRect.drawY, popupDrawRect.drawWidth, popupDrawRect.drawHeight);
            hasPopupOverlay = true;
            const popupImageElement = picturePopupElement.querySelector('img') as HTMLImageElement | null;
            if (popupImageElement?.complete && popupImageElement.naturalWidth > 0) {
              // The <img> is styled object-fit: contain, so its own bounding
              // box is the *full* popup box, not the letterboxed photo
              // within it — draw into the contain-fitted sub-rect instead,
              // or the natural image gets stretched to fill the whole box.
              const containRect = getObjectContainRect(
                popupImageElement.getBoundingClientRect(),
                popupImageElement.naturalWidth,
                popupImageElement.naturalHeight,
              );
              const imageRect = getPopupOverlayDrawRect({ popupRect: containRect, containerRect, cropX, cropY, scaleToRecording });
              if (isDrawableRect(imageRect)) popupOverlayContext.drawImage(popupImageElement, imageRect.drawX, imageRect.drawY, imageRect.drawWidth, imageRect.drawHeight);
            }
          }
        } catch { /* Skip popup capture when unavailable. */ }
      }

      // Clips get the same treatment as the photo above: html2canvas cannot
      // rasterize a <video>, so the chrome is captured without it.
      //
      // Only the chrome goes into this cached snapshot. The moving picture is
      // drawn straight onto every encoded frame by `drawVideoFrame` instead,
      // for the same reason the elevation progress fill is: this snapshot is
      // refreshed at most 12 times a second and is reused in between, so a
      // clip baked into it plays at the *snapshot* rate rather than the
      // video's — and when html2canvas cannot keep up (it is far more
      // expensive than a `drawImage`), the same decoded frame is reused for
      // the whole hold and the clip looks like a still photo.
      const videoPopupElement = document.querySelector('.tr-video-popup') as HTMLElement | null;
      if (videoPopupElement) {
        try {
          const popupRect = videoPopupElement.getBoundingClientRect();
          const popupDrawRect = getPopupOverlayDrawRect({ popupRect, containerRect, cropX, cropY, scaleToRecording });
          if (popupOverlayContext && isDrawableRect(popupDrawRect)) {
            const captureCanvas = await capture(videoPopupElement, {
              backgroundColor: null,
              scale: 1,
              logging: false,
              useCORS: true,
              allowTaint: true,
              ignoreElements: (element) => element.tagName === 'VIDEO',
            });
            popupOverlayContext.drawImage(captureCanvas, 0, 0, captureCanvas.width, captureCanvas.height, popupDrawRect.drawX, popupDrawRect.drawY, popupDrawRect.drawWidth, popupDrawRect.drawHeight);
            hasPopupOverlay = true;
          }
        } catch { /* Skip popup capture when unavailable. */ }
      }

      if (runId === overlayRunIdRef.current) {
        cachedOverlayRef.current = overlay;
        cachedPopupOverlayRef.current = hasPopupOverlay ? popupOverlay : null;
      }
    } finally {
      overlayBusyRef.current = false;
    }
  }, [includeElevation, includeStats]);

  /**
   * Draws the clip's current decoded frame onto the frame being encoded.
   *
   * This runs for every single encoded frame, unlike the html2canvas snapshot
   * around it, which is why a clip in an exported video moves at all. The
   * popup's chrome — rounded corners, progress bar, caption — comes from that
   * snapshot underneath; this only paints the picture, contain-fitted into the
   * same box the live popup uses.
   */
  const drawVideoFrame = useCallback((
    context: CanvasRenderingContext2D,
    {
      containerRect,
      cropX,
      cropY,
      scaleToRecording,
    }: {
      containerRect: DOMRect;
      cropX: number;
      cropY: number;
      scaleToRecording: number;
    },
  ) => {
    const videoElement = document.querySelector('.tr-video-popup video') as HTMLVideoElement | null;
    if (!videoElement || videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

    const containRect = getObjectContainRect(
      videoElement.getBoundingClientRect(),
      videoElement.videoWidth,
      videoElement.videoHeight,
    );
    const frameRect = getPopupOverlayDrawRect({ popupRect: containRect, containerRect, cropX, cropY, scaleToRecording });
    if (!isDrawableRect(frameRect)) return;

    try {
      context.drawImage(videoElement, frameRect.drawX, frameRect.drawY, frameRect.drawWidth, frameRect.drawHeight);
    } catch { /* A frame that is not decodable yet leaves the chrome as it is. */ }
  }, []);

  const drawStatsValues = useCallback((
    context: CanvasRenderingContext2D,
    {
      containerRect,
      cropX,
      cropY,
      recordW,
      recordH,
      scaleToRecording,
    }: {
      containerRect: DOMRect;
      cropX: number;
      cropY: number;
      recordW: number;
      recordH: number;
      scaleToRecording: number;
    },
  ) => {
    if (!includeStats) return;

    const statsElement = document.querySelector('.tr-stats-overlay') as HTMLElement | null;
    if (!statsElement) return;

    const state = useAppStore.getState();
    // Ten value updates per second of encoded video are visually fluid for
    // changing numerals, while avoiding repeated route-stat calculations on
    // every 30/60fps frame. Drawing the cached values remains per-frame.
    const timelineBucket = getStatsValueTimelineBucket(state.playback.currentTime);
    if (timelineBucket !== statsValuesCacheRef.current.timelineBucket) {
      statsValuesCacheRef.current = {
        timelineBucket,
        values: getStatsValues(state.playback.progress),
      };
    }

    const statsRect = statsElement.getBoundingClientRect();
    if (statsRect.width <= 0 || statsRect.height <= 0) return;

    const margin = Math.round(recordW * 0.025);
    const hasCustomPosition = state.settings.statsPosition !== null;
    const statsScale = state.settings.statsScale ?? 1;
    const drawRect = getStatsOverlayDrawRect({
      captureCanvas: {
        width: (statsRect.width / statsScale) * scaleToRecording,
        height: (statsRect.height / statsScale) * scaleToRecording,
      },
      scaleToRecording: 1,
      positionScale: scaleToRecording,
      recordW,
      recordH,
      margin,
      sizeScale: statsScale,
      ...(hasCustomPosition && { elementRect: statsRect, containerRect, cropX, cropY }),
    });
    const elementScaleX = drawRect.drawWidth / statsRect.width;
    const elementScaleY = drawRect.drawHeight / statsRect.height;

    statsElement.querySelectorAll<HTMLElement>('[data-export-stat-value]').forEach((valueElement) => {
      const id = valueElement.dataset.exportStatValue as StatId | undefined;
      const value = id ? statsValuesCacheRef.current.values[id] : undefined;
      if (!value) return;

      const rect = valueElement.getBoundingClientRect();
      const style = getComputedStyle(valueElement);
      const centerX = drawRect.drawX
        + (rect.left + rect.width / 2 - statsRect.left) * elementScaleX;
      const centerY = drawRect.drawY
        + (rect.top + rect.height / 2 - statsRect.top) * elementScaleY;
      // The labels in the cached html2canvas bitmap scale from the overlay's
      // intrinsic layout dimensions into drawRect. Values are excluded from
      // that bitmap and redrawn here, so they must use the same ratio. Using
      // statsRect.height would cancel the ancestor statsScale transform and
      // make the numbers disproportionately small in the exported video.
      const fontSize = getExportedOverlayFontSize(
        Number.parseFloat(style.fontSize) || 9,
        statsElement.offsetHeight,
        drawRect.drawHeight,
      );

      context.save();
      context.font = `${style.fontWeight || '600'} ${fontSize}px ${style.fontFamily || 'sans-serif'}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = style.color || '#ffffff';
      // With no panel behind them the values sit straight on the map, where a
      // bright snowfield can swallow white text. The live overlay leans on a
      // CSS text-shadow, which never reaches these hand-drawn numbers, so the
      // same shadow is applied to the canvas.
      if (statsElement.classList.contains('tr-stats-overlay--plain')) {
        context.shadowColor = 'rgba(0, 0, 0, 0.85)';
        context.shadowBlur = Math.max(2, fontSize * 0.25);
        context.shadowOffsetY = Math.max(1, fontSize * 0.06);
      }
      context.fillText(value, centerX, centerY);
      context.restore();
    });
  }, [getStatsValues, includeStats]);

  const drawElevationProgress = useCallback((
    context: CanvasRenderingContext2D,
    {
      recordW,
      recordH,
      scaleToRecording,
    }: {
      recordW: number;
      recordH: number;
      scaleToRecording: number;
    },
  ) => {
    if (!includeElevation || typeof Path2D === 'undefined') return;

    const svg = document.getElementById('elevationProfileSvg') as SVGSVGElement | null;
    const elevationElement = document.getElementById('mapElevationProfile');
    if (!svg || !elevationElement) return;

    const viewBox = svg.viewBox.baseVal;
    if (viewBox.width <= 0 || viewBox.height <= 0) return;

    const elementRect = elevationElement.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    if (elementRect.width <= 0 || elementRect.height <= 0) return;

    // Match the exact centered/constrained rect used for the cached static
    // elevation snapshot, then place the SVG and label within that rect using
    // their DOM-relative positions.
    const overlayRect = getElevationOverlayDrawRect({
      captureCanvas: { width: elementRect.width, height: elementRect.height },
      scaleToRecording,
      recordW,
      recordH,
      margin: Math.round(recordW * 0.025),
    });
    const elementScaleX = overlayRect.drawWidth / elementRect.width;
    const elementScaleY = overlayRect.drawHeight / elementRect.height;
    const drawX = overlayRect.drawX + (svgRect.left - elementRect.left) * elementScaleX;
    const drawY = overlayRect.drawY + (svgRect.top - elementRect.top) * elementScaleY;
    const drawWidth = svgRect.width * elementScaleX;
    const drawHeight = svgRect.height * elementScaleY;
    const progress = Math.max(0, Math.min(1, useAppStore.getState().playback.progress));

    context.save();
    context.translate(drawX, drawY);
    context.scale(drawWidth / viewBox.width, drawHeight / viewBox.height);
    context.beginPath();
    context.rect(viewBox.x, viewBox.y, viewBox.width * progress, viewBox.height);
    context.clip();

    svg.querySelectorAll<SVGPathElement>('[data-export-elevation-segment]').forEach((element) => {
      const pathData = element.getAttribute('d');
      if (!pathData) return;

      let path = elevationPathCacheRef.current.get(pathData);
      if (!path) {
        path = new Path2D(pathData);
        elevationPathCacheRef.current.set(pathData, path);
      }

      const color = svg.dataset.exportElevationProgressColor
        || element.dataset.exportElevationColor
        || '#c1652f';
      context.globalAlpha = 0.7;
      context.fillStyle = color;
      context.fill(path);
      context.globalAlpha = 1;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke(path);
    });
    context.restore();

    if (progress <= 0) return;

    let currentSegment: {
      points: Array<{ elevation: number; progress: number }>;
      type: 'track' | 'transport';
    } | undefined;
    let currentSegmentIndex = 0;
    elevationSegments.forEach((segment, segmentIndex) => {
      const first = segment.points[0];
      const last = segment.points[segment.points.length - 1];
      if (first && last && progress >= first.progress && progress <= last.progress) {
        currentSegment = segment;
        currentSegmentIndex = segmentIndex;
      }
    });
    if (!currentSegment) return;

    const state = useAppStore.getState();
    const unitSystem = state.settings.unitSystem;
    const isCompact = recordW > recordH;
    const centerX = drawX + progress * drawWidth;
    const baselineY = overlayRect.drawY
      + overlayRect.drawHeight
      - (isCompact ? 4 : 8) * elementScaleY;

    context.save();
    context.textBaseline = 'bottom';
    context.fillStyle = '#ffffff';
    context.shadowColor = 'rgba(0, 0, 0, 0.8)';
    context.shadowBlur = 5 * elementScaleY;
    context.shadowOffsetY = 2 * elementScaleY;

    if (currentSegment.type === 'transport') {
      const journeySegment = state.journeySegments[currentSegmentIndex];
      const mode = journeySegment?.type === 'transport' ? journeySegment.mode : 'car';
      const icon = TRANSPORT_ICONS[mode] || '🚗';
      context.font = `${(isCompact ? 12 : 18) * elementScaleY}px sans-serif`;
      context.textAlign = 'center';
      context.fillText(icon, centerX, baselineY);
    } else {
      const elevation = getElevationAtProgress(currentSegment.points, progress);
      const value = String(Math.round(convertElevation(elevation, unitSystem)));
      const unit = unitSystem === 'metric' ? 'M' : 'FT';
      const valueSize = (isCompact ? 14 : 22) * elementScaleY;
      const unitSize = (isCompact ? 9 : 14) * elementScaleY;
      const gap = (isCompact ? 4 : 6) * elementScaleX;
      const family = 'JetBrains Mono, monospace';

      context.font = `700 ${valueSize}px ${family}`;
      const valueWidth = context.measureText(value).width;
      context.font = `600 ${unitSize}px ${family}`;
      const unitWidth = context.measureText(unit).width;
      let textX = centerX - (valueWidth + gap + unitWidth) / 2;

      context.textAlign = 'left';
      context.font = `700 ${valueSize}px ${family}`;
      context.fillText(value, textX, baselineY);
      textX += valueWidth + gap;
      context.font = `600 ${unitSize}px ${family}`;
      context.fillText(unit, textX, baselineY);
    }
    context.restore();
  }, [elevationSegments, includeElevation]);

  const resetOverlayCapture = useCallback(() => {
    cachedOverlayRef.current = null;
    cachedPopupOverlayRef.current = null;
    overlayBusyRef.current = false;
    overlayLastUpdateRef.current = 0;
    overlayRunIdRef.current += 1;
    elevationPathCacheRef.current.clear();
    statsValuesCacheRef.current = { timelineBucket: -1, values: {} };
  }, []);

  return {
    cachedOverlayRef,
    cachedPopupOverlayRef,
    drawElevationProgress,
    drawStatsValues,
    loadHtml2Canvas,
    overlayBusyRef,
    overlayLastUpdateRef,
    drawVideoFrame,
    resetOverlayCapture,
    updateOverlayAsync,
  };
}
