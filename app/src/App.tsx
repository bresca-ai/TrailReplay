import { lazy, Suspense, useEffect, useRef, useState, useCallback, useMemo, type CSSProperties } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useGPX } from '@/hooks/useGPX';
import { useUnsavedWorkGuard } from '@/hooks/useUnsavedWorkGuard';
import { usePictureRouteSync } from '@/hooks/usePictureRouteSync';
import { usePlaybackMediaPopups } from '@/hooks/usePlaybackMediaPopups';
import { useAvailableStats } from '@/hooks/useAvailableStats';
import { installFocusModalityTracking } from '@/utils/focusModality';
import { AppHeader } from '@/components/app/AppHeader';
import { AppLoadingOverlay } from '@/components/app/AppLoadingOverlay';
import { CropPreviewBars } from '@/components/app/CropPreviewBars';
import { PendingPicturePlacementBanner } from '@/components/app/PendingPicturePlacementBanner';
import { WelcomeOverlay } from '@/components/app/WelcomeOverlay';
import { PlaybackControls } from '@/components/playback/PlaybackControls';
import { PlaybackProvider } from '@/components/playback/PlaybackProvider';
import { StatsOverlay } from '@/components/stats/StatsOverlay';
import { PicturePopup } from '@/components/annotations/PicturePopup';
import { VideoPopup } from '@/components/annotations/VideoPopup';
import { sideAnnotationContent } from '@/components/annotations/sideAnnotationContent';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { getCropPreviewMetrics, type CropPreviewMetrics } from '@/utils/crop';
import { getActivePlaybackAnnotationId } from '@/utils/playbackAnnotations';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { installProbeBridge, isProbeEnabled } from '@/utils/probeBridge';
import { trackEvent } from '@/utils/analytics';
import { useI18n } from '@/i18n/useI18n';

const Sidebar = lazy(() => import('@/components/sidebar/Sidebar').then((module) => ({ default: module.Sidebar })));
const InfoPanel = lazy(() => import('@/components/info/InfoPanel').then((module) => ({ default: module.InfoPanel })));
const FeedbackSolicitation = lazy(() => import('@/components/feedback/FeedbackSolicitation').then((module) => ({ default: module.FeedbackSolicitation })));
const TrailMap = lazy(() => import('@/components/map/TrailMap').then((module) => ({ default: module.TrailMap })));

function SidebarFallback() {
  return <div className="h-full bg-[var(--canvas)]" />;
}

function isNarrowFrame(width: number, height: number) {
  return width <= height || width < 560;
}

function chooseStatsColumns(width: number, height: number, statCount: number) {
  const count = Math.max(1, statCount);
  const targetRatio = Math.max(0.1, width / Math.max(1, height));
  let bestColumns = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const gridRatio = columns / rows;
    const score = Math.abs(Math.log(targetRatio / gridRatio));
    if (score < bestScore) {
      bestScore = score;
      bestColumns = columns;
    }
  }
  return bestColumns;
}

/** How close to the frame's centre the stats box has to be to snap onto it. */
const STATS_CENTER_SNAP_PX = 8;

type StatsResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface StatsResizeStart {
  corner: StatsResizeCorner;
  mouseX: number;
  mouseY: number;
  width: number;
  height: number;
  left: number;
  top: number;
  scale: number;
}

interface StatsResizeGuide {
  corner: StatsResizeCorner;
  left: number;
  top: number;
  width: number;
  height: number;
}

