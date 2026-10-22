import { useMemo } from 'react';
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

  const detectedFocusSections = useMemo(
    () => settings.dynamicElevationProfile
      ? detectElevationFocusSections(elevationData)
      : [],
    [elevationData, settings.dynamicElevationProfile],
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
  const isEditingSections = settings.dynamicElevationProfile
    && !playback.isPlaying
    && !isExportPreview;

  const dynamicViewport = useMemo(() => {
    if (!profileData || !settings.dynamicElevationProfile || isEditingSections) return null;
    return getDynamicElevationViewport({
      currentTimeMs: playback.currentTime,
      totalDurationMs: playback.totalDuration,
      fullElevationMin: profileData.minElevation,
      fullElevationMax: profileData.maxElevation,
      sections: focusSections,
    });
  }, [focusSections, isEditingSections, playback.currentTime, playback.totalDuration, profileData, settings.dynamicElevationProfile]);

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
      currentColor = '#888888';
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
  }, [profileData, playback.progress, currentTrackColor, trailStyle.trailColor, isInTransport, currentSegment]);

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
  const progressDomain = dynamicViewport?.progressDomain ?? [0, 1];
  const elevationDomain = dynamicViewport?.elevationDomain ?? [minElevation, maxElevation];
  const viewBoxX = progressDomain[0] * svgWidth;
  const viewBoxWidth = Math.max(1, (progressDomain[1] - progressDomain[0]) * svgWidth);
  const focusAmount = dynamicViewport?.focusAmount ?? 0;
  const focusedViewBoxTop = elevationToY(elevationDomain[1]);
  const focusedViewBoxBottom = elevationToY(elevationDomain[0]);
  const viewBoxTop = dynamicViewport
    ? focusedViewBoxTop - padding * (1 - focusAmount)
    : 0;
  const viewBoxBottom = dynamicViewport
    ? focusedViewBoxBottom + padding * (1 - focusAmount)
    : svgHeight;
  const viewBoxHeight = Math.max(1, viewBoxBottom - viewBoxTop);
  const markerPosition = Math.min(1, Math.max(0, (markerX - viewBoxX) / viewBoxWidth));
  const focusedSection = dynamicViewport?.activeSection ?? null;
  const upcomingFocusSection = settings.dynamicElevationProfile
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
          markerX={markerX}
          currentColor={currentColor}
          progress={playback.progress}
          focusAmount={focusAmount}
          sectionMetrics={sectionMetrics}
          sectionHighlights={sectionHighlights}
          segmentTimings={segmentTimings}
          routeTimingMode={routeTimingMode}
          dynamic={settings.dynamicElevationProfile}
          tall={isNonWideExportPreview}
        />
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
        {!settings.dynamicElevationProfile && segmentTimings.length > 1 && (
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
