import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { mapGlobalRef } from '@/utils/mapRef';
import { getCropRegion } from '@/utils/crop';
import { trackEvent } from '@/utils/analytics';
import { trackSocialExportConfiguration } from '@/utils/configurationAnalytics';
import { buildSocialShareSummary } from './socialShareData';
import { translate } from '@/i18n/translations';
import { getPosterSize, renderSocialPoster, exportSocialPosterBlob } from './socialShareRenderer';
import type { RenderInput } from './socialShareRenderer';
import type { CanvasPoint, FitBox } from './socialShareRouteFit';
import { downsampleRoute, fitRouteToBox } from './socialShareRouteFit';

const BRAND_ORANGE = '#C1652F';

export interface RouteBboxNorm {
  x: number; y: number; w: number; h: number;
}

export function useSocialShareExport() {
  const settings = useAppStore((s) => s.socialShareSettings);
  const setSocialShareSettings = useAppStore((s) => s.setSocialShareSettings);
  const tracks = useAppStore((s) => s.tracks);
  const activeTrackId = useAppStore((s) => s.activeTrackId);
  const journey = useAppStore((s) => s.journey);
  const journeySegments = useAppStore((s) => s.journeySegments);
  const pictures = useAppStore((s) => s.pictures);
  const unitSystem = useAppStore((s) => s.settings.unitSystem);
  const language = useAppStore((s) => s.settings.language);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [routeBboxNorm, setRouteBboxNorm] = useState<RouteBboxNorm | null>(null);

  const logoRef = useRef<HTMLImageElement | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const photoIdRef = useRef<string | null>(null);

  const selectablePictures = pictures.filter((p) => !p.isPlaceholder);
  const selectedPicture = selectablePictures.find((p) => p.id === settings.selectedPictureId) ?? null;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { logoRef.current = img; };
    img.src = '/media/images/logohorizontalfondo.svg';
  }, []);

  useEffect(() => {
    if (!selectedPicture) {
      photoRef.current = null;
      photoIdRef.current = null;
      setPhotoVersion((v) => v + 1);
      return;
    }
    if (photoIdRef.current === selectedPicture.id && photoRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      photoRef.current = img;
      photoIdRef.current = selectedPicture.id;
      setPhotoVersion((v) => v + 1);
    };
    img.onerror = () => setPhotoVersion((v) => v + 1);
    img.src = selectedPicture.url;
  }, [selectedPicture]);

  const buildInput = useCallback((preCapuredMapCanvas: HTMLCanvasElement | null = null): RenderInput => {
    const summary = buildSocialShareSummary(
      settings, tracks, activeTrackId, journey, journeySegments, unitSystem,
    );

    let mapCanvas: HTMLCanvasElement | null = null;
    let projectedRouteForMap: CanvasPoint[] | null = null;
    let routeLatLons: Array<{ lat: number; lon: number }> | null = null;

    if (settings.template === 'map-first') {
      // Use the pre-captured 2D snapshot — raw WebGL canvas is passed here only as a fallback
      mapCanvas = preCapuredMapCanvas;

      const map = mapGlobalRef.current;
      const container = document.getElementById('map-capture-container');
      if (map && container && tracks.length > 0) {
        const { w: posterW, h: posterH } = getPosterSize(settings.aspectRatio);
        const rect = container.getBoundingClientRect();
        const { cropX, cropY, cropW, cropH } = getCropRegion(rect, posterW, posterH);
        const pts: CanvasPoint[] = [];
        for (const track of tracks) {
          if (!track.visible) continue;
          const step = Math.max(1, Math.floor(track.points.length / 300));
          for (let i = 0; i < track.points.length; i += step) {
            const pt = track.points[i];
            const sp = map.project([pt.lon, pt.lat]);
            pts.push({
              x: (sp.x - cropX) / cropW * posterW,
              y: (sp.y - cropY) / cropH * posterH,
            });
          }
        }
        projectedRouteForMap = pts;
      }
    } else {
      const pts: Array<{ lat: number; lon: number }> = [];
      for (const track of tracks) {
        if (!track.visible) continue;
        const step = Math.max(1, Math.floor(track.points.length / 300));
        for (let i = 0; i < track.points.length; i += step) {
          pts.push({ lat: track.points[i].lat, lon: track.points[i].lon });
        }
      }
      routeLatLons = pts;
    }

    const primaryTrack = tracks.find((t) => t.visible);
    const routeColor = primaryTrack?.color ?? BRAND_ORANGE;

    const t = (key: string) => translate(language, key);
    const labels = {
      distance: t('imageExport.statDistance'),
      elevGain: t('imageExport.statElevGain'),
      time: t('imageExport.statTime'),
    };

    return {
      settings,
      summary,
      mapCanvas,
      projectedRouteForMap,
      routeLatLons,
      selectedPhoto: photoRef.current,
      logo: logoRef.current,
      routeColor,
      labels,
    };
  }, [settings, tracks, activeTrackId, journey, journeySegments, unitSystem, language]);

  const computeRouteBbox = useCallback((
    latLons: Array<{ lat: number; lon: number }>,
  ): RouteBboxNorm | null => {
    if (latLons.length < 2) return null;
    const { w: pw, h: ph } = getPosterSize(settings.aspectRatio);
    const routeBox: FitBox = { x: pw * 0.10, y: ph * 0.07, w: pw * 0.85, h: ph * 0.62 };
    const sampled = downsampleRoute(latLons, 300);
    const projected = fitRouteToBox(sampled, routeBox, {
      offsetX: settings.routeTransform.offsetX * pw,
      offsetY: settings.routeTransform.offsetY * ph,
      scale: settings.routeTransform.scale,
    });
    if (projected.length === 0) return null;
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const pad = pw * 0.025;
    return {
      x: Math.max(0, (Math.min(...xs) - pad) / pw),
      y: Math.max(0, (Math.min(...ys) - pad) / ph),
      w: Math.min(1, (Math.max(...xs) - Math.min(...xs) + pad * 2) / pw),
      h: Math.min(1, (Math.max(...ys) - Math.min(...ys) + pad * 2) / ph),
    };
  }, [settings.aspectRatio, settings.routeTransform]);

  const generatePreview = useCallback(async () => {
    if (tracks.length === 0) { setPreviewUrl(null); return; }
    setIsRendering(true);
    try {
      let preCapuredMapCanvas: HTMLCanvasElement | null = null;

      if (settings.template === 'map-first') {
        const map = mapGlobalRef.current;
        if (map) {
          // Copy WebGL pixels to a 2D canvas synchronously inside the render callback.
          // If tiles are still loading, wait for 'idle' first so we get a complete frame.
          preCapuredMapCanvas = await new Promise<HTMLCanvasElement | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 3000);

            const capture = () => {
              clearTimeout(timeout);
              try {
                const glCanvas = map.getCanvas();
                const offscreen = document.createElement('canvas');
                offscreen.width = glCanvas.width;
                offscreen.height = glCanvas.height;
                offscreen.getContext('2d')?.drawImage(glCanvas, 0, 0);
                resolve(offscreen);
              } catch (e) {
                console.warn('[social] map capture failed:', e);
                resolve(null);
              }
            };

            const triggerCapture = () => {
              map.once('render', capture);
              map.triggerRepaint();
            };

            // Wait for tiles if map is still loading, otherwise capture immediately
            if (map.areTilesLoaded()) {
              triggerCapture();
            } else {
              map.once('idle', triggerCapture);
            }
          });
        }
      }

      const input = buildInput(preCapuredMapCanvas);

      // Compute route bbox for photo-first interactive overlay
      if (settings.template === 'photo-first' && input.routeLatLons) {
        setRouteBboxNorm(computeRouteBbox(input.routeLatLons));
      } else {
        setRouteBboxNorm(null);
      }

      const url = renderSocialPoster(input);
      setPreviewUrl(url);
    } catch (e) {
      console.error('Social share preview failed', e);
    } finally {
      setIsRendering(false);
    }
  }, [buildInput, computeRouteBbox, settings.template, tracks.length]);

  useEffect(() => {
    void generatePreview();
  }, [
    settings.template,
    settings.aspectRatio,
    settings.selectedPictureId,
    settings.titleMode,
    settings.customTitle,
    settings.locationLabel,
    settings.showLocation,
    settings.showStats,
    settings.showElevationMiniChart,
    settings.routeTransform.scale,
    settings.routeTransform.offsetX,
    settings.routeTransform.offsetY,
    settings.routeTransform.opacity,
    tracks.length,
    photoVersion,
    generatePreview,
  ]);

  const fitTrackToMap = useCallback(() => {
    const map = mapGlobalRef.current;
    if (!map || tracks.length === 0) return;
    const pts = tracks.flatMap((t) => t.visible ? t.points : []);
    if (pts.length === 0) return;
    const lons = pts.map((p) => p.lon);
    const lats = pts.map((p) => p.lat);
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 80, maxZoom: 15, duration: 600 },
    );
  }, [tracks]);

  const exportPng = useCallback(async () => {
    if (tracks.length === 0) return;
    setIsRendering(true);
    try {
      let preCapuredMapCanvas: HTMLCanvasElement | null = null;
      if (settings.template === 'map-first') {
        const map = mapGlobalRef.current;
        if (map) {
          preCapuredMapCanvas = await new Promise<HTMLCanvasElement | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 1000);
            map.once('render', () => {
              clearTimeout(timeout);
              try {
                const glCanvas = map.getCanvas();
                const offscreen = document.createElement('canvas');
                offscreen.width = glCanvas.width;
                offscreen.height = glCanvas.height;
                offscreen.getContext('2d')?.drawImage(glCanvas, 0, 0);
                resolve(offscreen);
              } catch { resolve(null); }
            });
            map.triggerRepaint();
          });
        }
      }
      const blob = await exportSocialPosterBlob(buildInput(preCapuredMapCanvas));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trailreplay-social-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      trackEvent('social_share_exported', {
        template: settings.template,
        aspect_ratio: settings.aspectRatio,
      });
      trackSocialExportConfiguration(settings);
    } catch (e) {
      console.error('Social share export failed', e);
    } finally {
      setIsRendering(false);
    }
  }, [buildInput, settings, tracks.length]);

  // Normalized bounding box for the data panel (stats + elevation) in poster coordinates
  const dataPanelBboxNorm: RouteBboxNorm | null = (() => {
    if (!settings.showStats && !settings.showElevationMiniChart) return null;
    const isPhotoFirst = settings.template === 'photo-first';
    const elevHNorm = settings.showElevationMiniChart ? (isPhotoFirst ? 0.155 : 0.105) : 0;
    const statsHNorm = settings.showStats ? (isPhotoFirst ? 0.125 : 0.115) : 0;
    const panelH = elevHNorm + statsHNorm;
    const panelY = 1 - panelH - settings.dataPanelOffsetY;
    return { x: 0, y: Math.max(0, panelY), w: 1, h: panelH };
  })();

  return {
    previewUrl,
    isRendering,
    selectedPicture,
    generatePreview,
    exportPng,
    fitTrackToMap,
    settings,
    setSocialShareSettings,
    pictures: selectablePictures,
    hasTracks: tracks.length > 0,
    routeBboxNorm,
    dataPanelBboxNorm,
  };
}
