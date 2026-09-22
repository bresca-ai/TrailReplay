import type { RefObject } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { mapGlobalRef } from '@/utils/mapRef';
import { getCropRegion } from '@/utils/crop';
import { getActivePlaybackAnnotationId } from '@/utils/playbackAnnotations';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { sideAnnotationContent } from '@/components/annotations/sideAnnotationContent';
import { drawAnnotationSymbol } from '@/components/annotations/annotationSymbol';
import type { VideoExportSettings } from '@/types';
import type { useExportOverlayCapture } from './useExportOverlayCapture';

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

type OverlayCapture = ReturnType<typeof useExportOverlayCapture>;

interface DrawExportFrameOptions {
  recordingCanvasRef: RefObject<HTMLCanvasElement | null>;
  recordingContextRef: RefObject<CanvasRenderingContext2D | null>;
  videoExportSettings: VideoExportSettings;
  cachedOverlayRef: OverlayCapture['cachedOverlayRef'];
  cachedPopupOverlayRef: OverlayCapture['cachedPopupOverlayRef'];
  drawVideoFrame: OverlayCapture['drawVideoFrame'];
  drawStatsValues: OverlayCapture['drawStatsValues'];
  drawElevationProgress: OverlayCapture['drawElevationProgress'];
  svgMarkerImageCacheRef: RefObject<Map<string, HTMLImageElement>>;
  preloadSvgMarkerIcon: (url: string) => void;
  getTrackLabel: (progress: number) => { color: string; text: string } | null;
  cachedLogoRef: RefObject<HTMLImageElement | null>;
  overlayLastUpdateRef: OverlayCapture['overlayLastUpdateRef'];
  overlayBusyRef: OverlayCapture['overlayBusyRef'];
  overlayRefreshIntervalMs: number;
  updateOverlayAsync: OverlayCapture['updateOverlayAsync'];
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function drawExportFrame({
  recordingCanvasRef,
  recordingContextRef,
  videoExportSettings,
  cachedOverlayRef,
  cachedPopupOverlayRef,
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
}: DrawExportFrameOptions) {
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

    const scaleX = recordW / cropW;
    const scaleY = recordH / cropH;

    // Stats and elevation sit behind the side note in the live map.
    drawStatsValues(context, {
      containerRect,
      cropX,
      cropY,
      recordW,
      recordH,
      scaleToRecording: scaleX,
    });
    drawElevationProgress(context, { recordW, recordH, scaleToRecording: scaleX });

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
        const scale = recordW / cropW;
        const copy = sideAnnotationContent(localizedAnnotation(sideAnnotation, currentState.settings.language));
        const inset = 20 * scale;
        const contentX = x + inset;
        const maxWidth = w - inset * 2;
        context.save();
        const logoY = y + 18 * scale;
        drawAnnotationSymbol(context, sideAnnotation.logo || 'map:pin', contentX + 17 * scale, logoY + 17 * scale, 29 * scale, sideAnnotation.color);
        context.shadowColor = 'rgba(3,13,16,0.9)';
        context.shadowBlur = 6 * scale;
        context.shadowOffsetY = 2 * scale;
        context.textAlign = 'left';
        context.font = `600 ${10 * scale}px "JetBrains Mono", monospace`;
        context.fillStyle = '#f8f6f0';
        context.fillText((copy.eyebrow || t('annotations.sidePanelEyebrow')).toLocaleUpperCase(), contentX + 45 * scale, logoY + 12 * scale);
        if (copy.code) {
          context.font = `700 ${15 * scale}px "JetBrains Mono", monospace`;
          context.fillStyle = sideAnnotation.color;
          context.fillText(copy.code, contentX + 45 * scale, logoY + 31 * scale);
        }
        context.fillStyle = sideAnnotation.color;
        context.fillRect(x + w - 51 * scale, logoY + 10 * scale, 31 * scale, scale);

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
        let nextY = drawWrapped(copy.title, `700 ${23 * scale}px "JetBrains Mono", monospace`, 29, y + 82 * scale, 3);
        if (copy.meta) {
          context.fillStyle = sideAnnotation.color;
          nextY = drawWrapped(copy.meta, `600 ${12 * scale}px "JetBrains Mono", monospace`, 17, nextY + 4 * scale, 2);
        }
        if (copy.description) {
          const dividerY = nextY + 8 * scale;
          context.strokeStyle = sideAnnotation.color;
          context.lineWidth = scale;
          context.beginPath();
          context.moveTo(contentX, dividerY);
          context.lineTo(x + w - inset, dividerY);
          context.stroke();
          context.fillStyle = '#f8f6f0';
          context.font = `600 ${10 * scale}px "JetBrains Mono", monospace`;
          context.fillText(t('annotations.sidePanelDetails').toLocaleUpperCase(), contentX, dividerY + 22 * scale);
          context.fillStyle = '#f8f6f0';
          drawWrapped(copy.description, `500 ${12 * scale}px "JetBrains Mono", monospace`, 19, dividerY + 43 * scale, 12);
        }
        context.restore();
      }
    }

    // The popup has a higher live z-index than the side note. Keep its cached
    // chrome and photo above the note, with decoded video frames above chrome.
    if (cachedPopupOverlayRef.current) {
      context.drawImage(cachedPopupOverlayRef.current, 0, 0, recordW, recordH);
    }
    drawVideoFrame(context, {
      containerRect,
      cropX,
      cropY,
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
}
