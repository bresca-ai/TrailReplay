import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { convertElevation, formatDistance, formatElevation } from '@/utils/units';
import type { CropPreviewMetrics } from '@/utils/crop';
import { getDynamicElevationViewport } from './dynamicElevationViewport';
import { getElevationAtProgress } from './elevationProfile';
import { detectElevationFocusSections } from './elevationSections';

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

  // Generate elevation profile data
  const profileData = useMemo(() => {
    if (elevationData.length === 0) {
      return null;
    }

    const svgWidth = 800;
    const svgHeight = 60;

    // Get elevation data, filtering out transport segments for elevation calculation
    const trackElevations = elevationData
      .filter((d) => d.segmentType === 'track')
      .map((d) => d.elevation);

    const validElevations = trackElevations.filter((e) => e > 0);

    if (validElevations.length === 0) {
      return null;
    }

    const minElevation = Math.min(...validElevations);
    const maxElevation = Math.max(...validElevations);
    const elevationRange = maxElevation - minElevation;

    // Normalize elevations to SVG coordinates
    const padding = 5;
    const chartHeight = svgHeight - padding * 2;

    const normalizedPoints = elevationData.map((point) => {
      const x = point.progress * svgWidth;
      // For transport segments, use min elevation
      const elevation = point.segmentType === 'transport' ? minElevation : (point.elevation > 0 ? point.elevation : minElevation);
      const normalizedY = elevationRange > 0
        ? ((elevation - minElevation) / elevationRange) * chartHeight
        : chartHeight / 2;
      // SVG y is inverted (0 at top)
      const y = svgHeight - padding - normalizedY;
      return {
        x,
        y,
        elevation: point.elevation,
        segmentIndex: point.segmentIndex,
        segmentType: point.segmentType,
        progress: point.progress,
      };
    });

    // Create segment paths with different colors
    const segmentPaths: Array<{
      pathD: string;
      color: string;
      segmentIndex: number;
      type: 'track' | 'transport';
    }> = [];
    const pointsBySegment = new Map<number, typeof normalizedPoints>();

    normalizedPoints.forEach((point) => {
      const points = pointsBySegment.get(point.segmentIndex) ?? [];
      points.push(point);
      pointsBySegment.set(point.segmentIndex, points);
    });

    segmentTimings.forEach((timing) => {
      // Segment progress can share an exact boundary with the adjacent file.
      // Select by ownership, rather than by the boundary range, so separate
      // routes never become a fictitious climb or descent in the profile.
      const segmentPoints = pointsBySegment.get(timing.segmentIndex) ?? [];

      if (segmentPoints.length > 1) {
        let segPathD = `M ${segmentPoints[0].x} ${svgHeight}`;
        segmentPoints.forEach((point) => {
          segPathD += ` L ${point.x} ${point.y}`;
        });
        segPathD += ` L ${segmentPoints[segmentPoints.length - 1].x} ${svgHeight} Z`;

        // Get track color for this segment
        let color = trailStyle.trailColor;
        if (timing.type === 'track' && timing.trackId) {
          const track = tracks.find((t) => t.id === timing.trackId);
          if (track?.color) {
            color = track.color;
          }
        } else if (timing.type === 'transport') {
          color = '#888888'; // Gray for transport
        }

        segmentPaths.push({
          pathD: segPathD,
          color,
          segmentIndex: timing.segmentIndex,
          type: timing.type,
        });
      }
    });

    return {
      svgWidth,
      svgHeight,
      padding,
      chartHeight,
      minElevation,
      maxElevation,
      pointsBySegment,
      segmentPaths,
    };
  }, [elevationData, segmentTimings, trailStyle.trailColor, tracks]);

  const focusSections = useMemo(
    () => settings.dynamicElevationProfile
      ? detectElevationFocusSections(elevationData)
      : [],
    [elevationData, settings.dynamicElevationProfile],
  );

  const dynamicViewport = useMemo(() => {
    if (!profileData || !settings.dynamicElevationProfile) return null;
    return getDynamicElevationViewport({
      currentTimeMs: playback.currentTime,
      totalDurationMs: playback.totalDuration,
      fullElevationMin: profileData.minElevation,
      fullElevationMax: profileData.maxElevation,
      sections: focusSections,
    });
  }, [focusSections, playback.currentTime, playback.totalDuration, profileData, settings.dynamicElevationProfile]);

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
  const sectionLabel = focusedSection && dynamicViewport && dynamicViewport.focusAmount > 0.5
    ? `${focusedSection.kind === 'climb' ? '↗' : '↘'} ${formatDistance(focusedSection.distance, settings.unitSystem)} · ${formatElevation(focusedSection.minElevation, settings.unitSystem)}–${formatElevation(focusedSection.maxElevation, settings.unitSystem)} · ${focusedSection.kind === 'climb' ? '+' : '−'}${formatElevation(focusedSection.kind === 'climb' ? focusedSection.elevationGain : focusedSection.elevationLoss, settings.unitSystem)}`
    : '';
  const isExportPreview = isExporting || activePanel === 'export';
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

  return (
    <div
      className={`absolute z-20 ${className}`}
      style={exportProfileStyle}
      id="mapElevationProfile"
    >
      <div
        className="relative"
        style={{
          marginLeft: labelOverflowPadding,
          marginRight: labelOverflowPadding,
        }}
      >
        {/* SVG Profile */}
        <svg
          viewBox={`${viewBoxX} ${viewBoxTop} ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="none"
          className={`w-full ${isNonWideExportPreview ? 'h-[72px]' : 'h-[60px]'}`}
          id="elevationProfileSvg"
          data-export-elevation-progress-color={currentColor}
          data-export-elevation-marker-x={markerX}
          data-export-elevation-section-label={sectionLabel || undefined}
          data-export-elevation-dynamic-profile={settings.dynamicElevationProfile ? 'true' : undefined}
        >
          {/* Gradient definitions for segments */}
          <defs>
            {segmentPaths.map((seg) => (
              <linearGradient
                key={`gradient-${seg.segmentIndex}`}
                id={`segmentGradient-${seg.segmentIndex}`}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor={seg.color} stopOpacity={seg.type === 'transport' ? '0.2' : '0.3'} />
                <stop offset="100%" stopColor={seg.color} stopOpacity={seg.type === 'transport' ? '0.05' : '0.1'} />
              </linearGradient>
            ))}
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={currentColor} stopOpacity="0.9" />
              <stop offset="100%" stopColor={currentColor} stopOpacity="0.5" />
            </linearGradient>
            <clipPath id="elevationProgressClip">
              <rect x={viewBoxX} y={viewBoxTop} width={Math.max(0, markerX - viewBoxX)} height={viewBoxHeight} />
            </clipPath>
          </defs>

          {/* Background elevation profiles for each segment */}
          {segmentPaths.map((seg) => (
            <path
              key={`segment-${seg.segmentIndex}`}
              d={seg.pathD}
              data-export-elevation-segment
              data-export-elevation-color={seg.color}
              data-export-elevation-type={seg.type}
              fill={`url(#segmentGradient-${seg.segmentIndex})`}
              stroke={seg.color}
              strokeWidth="1"
              strokeOpacity={seg.type === 'transport' ? '0.3' : '0.5'}
              strokeDasharray={seg.type === 'transport' ? '4,4' : 'none'}
              vectorEffect="non-scaling-stroke"
              id={`segmentPath-${seg.segmentIndex}`}
            />
          ))}

          {/* Progress overlay */}
          {playback.progress > 0 && (
            <g clipPath="url(#elevationProgressClip)" data-export-elevation-dynamic>
              {segmentPaths.map((seg) => (
                <path
                  key={`progress-${seg.segmentIndex}`}
                  d={seg.pathD}
                  fill="url(#progressGradient)"
                  stroke={currentColor}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          )}

          {/* Segment boundaries (vertical lines) */}
          {segmentTimings.length > 1 && segmentTimings.slice(1).map((timing, i) => {
            const { start } = segmentProgressRange(timing);
            return (
              <line
                key={`boundary-${i}`}
                x1={start * svgWidth}
                y1="0"
                x2={start * svgWidth}
                y2={svgHeight}
                stroke="white"
                strokeWidth="1"
                strokeOpacity="0.3"
              />
            );
          })}
        </svg>

        {sectionLabel && (
          <div
            data-export-elevation-dynamic
            className={`absolute left-2 top-1 whitespace-nowrap rounded-md bg-black/70 px-1.5 py-0.5 font-semibold text-white shadow-sm transition-opacity ${
              isNonWideExportPreview ? 'text-[13px]' : 'text-[9px]'
            }`}
            style={{ opacity: dynamicViewport?.focusAmount ?? 0 }}
          >
            {sectionLabel}
          </div>
        )}

        {/* Current elevation label - follows the progress, aligned to bottom */}
        {playback.progress > 0 && (
          <div
            data-export-elevation-dynamic
            data-export-elevation-label
            className={`absolute transform -translate-x-1/2 whitespace-nowrap ${
              isNonWideExportPreview
                ? 'bottom-2'
                : 'bottom-1'
            }`}
            style={{
              left: `${markerPosition * 100}%`,
              textShadow: isNonWideExportPreview
                ? '0 3px 10px rgba(0, 0, 0, 0.72), 0 1px 3px rgba(0, 0, 0, 0.9)'
                : '0 2px 6px rgba(0, 0, 0, 0.75)',
            }}
          >
            {isInTransport ? (
              <span
                className={`block text-white ${
                  isNonWideExportPreview ? 'text-[18px] leading-none' : 'text-[12px] leading-none'
                }`}
              >
                {currentSegment?.segment.transportMode === 'car' && '🚗'}
                {currentSegment?.segment.transportMode === 'bus' && '🚌'}
                {currentSegment?.segment.transportMode === 'train' && '🚆'}
                {currentSegment?.segment.transportMode === 'plane' && '✈️'}
                {currentSegment?.segment.transportMode === 'bike' && '🚲'}
                {currentSegment?.segment.transportMode === 'walk' && '🚶'}
                {currentSegment?.segment.transportMode === 'ferry' && '⛴️'}
              </span>
            ) : (
              <span
                className={`inline-flex items-baseline font-bold text-white ${
                  isNonWideExportPreview ? 'gap-1.5' : 'gap-1'
                }`}
              >
                <span
                  className={isNonWideExportPreview ? 'text-[22px] leading-none tracking-[-0.03em]' : 'text-[14px] leading-none'}
                >
                  {formattedCurrentElev}
                </span>
                <span
                  className={`font-semibold uppercase ${
                    isNonWideExportPreview ? 'text-[14px] leading-none' : 'text-[9px] leading-none'
                  }`}
                >
                  {elevUnit}
                </span>
              </span>
            )}
          </div>
        )}

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
