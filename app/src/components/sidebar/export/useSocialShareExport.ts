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
import {
  downsampleRoute,
  fitRouteToBox,
  getMapFirstFitPadding,
  getMapFirstRouteSafeArea,
  getMapPanTargetPoint,
  getMapZoomForScale,
  getRouteBboxNorm,
} from './socialShareRouteFit';
import { overlayCanvasFontFamily } from '@/utils/typography';
import { captureSocialMap } from './captureSocialMap';
import { getSocialShareLogoBox, loadSocialShareLogo } from './socialShareBrand';
import { loadPosterAssets } from './socialShareMedia';
import { getSplitMapBox } from './socialShareSplit';

const BRAND_ORANGE = '#C1652F';

export interface RouteBboxNorm {
  x: number; y: number; w: number; h: number;
}

export type MapRouteGesture =
  | { type: 'move'; deltaX: number; deltaY: number }
  | { type: 'resize'; scaleFactor: number; anchorX: number; anchorY: number };

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
  const overlayFont = useAppStore((s) => s.settings.trailStyle.overlayFont);
  const mapStyle = useAppStore((s) => s.settings.mapStyle);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoReadyId, setPhotoReadyId] = useState<string | null>(null);
  const [routeBboxNorm, setRouteBboxNorm] = useState<RouteBboxNorm | null>(null);

  const photoRef = useRef<HTMLImageElement | null>(null);
  const photoIdRef = useRef<string | null>(null);
  const lastMapFirstFitKeyRef = useRef<string | null>(null);

  const selectablePictures = pictures.filter((p) => !p.isPlaceholder);
  const selectedPicture = selectablePictures.find((p) => p.id === settings.selectedPictureId) ?? null;
  const photoFirstSlotUrl = settings.template === 'photo-first' ? settings.photoSlots?.[0]?.imageUrl : null;
  const selectedPhotoUrl = photoFirstSlotUrl ?? selectedPicture?.url ?? null;
  const selectedPhotoId = photoFirstSlotUrl ?? selectedPicture?.id ?? null;

  useEffect(() => {
    if (!selectedPhotoUrl || !selectedPhotoId) {
      photoRef.current = null;
      photoIdRef.current = null;
      setPhotoReadyId(null);
      setPhotoVersion((v) => v + 1);
      return;
    }
    if (photoIdRef.current === selectedPhotoId && photoRef.current) return;

    photoRef.current = null;
    photoIdRef.current = null;
    setPhotoReadyId(null);

    const img = new Image();
    let cancelled = false;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      photoRef.current = img;
      photoIdRef.current = selectedPhotoId;
      setPhotoReadyId(selectedPhotoId);
      setPhotoVersion((v) => v + 1);
    };
    img.onerror = () => { if (!cancelled) setPhotoVersion((v) => v + 1); };
    img.src = selectedPhotoUrl;
    return () => { cancelled = true; };
  }, [selectedPhotoId, selectedPhotoUrl]);

  const buildInput = useCallback((brandLogo: HTMLImageElement, assets: Awaited<ReturnType<typeof loadPosterAssets>>, preCapuredMapCanvas: HTMLCanvasElement | null = null): RenderInput => {
    const summary = buildSocialShareSummary(
      settings, tracks, activeTrackId, journey, journeySegments, unitSystem,
    );

    let mapCanvas: HTMLCanvasElement | null = null;
    let projectedRouteForMap: CanvasPoint[] | null = null;
    let routeLatLons: Array<{ lat: number; lon: number }> | null = null;

    if (settings.template !== 'photo-first') {
      // Use the pre-captured 2D snapshot — raw WebGL canvas is passed here only as a fallback
      mapCanvas = preCapuredMapCanvas;

      const map = mapGlobalRef.current;
      const container = document.getElementById('map-capture-container');
      if (map && container && tracks.length > 0) {
        const { w: posterW, h: posterH } = getPosterSize(settings.aspectRatio);
        const rect = container.getBoundingClientRect();
        const splitBox = settings.template === 'split' ? getSplitMapBox(posterW, posterH, settings.splitMapFrame) : null;
        const { cropX, cropY, cropW, cropH } = getCropRegion(rect, splitBox?.w ?? posterW, splitBox?.h ?? posterH);
        const pts: CanvasPoint[] = [];
        for (const track of tracks) {
          if (!track.visible) continue;
          const step = Math.max(1, Math.floor(track.points.length / 300));
          for (let i = 0; i < track.points.length; i += step) {
            const pt = track.points[i];
            const sp = map.project([pt.lon, pt.lat]);
            pts.push({
              x: (sp.x - cropX) / cropW * (splitBox?.w ?? posterW) + (splitBox?.x ?? 0),
              y: (sp.y - cropY) / cropH * (splitBox?.h ?? posterH) + (splitBox?.y ?? 0),
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
      elevationGain: t('imageExport.statElevGain'),
      duration: t('imageExport.statTime'),
      movingDuration: t('stats.movingDuration'),
      pace: t('stats.avgPace'),
      heartRate: t('stats.heartRateShort'),
      speed: t('imageExport.statAvgSpeed'),
      altitude: t('stats.altitude'),
      maxElevation: t('imageExport.statMaxElevation'),
      elevationLoss: t('imageExport.statElevationLoss'),
      maxSpeed: t('imageExport.statMaxSpeed'),
    };

    return {
      settings,
      summary,
      mapCanvas,
      projectedRouteForMap,
      routeLatLons,
      selectedPhoto: photoRef.current,
      fontFamily: overlayCanvasFontFamily(overlayFont),
      brandLogo,
      ...assets,
      routeColor,
      labels,
    };
  }, [settings, tracks, activeTrackId, journey, journeySegments, unitSystem, language, overlayFont]);

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
    return getRouteBboxNorm(projected, pw, ph, pw * 0.025);
  }, [settings.aspectRatio, settings.routeTransform]);

  const generatePreview = useCallback(async (options: { fitMapFirstRoute?: boolean; fastMapCapture?: boolean } = {}) => {
    if (tracks.length === 0) { setPreviewUrl(null); return; }
    setIsRendering(true);
    try {
      let preCapuredMapCanvas: HTMLCanvasElement | null = null;

      if (settings.template !== 'photo-first') {
        const map = mapGlobalRef.current;
        if (map) {
          const container = document.getElementById('map-capture-container');
          const visibleTracks = tracks.filter((track) => track.visible && track.points.length > 0);
          const visibleStatCount = Math.min(4, settings.stats?.filter((stat) => stat.visible).length ?? 3);
          const statsRows = visibleStatCount > 0 ? Math.ceil(visibleStatCount / (settings.statsLayout ?? 3)) : 0;
          const fitKey = [
            settings.template,
            settings.aspectRatio,
            settings.showLocation,
            settings.showStats,
            statsRows,
            settings.showElevationMiniChart,
            ...visibleTracks.map((track) => `${track.id}:${track.points.length}`),
          ].join('|');

          if (options.fitMapFirstRoute && container && visibleTracks.length > 0
            && lastMapFirstFitKeyRef.current !== fitKey) {
            const { w: posterW, h: posterH } = getPosterSize(settings.aspectRatio);
            const rect = container.getBoundingClientRect();
            const splitBox = settings.template === 'split' ? getSplitMapBox(posterW, posterH, settings.splitMapFrame) : null;
            const crop = getCropRegion(rect, splitBox?.w ?? posterW, splitBox?.h ?? posterH);
            const safeArea = splitBox
              ? { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }
              : getMapFirstRouteSafeArea({
                posterWidth: posterW,
                posterHeight: posterH,
                showLocation: settings.showLocation,
                showStats: settings.showStats && visibleStatCount > 0,
                statsRows,
                showElevation: settings.showElevationMiniChart,
              });
            const padding = getMapFirstFitPadding(rect.width, rect.height, crop, safeArea);
            let minLon = Infinity;
            let maxLon = -Infinity;
            let minLat = Infinity;
            let maxLat = -Infinity;
            for (const track of visibleTracks) {
              for (const point of track.points) {
                minLon = Math.min(minLon, point.lon);
                maxLon = Math.max(maxLon, point.lon);
                minLat = Math.min(minLat, point.lat);
                maxLat = Math.max(maxLat, point.lat);
              }
            }
            map.fitBounds(
              [[minLon, minLat], [maxLon, maxLat]],
              {
                padding,
                duration: 0,
                maxZoom: 15,
                bearing: map.getBearing(),
                pitch: map.getPitch(),
              },
            );
            lastMapFirstFitKeyRef.current = fitKey;
          }

          preCapuredMapCanvas = await captureSocialMap(map, {
            routeGlow: settings.template === 'split' ? false : settings.routeGlow,
            routeOpacity: settings.routeTransform.opacity,
            highlightRoute: settings.template === 'map-first' && settings.layoutPreset === 'classic',
            waitForTiles: !options.fastMapCapture,
          });
        }
      }

      const [, brandLogo, assets] = await Promise.all([
        document.fonts.load(`400 48px ${overlayCanvasFontFamily(overlayFont)}`),
        loadSocialShareLogo(),
        loadPosterAssets(settings),
      ]);
      const input = buildInput(brandLogo, assets, preCapuredMapCanvas);

      // Compute the same route bounds used by the renderer for either template.
      if (settings.template === 'split') {
        const { w, h } = getPosterSize(settings.aspectRatio);
        const box = getSplitMapBox(w, h, settings.splitMapFrame);
        setRouteBboxNorm({ x: box.x / w, y: box.y / h, w: box.w / w, h: box.h / h });
      } else if (settings.template === 'photo-first' && input.routeLatLons) {
        setRouteBboxNorm(computeRouteBbox(input.routeLatLons));
      } else if (input.projectedRouteForMap) {
        const { w, h } = getPosterSize(settings.aspectRatio);
        setRouteBboxNorm(getRouteBboxNorm(input.projectedRouteForMap, w, h, w * 0.025));
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
  }, [
    buildInput,
    computeRouteBbox,
    tracks,
    overlayFont,
    settings,
  ]);

  const transformMapViewport = useCallback(async (gesture: MapRouteGesture) => {
    const map = mapGlobalRef.current;
    const container = document.getElementById('map-capture-container');
    if (!map || !container) return;

    const { w: posterW, h: posterH } = getPosterSize(settings.aspectRatio);
    const rect = container.getBoundingClientRect();
    const splitBox = settings.template === 'split' ? getSplitMapBox(posterW, posterH, settings.splitMapFrame) : null;
    const { cropX, cropY, cropW, cropH } = getCropRegion(rect, splitBox?.w ?? posterW, splitBox?.h ?? posterH);

    if (gesture.type === 'move') {
      const centerPoint = map.project(map.getCenter());
      const target = getMapPanTargetPoint(centerPoint, gesture.deltaX, gesture.deltaY, cropW, cropH);
      const center = map.unproject([target.x, target.y]);
      map.jumpTo({ center });
    } else {
      const anchor = map.unproject([
        cropX + gesture.anchorX * cropW,
        cropY + gesture.anchorY * cropH,
      ]);
      const zoom = getMapZoomForScale(
        map.getZoom(), gesture.scaleFactor, map.getMinZoom(), map.getMaxZoom(),
      );
      map.zoomTo(zoom, { around: anchor, duration: 0 });
    }

    await generatePreview();
  }, [generatePreview, settings.aspectRatio, settings.splitMapFrame, settings.template]);

  useEffect(() => {
    const render = () => void generatePreview({ fitMapFirstRoute: settings.template !== 'photo-first' });
    if (settings.template === 'photo-first' || mapGlobalRef.current) {
      render();
      return;
    }
    // A recipe can open Export before MapLibre finishes mounting. Wait for its
    // canvas so an automatic video cover never captures the fallback background.
    const timer = window.setInterval(() => {
      if (!mapGlobalRef.current) return;
      window.clearInterval(timer);
      render();
    }, 150);
    return () => window.clearInterval(timer);
  }, [
    settings.template,
    settings.aspectRatio,
    settings.selectedPictureId,
    settings.titleMode,
    settings.customTitle,
    settings.titleOffsetX,
    settings.titleOffsetY,
    settings.logoPositionX,
    settings.logoPositionY,
    settings.locationLabel,
    settings.showLocation,
    settings.showStats,
    settings.showElevationMiniChart,
    settings.routeTransform.scale,
    settings.routeTransform.offsetX,
    settings.routeTransform.offsetY,
    settings.routeTransform.opacity,
    settings.routeGlow,
    mapStyle,
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
    let padding: number | { top: number; right: number; bottom: number; left: number } = 80;
    if (settings.template === 'split') {
      const container = document.getElementById('map-capture-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        const { w, h } = getPosterSize(settings.aspectRatio);
        const box = getSplitMapBox(w, h, settings.splitMapFrame);
        const crop = getCropRegion(rect, box.w, box.h);
        padding = getMapFirstFitPadding(rect.width, rect.height, crop, { x: 0.08, y: 0.08, w: 0.84, h: 0.84 });
      }
    }
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding, maxZoom: 15, duration: 600 },
    );
  }, [settings.aspectRatio, settings.splitMapFrame, settings.template, tracks]);

  const exportPng = useCallback(async () => {
    if (tracks.length === 0) return;
    setIsRendering(true);
    try {
      let preCapuredMapCanvas: HTMLCanvasElement | null = null;
      if (settings.template !== 'photo-first') {
        const map = mapGlobalRef.current;
        if (map) {
          preCapuredMapCanvas = await captureSocialMap(map, {
            routeGlow: settings.template === 'split' ? false : settings.routeGlow,
            routeOpacity: settings.routeTransform.opacity,
            highlightRoute: settings.template === 'map-first' && settings.layoutPreset === 'classic',
          });
        }
      }
      const [, brandLogo, assets] = await Promise.all([
        document.fonts.load(`400 48px ${overlayCanvasFontFamily(overlayFont)}`),
        loadSocialShareLogo(),
        loadPosterAssets(settings),
      ]);
      const blob = await exportSocialPosterBlob(buildInput(brandLogo, assets, preCapuredMapCanvas));
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
  }, [buildInput, overlayFont, settings, tracks.length]);

  // Normalized box for direct manipulation of stats (or elevation when stats are hidden).
  const dataPanelBboxNorm: RouteBboxNorm | null = (() => {
    if (!settings.showStats && !settings.showElevationMiniChart) return null;
    const visibleStatCount = Math.min(4, settings.stats?.filter((stat) => stat.visible).length ?? 3);
    if (settings.showStats && visibleStatCount > 0 && settings.statsFrame) return settings.statsFrame;
    if (settings.template === 'split') {
      const rows = Math.ceil(visibleStatCount / Math.max(1, settings.statsLayout));
      const wide = settings.aspectRatio === '16:9';
      return settings.showStats && rows > 0 ? { x: 0.045, y: (wide ? 0.88 : 0.905) - settings.dataPanelOffsetY, w: 0.91, h: (wide ? 0.11 : 0.09) * rows } : null;
    }
    const isPhotoFirst = settings.template === 'photo-first';
    const elevHNorm = settings.showElevationMiniChart ? (isPhotoFirst ? 0.155 : 0.105) : 0;
    const statsRows = visibleStatCount > 0 ? Math.ceil(visibleStatCount / (settings.statsLayout ?? 3)) : 0;
    const statsHNorm = settings.showStats ? (isPhotoFirst ? 0.125 : 0.115) * statsRows : 0;
    if (statsHNorm > 0) return { x: 0, y: Math.max(0, 1 - elevHNorm - statsHNorm - settings.dataPanelOffsetY), w: 1, h: statsHNorm };
    return elevHNorm > 0 ? { x: 0, y: Math.max(0, 1 - elevHNorm - settings.dataPanelOffsetY), w: 1, h: elevHNorm } : null;
  })();

  const titleBboxNorm: RouteBboxNorm = (() => {
    const { w, h } = getPosterSize(settings.aspectRatio);
    const pad = Math.round(w * 0.04);
    const titleSize = Math.round((settings.template === 'split'
      ? Math.min(w * 0.095, h * 0.095)
      : settings.template === 'map-first'
      ? Math.min(w * 0.09, Math.max(h * 0.05, w * 0.055))
      : h * 0.072) * (settings.titleScale ?? 1));
    const baseY = settings.template === 'split' ? h * 0.85 : pad + Math.round(h * (settings.template === 'map-first' ? 0.010 : 0.018)) + titleSize;
    const lines = settings.titleMode === 'custom' ? Math.min(5, settings.customTitle.split('\n').length) : 2;
    const top = baseY - titleSize * 0.85 + settings.titleOffsetY * h;
    return {
      x: Math.max(0, pad / w + settings.titleOffsetX),
      y: Math.max(0, top / h),
      w: Math.min(0.96, settings.titleWidth ?? 0.74),
      h: Math.min(0.9, Math.max(0.08, titleSize * lines * 1.05 / h)),
    };
  })();

  const logoBboxNorm: RouteBboxNorm = (() => {
    const { w, h } = getPosterSize(settings.aspectRatio);
    const box = getSocialShareLogoBox(settings, w, h);
    return { x: box.x / w, y: box.y / h, w: box.w / w, h: box.h / h };
  })();

  return {
    previewUrl,
    isRendering,
    selectedPicture,
    selectedPhotoReady: !!selectedPhotoId && photoReadyId === selectedPhotoId,
    generatePreview,
    exportPng,
    fitTrackToMap,
    settings,
    setSocialShareSettings,
    pictures: selectablePictures,
    hasTracks: tracks.length > 0,
    routeBboxNorm,
    dataPanelBboxNorm,
    transformMapViewport,
    titleBboxNorm,
    logoBboxNorm,
  };
}
