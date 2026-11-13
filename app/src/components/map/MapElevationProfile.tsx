import { useMemo, useRef } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/store/useAppStore';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { convertElevation, formatDistance, formatElevation } from '@/utils/units';
import type { CropPreviewMetrics } from '@/utils/crop';
import { getDynamicElevationViewport } from './dynamicElevationViewport';
import { getElevationAtProgress } from './elevationProfile';
import { detectElevationFocusSections } from './elevationSections';
import { ElevationSectionEditor } from './ElevationSectionEditor';
import { ElevationProfileChart } from './ElevationProfileChart';
import { ElevationProfileLabels } from './ElevationProfileLabels';
import { buildElevationProfileGeometry } from './elevationProfileGeometry';
import { applyElevationSectionOverrides } from './elevationSectionOverrides';
import { useElevationSectionEditing } from './useElevationSectionEditing';

interface MapElevationProfileProps {
  className?: string;
  exportFrame?: CropPreviewMetrics | null;
}

export function MapElevationProfile({ className = '', exportFrame = null }: MapElevationProfileProps) {
  const { t } = useI18n();
  const resizeStart = useRef<{ y: number; height: number } | null>(null);
  const playback = useAppStore((state) => state.playback);
  const settings = useAppStore((state) => state.settings);
  const trailStyle = useAppStore((state) => state.settings.trailStyle);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const tracks = useAppStore((state) => state.tracks);
  const isExporting = useAppStore((state) => state.isExporting);
  const activePanel = useAppStore((state) => state.activePanel);
  const videoExportSettings = useAppStore((state) => state.videoExportSettings);
  const setSettings = useAppStore((state) => state.setSettings);
  const exportAspectRatio = videoExportSettings.aspectRatio;

  // Use computed journey for multi-track support
  const {
    elevationData,
    segmentTimings,
    currentTrackColor,
    isInTransport,
    currentSegment,
    routeTimingMode,
  } = useComputedJourney();

  const dynamicSections = settings.dynamicElevationProfile && !settings.elevationProfilePerRoute;

  const segmentProgressRange = (timing: typeof segmentTimings[number]) => ({
    start: routeTimingMode === 'uniform' ? timing.distanceStartRatio : timing.progressStartRatio,
    end: routeTimingMode === 'uniform' ? timing.distanceEndRatio : timing.progressEndRatio,
  });

  const profileData = useMemo(
    () => buildElevationProfileGeometry(
      elevationData,
      segmentTimings,
      trailStyle.trailColor,
      tracks,
    ),
    [elevationData, segmentTimings, trailStyle.trailColor, tracks],
  );

  // Keep the preceding route visible during a connection; before the first
  // route, show the first available route.
  const routeTiming = settings.elevationProfilePerRoute
    ? (currentSegment?.segment.type === 'track' ? currentSegment.segment :
      [...segmentTimings].reverse().find((timing) => timing.type === 'track' && segmentProgressRange(timing).start <= playback.progress)
        ?? segmentTimings.find((timing) => timing.type === 'track'))
    : undefined;

  const detectedFocusSections = useMemo(
    () => dynamicSections
      ? detectElevationFocusSections(elevationData)
      : [],
    [elevationData, dynamicSections],
  );
  const focusSections = useMemo(
    () => applyElevationSectionOverrides(
      detectedFocusSections,
      settings.elevationSectionOverrides,
      elevationData,
      settings.customElevationSections,
      settings.hiddenElevationSectionIds,
    ),
    [
      detectedFocusSections,
      elevationData,
      settings.customElevationSections,
      settings.elevationSectionOverrides,
      settings.hiddenElevationSectionIds,
    ],
  );
  const {
    addSection,
    changeSectionBoundary,
    removeSection,
  } = useElevationSectionEditing({
    detectedSections: detectedFocusSections,
    elevationData,
    settings,
    setSettings,
  });
  const isExportPreview = isExporting || activePanel === 'export';
  const isEditingSections = dynamicSections
    && !playback.isPlaying
    && !isExportPreview;

  const dynamicViewport = useMemo(() => {
    if (!profileData || !dynamicSections || isEditingSections) return null;
    return getDynamicElevationViewport({
      currentTimeMs: playback.currentTime,
      totalDurationMs: playback.totalDuration,
      fullElevationMin: profileData.minElevation,
      fullElevationMax: profileData.maxElevation,
      sections: focusSections,
    });
  }, [focusSections, isEditingSections, playback.currentTime, playback.totalDuration, profileData, dynamicSections]);

  // Only the clip width and interpolated label change during playback. The
  // profile paths themselves stay static, avoiding a full GPX scan and a large
  // SVG `d` string rebuild on every animation frame.
  const progressData = useMemo(() => {
    if (!profileData || playback.progress <= 0) {
      return { currentElevation: 0, markerX: 0, currentColor: trailStyle.trailColor };
    }

    const { svgWidth, pointsBySegment } = profileData;
    const progressX = playback.progress * svgWidth;

    // Find the current segment's color
    let currentColor = currentTrackColor || trailStyle.trailColor;
    if (isInTransport) {
      currentColor = routeTiming?.color || (routeTiming?.trackId ? tracks.find((track) => track.id === routeTiming.trackId)?.color : undefined) || (routeTiming ? trailStyle.trailColor : '#888888');
    }

    let currentPoints = currentSegment
      ? pointsBySegment.get(currentSegment.segment.segmentIndex)
      : undefined;
    if (!currentPoints) {
      currentPoints = [...pointsBySegment.values()].find((points) => {
        const first = points[0];
        const last = points[points.length - 1];
        return first && last && playback.progress >= first.progress && playback.progress <= last.progress;
      });
    }

    const currentElevation = currentPoints
      ? getElevationAtProgress(currentPoints, playback.progress)
      : 0;

    return { currentElevation, markerX: progressX, currentColor };
  }, [profileData, playback.progress, currentTrackColor, trailStyle.trailColor, isInTransport, currentSegment, routeTiming, tracks]);

  const routeBounds = useMemo(() => {
    if (!routeTiming || !profileData) return null;
    const points = profileData.pointsBySegment.get(routeTiming.segmentIndex) ?? [];
    if (points.length < 2) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const point of points) {
      if (point.elevation > 0) {
        min = Math.min(min, point.elevation);
        max = Math.max(max, point.elevation);
      }
    }
    return {
      start: routeTimingMode === 'uniform' ? routeTiming.distanceStartRatio : routeTiming.progressStartRatio,
      end: routeTimingMode === 'uniform' ? routeTiming.distanceEndRatio : routeTiming.progressEndRatio,
      min,
      max,
    };
  }, [profileData, routeTiming, routeTimingMode]);

  // The Style setting is the single source of truth for both preview and export.
  const shouldShow = profileData &&
    settings.showElevationProfile &&
    (animationPhase === 'idle' || animationPhase === 'playing');

  if (!shouldShow) {
    return null;
  }

  const {
    svgWidth,
    svgHeight,
    padding,
    chartHeight,
    minElevation,
    maxElevation,
    normalizedPoints,
    segmentPaths,
  } = profileData;
  const { currentElevation, markerX, currentColor } = progressData;
  const elevUnit = settings.unitSystem === 'metric' ? 'm' : 'ft';

  const formattedCurrentElev = Math.round(convertElevation(currentElevation, settings.unitSystem));
  const elevationRange = maxElevation - minElevation;
  const elevationToY = (elevation: number) => {
    if (elevationRange <= 0) return padding + chartHeight / 2;
    return svgHeight - padding - ((elevation - minElevation) / elevationRange) * chartHeight;
  };
  const routeRange = routeBounds;
  const routeMin = routeBounds?.min ?? Infinity;
  const routeMax = routeBounds?.max ?? -Infinity;
  const progressDomain = routeRange && routeRange.end > routeRange.start
    ? [routeRange.start, routeRange.end] : dynamicViewport?.progressDomain ?? [0, 1];
  const elevationDomain = routeRange && Number.isFinite(routeMin) && routeMax > routeMin
    ? [routeMin, routeMax] : dynamicViewport?.elevationDomain ?? [minElevation, maxElevation];
  const viewBoxX = progressDomain[0] * svgWidth;
  const viewBoxWidth = Math.max(1, (progressDomain[1] - progressDomain[0]) * svgWidth);
  const focusAmount = dynamicViewport?.focusAmount ?? (routeRange ? 1 : 0);
  const focusedViewBoxTop = elevationToY(elevationDomain[1]);
  const focusedViewBoxBottom = elevationToY(elevationDomain[0]);
  const viewBoxTop = dynamicViewport || (routeRange && Number.isFinite(routeMin) && routeMax > routeMin)
    ? focusedViewBoxTop - padding * (1 - focusAmount)
    : 0;
  const viewBoxBottom = dynamicViewport || (routeRange && Number.isFinite(routeMin) && routeMax > routeMin)
    ? focusedViewBoxBottom + padding * (1 - focusAmount)
    : svgHeight;
  const viewBoxHeight = Math.max(1, viewBoxBottom - viewBoxTop);
  const markerPosition = Math.min(1, Math.max(0, (markerX - viewBoxX) / viewBoxWidth));
  const focusedSection = dynamicViewport?.activeSection ?? null;
  const upcomingFocusSection = dynamicSections
    && dynamicViewport?.mode === 'overview'
    ? focusSections.find((section) => section.startProgress >= playback.progress - 0.000001) ?? null
    : null;
  const highlightedSections = isEditingSections
    ? focusSections
    : (upcomingFocusSection ? [upcomingFocusSection] : []);
  const sectionHighlights = highlightedSections.flatMap((section) => {
    const points = normalizedPoints.filter((point) => (
      point.segmentIndex === section.segmentIndex
      && point.progress >= section.startProgress
      && point.progress <= section.endProgress
    ));
    if (points.length < 2) return [];
    return [{
      section,
      color: segmentPaths.find((segment) => segment.segmentIndex === section.segmentIndex)?.color
        ?? trailStyle.trailColor,
      ridgeD: points.reduce(
        (path, point, index) => `${path}${index === 0 ? 'M' : ' L'} ${point.x} ${point.y}`,
        '',
      ),
    }];
  });
  const focusedPoints = focusedSection
    ? profileData.pointsBySegment.get(focusedSection.segmentIndex) ?? []
    : [];
  const sectionStartElevation = focusedSection
    ? getElevationAtProgress(focusedPoints, focusedSection.startProgress)
    : 0;
  const sectionEndElevation = focusedSection
    ? getElevationAtProgress(focusedPoints, focusedSection.endProgress)
    : 0;
  // This label describes the change between the two displayed endpoints.
  // Summing every upward GPX fluctuation can inflate it with noise and rolls.
  const sectionElevationChange = sectionEndElevation - sectionStartElevation;
  const sectionMetrics = focusedSection && dynamicViewport && dynamicViewport.focusAmount > 0.5
    ? {
        kind: sectionElevationChange >= 0 ? 'climb' as const : 'descent' as const,
        change: `${sectionElevationChange >= 0 ? '+' : '-'}${formatElevation(Math.abs(sectionElevationChange), settings.unitSystem)}`,
        start: formatElevation(
          sectionStartElevation,
          settings.unitSystem,
        ),
        end: formatElevation(
          sectionEndElevation,
          settings.unitSystem,
        ),
        distance: formatDistance(focusedSection.distance, settings.unitSystem),
      }
    : null;
  const profileHeightScale = Math.max(0.5, Math.min(3, settings.elevationProfileHeight ?? 1));
  const isNonWideExportPreview = isExportPreview && exportAspectRatio !== '16:9';
  const labelOverflowPadding = isNonWideExportPreview ? 24 : 18;
  const exportProfileStyle = exportFrame
    ? {
        left: exportFrame.frameLeft + (exportFrame.frameWidth * 0.075) - labelOverflowPadding,
        right: exportFrame.frameLeft + (exportFrame.frameWidth * 0.075) - labelOverflowPadding,
        bottom: exportFrame.bottom + 10,
      }
    : {
        left: -labelOverflowPadding,
        right: -labelOverflowPadding,
        bottom: 0,
      };

  const sectionColors = new Map(
    segmentPaths.map((segment) => [segment.segmentIndex, segment.color]),
  );
  return (
    <div
      className={`absolute z-20 ${className}`}
      style={{
        ...exportProfileStyle,
        fontFamily: 'var(--font-family-overlay)',
      }}
      id="mapElevationProfile"
    >
      <div
        className="relative"
        style={{
          marginLeft: labelOverflowPadding,
          marginRight: labelOverflowPadding,
        }}
      >
        <ElevationProfileChart
          geometry={profileData}
          viewBox={{
            x: viewBoxX,
            y: viewBoxTop,
            width: viewBoxWidth,
            height: viewBoxHeight,
            bottom: viewBoxBottom,
          }}
          markerX={routeRange ? Math.max(viewBoxX, Math.min(viewBoxX + viewBoxWidth, markerX)) : markerX}
          currentColor={currentColor}
          progress={playback.progress}
          focusAmount={focusAmount}
          sectionMetrics={sectionMetrics}
          sectionHighlights={sectionHighlights}
          segmentTimings={segmentTimings}
          routeTimingMode={routeTimingMode}
          dynamic={dynamicSections || settings.elevationProfilePerRoute}
          tall={isNonWideExportPreview}
          heightScale={profileHeightScale}
          filled={settings.elevationProfileFilled ?? true}
        />
        {!isExportPreview && (
          <button
            type="button" role="slider" aria-label={t('annotations.resizeElevationProfile')}
            aria-valuemin={50} aria-valuemax={300} aria-valuenow={Math.round(profileHeightScale * 100)}
            className="absolute -top-3 left-1/2 z-30 flex h-6 w-14 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center rounded-full border border-white/40 bg-[#17251f]/80 text-white/90 opacity-60 transition hover:opacity-100 focus-visible:opacity-100"
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); resizeStart.current = { y: event.clientY, height: profileHeightScale }; }}
            onPointerMove={(event) => { if (!resizeStart.current) return; const scale = resizeStart.current.height + (resizeStart.current.y - event.clientY) / 60; setSettings({ elevationProfileHeight: Math.max(0.5, Math.min(3, scale)) }); }}
            onPointerUp={() => { resizeStart.current = null; }}
            onPointerCancel={() => { resizeStart.current = null; }}
            onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setSettings({ elevationProfileHeight: Math.max(0.5, Math.min(3, profileHeightScale + (event.key === 'ArrowUp' ? 0.1 : -0.1))) }); } }}
          ><span aria-hidden="true" className="h-1 w-7 rounded-full bg-white/80" /></button>
        )}
        {isEditingSections && (
          <ElevationSectionEditor
            sections={focusSections}
            colors={sectionColors}
            onBoundaryChange={changeSectionBoundary}
            onAdd={addSection}
            onRemove={removeSection}
          />
        )}

        <ElevationProfileLabels
          sectionMetrics={sectionMetrics}
          focusAmount={dynamicViewport?.focusAmount ?? 0}
          progress={playback.progress}
          markerPosition={markerPosition}
          currentElevation={formattedCurrentElev}
          elevationUnit={elevUnit}
          transportMode={isInTransport ? currentSegment?.segment.transportMode ?? null : null}
          tall={isNonWideExportPreview}
        />
        {/* Segment labels (small indicators at top) */}
        {!dynamicSections && !settings.elevationProfilePerRoute && segmentTimings.length > 1 && (
          <div className="absolute top-0 left-0 right-0 flex">
            {segmentTimings.map((timing, i) => {
              const { start, end } = segmentProgressRange(timing);
              const width = (end - start) * 100;
              const left = start * 100;
              const track = timing.trackId ? tracks.find((t) => t.id === timing.trackId) : null;

              return (
                <div
                  key={`label-${i}`}
                  className="absolute h-1 rounded-full opacity-60"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: timing.type === 'transport' ? '#888888' : (track?.color || trailStyle.trailColor),
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