function App() {
  const { t, language } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statsScaleWrapperRef = useRef<HTMLDivElement>(null);
  const statsDragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const statsResizeStartRef = useRef<StatsResizeStart | null>(null);
  const [isDraggingStats, setIsDraggingStats] = useState(false);
  const [statsDragFrame, setStatsDragFrame] = useState<{
    frameLeft: number; frameTop: number; frameWidth: number; frameHeight: number;
  } | null>(null);
  // Which centre lines the stats box is currently snapped to, so the guides
  // can say so while it is being dragged.
  const [statsCenterSnap, setStatsCenterSnap] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [isResizingStats, setIsResizingStats] = useState(false);
  const [statsResizeGuide, setStatsResizeGuide] = useState<StatsResizeGuide | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isNarrowScreen, setIsNarrowScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 900 : false
  );
  const [exportCropMetrics, setExportCropMetrics] = useState<CropPreviewMetrics | null>(null);

  const { parseFiles } = useGPX();
  // Installed once for the whole page, not per panel: the click that moves
  // focus routinely lands before the component that needs to know about it
  // exists. Keyboard shortcuts on Space and Enter depend on it.
  installFocusModalityTracking();
  useUnsavedWorkGuard();
  // Keeps photo placement on the route current when the timing mode is
  // switched after import, or when a saved project brings an older value.
  usePictureRouteSync();
  const tracks = useAppStore((state) => state.tracks);
  const showSidebar = useAppStore((state) => state.isSidebarOpen);
  const setShowSidebar = useAppStore((state) => state.setSidebarOpen);
  const exploreMode = useAppStore((state) => state.exploreMode);
  const setExploreMode = useAppStore((state) => state.setExploreMode);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const exportPictureHoldElapsedMs = useAppStore((state) => state.exportPictureHoldElapsedMs);
  const exportVideoHoldTimeSeconds = useAppStore((state) => state.exportVideoHoldTimeSeconds);
  const pendingPicturePlacements = useAppStore((state) => state.pendingPicturePlacements);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const playback = useAppStore((state) => state.playback);
  const settings = useAppStore((state) => state.settings);
  const { visibleStats: availableStats } = useAvailableStats();
  const setSettings = useAppStore((state) => state.setSettings);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const addPicture = useAppStore((state) => state.addPicture);
  const removePendingPicturePlacement = useAppStore((state) => state.removePendingPicturePlacement);
  const clearPendingPicturePlacements = useAppStore((state) => state.clearPendingPicturePlacements);
  const activePanel = useAppStore((state) => state.activePanel);
  const exportAspectRatio = useAppStore((state) => state.videoExportSettings.aspectRatio);
  const socialShareAspectRatio = useAppStore((state) => state.socialShareSettings.aspectRatio);
  const exportSubMode = useAppStore((state) => state.exportSubMode);
  const isExporting = useAppStore((state) => state.isExporting);
  const isDeterministicExport = useAppStore((state) => state.isDeterministicExport);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  // Opt-in handle for measuring a replay from outside the browser; see
  // utils/probeBridge.ts and scripts/probe-replay.mjs.
  useEffect(() => {
    if (!isProbeEnabled()) return;
    return installProbeBridge();
  }, []);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }
  }, [error, setError]);
  
  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement !== null);

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  // Toggle fullscreen. The fullscreenchange event above remains the source of truth,
  // because browsers can reject requests or exit fullscreen outside this component.
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  // Handle file input change
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      try {
        if (files && files.length > 0) {
          const importedTracks = await parseFiles(files, 'file_picker');
          setShowSidebar(true);
          if (importedTracks?.length) {
            toast.success(t('workflow.routeImported'));
          }
        }
      } catch {
        // `parseFiles` already reports a localized error through the app store.
        // Handling it here keeps the DOM event free of unhandled rejections.
      } finally {
        // Always reset so the user can retry the same file after a failed import.
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [parseFiles, setShowSidebar, t]
  );

  // Trigger file picker
  const openFilePicker = () => {
    trackEvent('file_picker_opened', { picker_location: 'welcome_overlay' });
    fileInputRef.current?.click();
  };

  const activeCropRatio = exportSubMode === 'image' ? socialShareAspectRatio : exportAspectRatio;

  useEffect(() => {
    const shouldPreviewExportFrame = activePanel === 'export' || isExporting;
    const el = mapContainerRef.current;
    if (!shouldPreviewExportFrame || !el) return;

    const update = () => {
      setExportCropMetrics(getCropPreviewMetrics(el.clientWidth, el.clientHeight, activeCropRatio));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activePanel, activeCropRatio, isExporting]);

  // Stats overlay positioning only applies to video export, not image export
  const activeExportCropMetrics = (activePanel === 'export' || isExporting) && exportSubMode !== 'image'
    ? exportCropMetrics
    : null;
  const statsShouldUseNarrowLayout = activeExportCropMetrics
    ? isNarrowFrame(activeExportCropMetrics.frameWidth, activeExportCropMetrics.frameHeight)
    : isNarrowScreen;
  const resolvedStatsLayout = settings.statsColumns !== null
    ? statsShouldUseNarrowLayout ? 'narrow' : 'default'
    : settings.statsLayout === 'auto'
    ? statsShouldUseNarrowLayout ? 'narrow' : 'default'
    : settings.statsLayout;
  const previewStatCount = Math.max(1, availableStats.length);
  const previewColumns = settings.statsColumns !== null
    ? Math.max(1, Math.min(previewStatCount, Math.round(settings.statsColumns)))
    : settings.statsLayout === 'vertical'
      ? 1
      : settings.statsLayout === 'horizontal'
        ? previewStatCount
        : statsShouldUseNarrowLayout ? Math.min(previewStatCount, 2) : Math.min(previewStatCount, 4);
  const previewColumnOptions = Array.from({ length: previewStatCount }, (_, index) => index + 1);
  const resizeGuideTargets = statsResizeGuide
    ? previewColumnOptions.map((columns) => {
      const rows = Math.ceil(previewStatCount / columns);
      const ratio = columns / rows;
      const area = statsResizeGuide.width * statsResizeGuide.height;
      const targetWidth = Math.sqrt(area * ratio);
      const targetHeight = Math.sqrt(area / ratio);
      const fromLeft = statsResizeGuide.corner.includes('left');
      const fromTop = statsResizeGuide.corner.includes('top');
      const anchorRight = statsResizeGuide.left + statsResizeGuide.width;
      const anchorBottom = statsResizeGuide.top + statsResizeGuide.height;
      const targetLeft = fromLeft ? anchorRight - targetWidth : statsResizeGuide.left;
      const targetTop = fromTop ? anchorBottom - targetHeight : statsResizeGuide.top;
      return {
        columns,
        rows,
        left: targetLeft,
        top: targetTop,
        width: targetWidth,
        height: targetHeight,
      };
    })
    : [];

  const statsOverlayStyle = (() => {
    if (settings.statsPosition) {
      const { x, y } = settings.statsPosition;
      return {
        top: `${y * 100}%`,
        left: `${x * 100}%`,
        width: 'auto',
        maxWidth: isNarrowScreen ? 'min(calc(100% - 24px), 312px)' : 'min(calc(100% - 32px), 408px)',
      } satisfies CSSProperties;
    }

    if (activeExportCropMetrics) {
      const { frameLeft, frameTop, frameWidth, frameHeight } = activeExportCropMetrics;
      const narrowFrame = isNarrowFrame(frameWidth, frameHeight);

      if (narrowFrame) {
        return {
          top: frameTop + 14,
          left: frameLeft + (frameWidth / 2),
          // Match the auto-sized wrapper used after a drag. Giving the wrapper
          // the whole frame width makes the overlay background appear too wide
          // until the first drag updates statsPosition.
          width: 'fit-content',
          maxWidth: Math.min(Math.max(frameWidth - 24, 0), 268),
          transform: 'translateX(-50%)',
        } satisfies CSSProperties;
      }

      return {
        top: frameTop + 16,
        left: frameLeft + 16,
        width: 'fit-content',
        maxWidth: Math.min(Math.max(frameWidth - 32, 0), 320),
      } satisfies CSSProperties;
    }

    if (isNarrowScreen) {
      return {
        top: 12,
        left: '50%',
        width: 'min(calc(100% - 24px), 312px)',
        transform: 'translateX(-50%)',
      } satisfies CSSProperties;
    }

    return {
      top: 16,
      left: 16,
      width: 'min(calc(100% - 32px), 408px)',
    } satisfies CSSProperties;
  })();

  const handleStatsDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = mapContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setStatsDragFrame(activeExportCropMetrics ?? {
      frameLeft: 0, frameTop: 0, frameWidth: rect.width, frameHeight: rect.height,
    });
    const pos = settings.statsPosition ?? { x: 0.02, y: 0.04 };
    statsDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, startX: pos.x, startY: pos.y };
    setIsDraggingStats(true);
  }, [activeExportCropMetrics, settings.statsPosition]);

  const handleStatsResizeStart = useCallback((e: React.MouseEvent, corner: StatsResizeCorner) => {
    e.preventDefault();
    e.stopPropagation();
    const wrapper = statsScaleWrapperRef.current;
    const container = mapContainerRef.current;
    if (!wrapper || !container) return;

    const rect = wrapper.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // Materialize the automatic starting position so resizing keeps the
    // panel's visible top-left corner stable.
    setSettings({
      statsPosition: {
        x: Math.max(0, Math.min(1, (rect.left - containerRect.left) / containerRect.width)),
        y: Math.max(0, Math.min(1, (rect.top - containerRect.top) / containerRect.height)),
      },
    });
    statsResizeStartRef.current = {
      corner,
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      scale: settings.statsScale,
    };
    setStatsResizeGuide({
      corner,
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
    });
    setIsResizingStats(true);
  }, [setSettings, settings.statsScale]);

  useEffect(() => {
    if (!isDraggingStats) return;
    const onMove = (e: MouseEvent) => {
      const container = mapContainerRef.current;
      if (!container || !statsDragStartRef.current) return;
      const rect = container.getBoundingClientRect();
      const dx = (e.clientX - statsDragStartRef.current.mouseX) / rect.width;
      const dy = (e.clientY - statsDragStartRef.current.mouseY) / rect.height;
      let x = Math.max(0, Math.min(0.92, statsDragStartRef.current.startX + dx));
      let y = Math.max(0, Math.min(0.92, statsDragStartRef.current.startY + dy));

      // Centring the stats by eye is guesswork, and in the export it is
      // guesswork against a frame whose edges are not the window's. The box
      // therefore snaps to the centre of the *exported* frame when it comes
      // close, and the guides below show which axis caught.
      const box = statsScaleWrapperRef.current?.getBoundingClientRect();
      let snappedX = false;
      let snappedY = false;
      if (box) {
        const frame = activeExportCropMetrics ?? {
          frameLeft: 0, frameTop: 0, frameWidth: rect.width, frameHeight: rect.height,
        };
        const targetLeft = frame.frameLeft + (frame.frameWidth - box.width) / 2;
        const targetTop = frame.frameTop + (frame.frameHeight - box.height) / 2;
        if (Math.abs(x * rect.width - targetLeft) <= STATS_CENTER_SNAP_PX) {
          x = targetLeft / rect.width;
          snappedX = true;
        }
        if (Math.abs(y * rect.height - targetTop) <= STATS_CENTER_SNAP_PX) {
          y = targetTop / rect.height;
          snappedY = true;
        }
      }

      setStatsCenterSnap((current) => (
        current.x === snappedX && current.y === snappedY ? current : { x: snappedX, y: snappedY }
      ));
      setSettings({ statsPosition: { x, y } });
    };
    const onUp = () => {
      setIsDraggingStats(false);
      setStatsDragFrame(null);
      setStatsCenterSnap({ x: false, y: false });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [activeExportCropMetrics, isDraggingStats, setSettings]);

  useEffect(() => {
    if (!isResizingStats) return;
    const onMove = (e: MouseEvent) => {
      const container = mapContainerRef.current;
      const start = statsResizeStartRef.current;
      if (!container || !start) return;

      const containerRect = container.getBoundingClientRect();
      const dx = e.clientX - start.mouseX;
      const dy = e.clientY - start.mouseY;
      const fromLeft = start.corner.includes('left');
      const fromTop = start.corner.includes('top');
      const width = Math.max(72, start.width + (fromLeft ? -dx : dx));
      const height = Math.max(52, start.height + (fromTop ? -dy : dy));
      const areaRatio = (width * height) / Math.max(1, start.width * start.height);
      const scale = Math.max(0.6, Math.min(8, start.scale * Math.sqrt(areaRatio)));
      const columns = chooseStatsColumns(width, height, availableStats.length);
      const left = fromLeft ? start.left + start.width - width : start.left;
      const top = fromTop ? start.top + start.height - height : start.top;

      setSettings({
        statsScale: Math.round(scale * 100) / 100,
        statsLayout: 'auto',
        statsColumns: columns,
        statsPosition: {
          x: Math.max(0, Math.min(0.98, left / containerRect.width)),
          y: Math.max(0, Math.min(0.98, top / containerRect.height)),
        },
      });
    };
    const onUp = () => {
      statsResizeStartRef.current = null;
      setStatsResizeGuide(null);
      setIsResizingStats(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [availableStats.length, isResizingStats, setSettings]);

  const { activePicture, activeVideo, closeActivePicture, closeActiveVideo } = usePlaybackMediaPopups();

  const activeTextAnnotationId = useMemo(() => getActivePlaybackAnnotationId({
    annotations: textAnnotations,
    currentTime: playback.currentTime,
    totalDuration: playback.totalDuration,
    phase: animationPhase,
  }), [animationPhase, playback.currentTime, playback.totalDuration, textAnnotations]);
  const activeSideAnnotation = textAnnotations.find((annotation) =>
    annotation.id === activeTextAnnotationId && annotation.presentation === 'side-panel');
  const localizedSideAnnotation = activeSideAnnotation ? localizedAnnotation(activeSideAnnotation, language) : null;
  const sideAnnotationCopy = localizedSideAnnotation ? sideAnnotationContent(localizedSideAnnotation) : null;
  const sideAnnotationNarrowFrame = activeExportCropMetrics
    ? isNarrowFrame(activeExportCropMetrics.frameWidth, activeExportCropMetrics.frameHeight)
    : false;
  const sideAnnotationBottom = settings.showElevationProfile
    ? sideAnnotationNarrowFrame ? 110 : 88
    : 24;
  const sideAnnotationStyle: (CSSProperties & { '--annotation-accent'?: string }) | undefined = activeSideAnnotation ? {
    '--annotation-accent': activeSideAnnotation.color,
    bottom: (activeExportCropMetrics?.bottom ?? 0) + sideAnnotationBottom,
    ...(activeExportCropMetrics && sideAnnotationNarrowFrame
      ? {
          right: 'auto',
          left: activeExportCropMetrics.frameLeft + activeExportCropMetrics.frameWidth / 2,
          width: Math.min(activeExportCropMetrics.frameWidth - 32, 420),
          transform: 'translateX(-50%)',
        }
      : activeExportCropMetrics
        ? {
            right: activeExportCropMetrics.right + Math.max(20, activeExportCropMetrics.frameWidth * 0.045),
            width: Math.min(420, activeExportCropMetrics.frameWidth * 0.42),
          }
        : {}),
  } : undefined;
  const activePendingPicturePlacement = pendingPicturePlacements[0];
  
  const hasTracks = tracks.length > 0;

  useEffect(() => {
    const updateViewport = () => {
      setIsNarrowScreen(window.innerWidth < 900);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);
  
  return (
    <PlaybackProvider>
      <div className="app-container h-screen bg-[var(--canvas)] flex flex-col overflow-hidden">
        <AppHeader
          isFullscreen={isFullscreen}
          showInfoPanel={showInfoPanel}
          showSidebar={showSidebar}
          onToggleFullscreen={toggleFullscreen}
          onToggleInfoPanel={() => setShowInfoPanel(!showInfoPanel)}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
        />
        
        {/* Main Content */}
        <main className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          {showSidebar && (
            <div className="w-80 h-full flex-shrink-0 border-r-2 border-[var(--evergreen)] overflow-hidden">
              <Suspense fallback={<SidebarFallback />}>
                <Sidebar />
              </Suspense>
            </div>
          )}
          
          {/* Map Area */}
          <div className="flex-1 flex flex-col relative">
            {/* Map Container */}
            <div
              id="map-capture-container"
              ref={mapContainerRef}
              className="flex-1 relative"
            >
              <Suspense fallback={<AppLoadingOverlay />}>
                <TrailMap
                  activeTextAnnotationId={activeTextAnnotationId}
                  mapContainerRef={mapContainerRef}
                  onReadyChange={setIsMapReady}
                  exportFrame={activeExportCropMetrics}
                />
              </Suspense>

              {activeSideAnnotation && sideAnnotationCopy && (
                <div className="tr-annotation-side-panel pointer-events-none absolute z-30" style={sideAnnotationStyle}>
                  <div className="tr-annotation-side-panel__header">
                    <div className="tr-annotation-side-panel__logo" aria-hidden="true">{activeSideAnnotation.logo || '●'}</div>
                    <div className="tr-annotation-side-panel__identity">
                      <span className="tr-annotation-side-panel__eyebrow">{t('annotations.sidePanelEyebrow')}</span>
                      {sideAnnotationCopy.code && <span className="tr-annotation-side-panel__code">{sideAnnotationCopy.code}</span>}
                    </div>
                    <span className="tr-annotation-side-panel__dash" aria-hidden="true" />
                  </div>
                  <h2 className="tr-annotation-side-panel__title">{sideAnnotationCopy.title}</h2>
                  {sideAnnotationCopy.meta && <p className="tr-annotation-side-panel__meta">{sideAnnotationCopy.meta}</p>}
                  {sideAnnotationCopy.description && (
                    <div className="tr-annotation-side-panel__details">
                      <p>{sideAnnotationCopy.description}</p>
                    </div>
                  )}
                </div>
              )}

              {!isMapReady && <AppLoadingOverlay />}

              {/* Aspect ratio crop preview when in Export panel */}
              {activePanel === 'export' && (
                <CropPreviewBars ratio={activeCropRatio} containerRef={mapContainerRef} />
              )}

              {/* Stats Overlay */}
              {hasTracks && (
                <div
                  className="group absolute z-10"
                  style={{
                    ...statsOverlayStyle,
                    cursor: isDraggingStats ? 'grabbing' : isResizingStats ? 'default' : 'grab',
                    userSelect: 'none',
                  }}
                  onMouseDown={handleStatsDragStart}
                >
                  <div
                    ref={statsScaleWrapperRef}
                    data-stats-scale-wrapper
                    style={{
                      position: 'relative',
                      width: 'fit-content',
                      transform: `scale(${settings.statsScale})`,
                      outline: isResizingStats ? '1px dashed rgba(255,255,255,0.8)' : undefined,
                      outlineOffset: isResizingStats ? '4px' : undefined,
                      transformOrigin: settings.statsPosition || !statsShouldUseNarrowLayout
                        ? 'top left'
                        : 'top center',
                    }}
                  >
                    {isResizingStats && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 top-[-42px] z-30 flex w-max max-w-[min(90vw,520px)] gap-1 rounded-lg border border-white/20 bg-[rgba(9,14,19,0.94)] p-1 shadow-lg"
                      >
                        {previewColumnOptions.map((columns) => {
                          const rows = Math.ceil(previewStatCount / columns);
                          const active = columns === previewColumns;
                          return (
                            <div
                              key={columns}
                              className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                                active ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-white/65'
                              }`}
                            >
                              {columns} × {rows}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <StatsOverlay
                      layout={resolvedStatsLayout}
                      variant={activeExportCropMetrics ? 'export' : 'default'}
                    />
                    {!isExporting && (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => {
                      const vertical = corner.startsWith('top') ? 'top-[-5px]' : 'bottom-[-5px]';
                      const horizontal = corner.endsWith('left') ? 'left-[-5px]' : 'right-[-5px]';
                      const cursor = corner === 'top-left' || corner === 'bottom-right'
                        ? 'cursor-nwse-resize'
                        : 'cursor-nesw-resize';
                      return (
                        <button
                          key={corner}
                          type="button"
                          aria-label="Resize stats"
                          className={`absolute ${vertical} ${horizontal} ${cursor} z-20 h-3 w-3 rounded-full border-2 border-white bg-[var(--evergreen)] shadow-md transition-opacity ${
                            isResizingStats ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          // Refs are read by the handler on mouse-down, never during render.
                          // eslint-disable-next-line react-hooks/refs
                          onMouseDown={(event) => handleStatsResizeStart(event, corner)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {isDraggingStats && statsDragFrame && (() => {
                const centerX = statsDragFrame.frameLeft + statsDragFrame.frameWidth / 2;
                const centerY = statsDragFrame.frameTop + statsDragFrame.frameHeight / 2;
                return (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
                    <div
                      className={`absolute w-px ${statsCenterSnap.x ? 'bg-[var(--trail-orange)]' : 'bg-white/35'}`}
                      style={{ left: centerX, top: statsDragFrame.frameTop, height: statsDragFrame.frameHeight }}
                    />
                    <div
                      className={`absolute h-px ${statsCenterSnap.y ? 'bg-[var(--trail-orange)]' : 'bg-white/35'}`}
                      style={{ top: centerY, left: statsDragFrame.frameLeft, width: statsDragFrame.frameWidth }}
                    />
                  </div>
                );
              })()}

              {isResizingStats && statsResizeGuide && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
                  {resizeGuideTargets.map((target) => (
                    <div
                      key={`${target.columns}-${target.rows}`}
                      className={`absolute flex items-center justify-center rounded-lg border-2 border-dashed text-[10px] font-semibold uppercase tracking-wide shadow-lg transition-colors ${
                        target.columns === previewColumns
                          ? 'border-[var(--evergreen)] bg-[var(--evergreen)]/20 text-white'
                          : 'border-white/30 bg-white/[0.03] text-white/65'
                      }`}
                      style={{
                        left: target.left,
                        top: target.top,
                        width: target.width,
                        height: target.height,
                      }}
                    >
                      {target.columns} × {target.rows}
                    </div>
                  ))}
                </div>
              )}

              {activePendingPicturePlacement && (
                <PendingPicturePlacementBanner
                  pendingPlacement={activePendingPicturePlacement}
                  totalPendingPlacements={pendingPicturePlacements.length}
                  onCancelAll={clearPendingPicturePlacements}
                  onSkip={() => removePendingPicturePlacement(activePendingPicturePlacement.id)}
                  onUseTimestamp={activePendingPicturePlacement.timestampAlternative
                    ? () => {
                        const timestampPlacement = activePendingPicturePlacement.timestampAlternative;
                        if (!timestampPlacement) {
                          return;
                        }

                        addPicture({
                          id: activePendingPicturePlacement.id,
                          file: activePendingPicturePlacement.file,
                          displayFile: activePendingPicturePlacement.displayFile,
                          url: activePendingPicturePlacement.url,
                          isPlaceholder: false,
                          lat: timestampPlacement.lat,
                          lon: timestampPlacement.lon,
                          timestamp: activePendingPicturePlacement.timestamp,
                          progress: timestampPlacement.progress,
                          position: timestampPlacement.progress,
                          routeDistance: timestampPlacement.routeDistance,
                          routeSegmentId: timestampPlacement.routeSegmentId,
                          routeSegmentDistance: timestampPlacement.routeSegmentDistance,
                          placementSource: 'timestamp',
                          title: activePendingPicturePlacement.title,
                          description: activePendingPicturePlacement.description,
                          displayDuration: activePendingPicturePlacement.displayDuration,
                        });
                        removePendingPicturePlacement(activePendingPicturePlacement.id);
                      }
                    : undefined}
                />
              )}
              
              {/* Picture Popup */}
              {activePicture && settings.showPictures && (
                <PicturePopup 
                  key={activePicture.id}
                  picture={activePicture} 
                  onClose={closeActivePicture}
                  exportFrame={activeExportCropMetrics}
                  playbackCurrentTime={isDeterministicExport ? (exportPictureHoldElapsedMs ?? playback.currentTime) : undefined}
                />
              )}
              
              {/* Video Popup */}
              {activeVideo && (
                <VideoPopup
                  key={activeVideo.id}
                  video={activeVideo}
                  onClose={closeActiveVideo}
                  exportFrame={activeExportCropMetrics}
                  exportCurrentTimeSeconds={isDeterministicExport ? exportVideoHoldTimeSeconds : undefined}
                />
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".gpx,.kml,.fit,.replay,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/json"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />

              {/* No tracks message */}
              {isMapReady && !hasTracks && !exploreMode && !isNarrowScreen && (
                <WelcomeOverlay
                  onOpenFilePicker={openFilePicker}
                  onExplore={() => {
                    setExploreMode(true);
                    setShowSidebar(false);
                  }}
                />
              )}

              {/* Feedback Solicitation */}
              {hasTracks && (
                <Suspense fallback={null}>
                  <FeedbackSolicitation />
                </Suspense>
              )}
            </div>
            
            {/* Playback Controls */}
            {hasTracks && (
              <div className="h-20 bg-[var(--canvas)] border-t-2 border-[var(--evergreen)]">
                <PlaybackControls />
              </div>
            )}
          </div>

          {/* Info Panel (Right Side) */}
          {showInfoPanel && (
            <div className="w-80 h-full flex-shrink-0 overflow-hidden">
              <Suspense fallback={<SidebarFallback />}>
                <InfoPanel onClose={() => setShowInfoPanel(false)} />
              </Suspense>
            </div>
          )}
        </main>
        
        <Toaster 
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--canvas)',
              border: '2px solid var(--evergreen)',
              fontFamily: 'var(--font-family-primary)',
            },
          }}
        />
      </div>
    </PlaybackProvider>
  );
}

export default App;
