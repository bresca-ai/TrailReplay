import type { SegmentTiming } from '@/utils/journeyUtils';
import type { ElevationFocusSection } from './elevationSections';
import type { ElevationProfileGeometry } from './elevationProfileGeometry';

export interface ElevationSectionMetrics {
  kind: ElevationFocusSection['kind'];
  change: string;
  start: string;
  end: string;
  distance: string;
}

export interface ElevationSectionHighlight {
  section: ElevationFocusSection;
  color: string;
  ridgeD: string;
}

interface ElevationProfileChartProps {
  geometry: ElevationProfileGeometry;
  viewBox: { x: number; y: number; width: number; height: number; bottom: number };
  markerX: number;
  currentColor: string;
  progress: number;
  focusAmount: number;
  sectionMetrics: ElevationSectionMetrics | null;
  sectionHighlights: ElevationSectionHighlight[];
  segmentTimings: SegmentTiming[];
  routeTimingMode: 'recorded' | 'uniform';
  dynamic: boolean;
  tall: boolean;
}

export function ElevationProfileChart({
  geometry,
  viewBox,
  markerX,
  currentColor,
  progress,
  focusAmount,
  sectionMetrics,
  sectionHighlights,
  segmentTimings,
  routeTimingMode,
  dynamic,
  tall,
}: ElevationProfileChartProps) {
  const { svgWidth, svgHeight, segmentPaths } = geometry;
  return (
    <svg
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="none"
      className={`w-full ${tall ? 'h-[72px]' : 'h-[60px]'}`}
      id="elevationProfileSvg"
      data-export-elevation-progress-color={currentColor}
      data-export-elevation-marker-x={markerX}
      data-export-elevation-focus-amount={focusAmount}
      data-export-elevation-change={sectionMetrics?.change}
      data-export-elevation-start={sectionMetrics?.start}
      data-export-elevation-end={sectionMetrics?.end}
      data-export-elevation-distance={sectionMetrics?.distance}
      data-export-elevation-section-kind={sectionMetrics?.kind}
      data-export-elevation-dynamic-profile={dynamic ? 'true' : undefined}
    >
      <defs>
        {segmentPaths.map((segment) => (
          <linearGradient
            key={`gradient-${segment.segmentIndex}`}
            id={`segmentGradient-${segment.segmentIndex}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={segment.color} stopOpacity={segment.type === 'transport' ? '0.2' : '0.3'} />
            <stop offset="100%" stopColor={segment.color} stopOpacity={segment.type === 'transport' ? '0.05' : '0.1'} />
          </linearGradient>
        ))}
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={currentColor} stopOpacity="0.9" />
          <stop offset="45%" stopColor={currentColor} stopOpacity="0.68" />
          <stop offset="100%" stopColor={currentColor} stopOpacity="0.24" />
        </linearGradient>
        <clipPath id="elevationProgressClip">
          <rect x={viewBox.x} y={viewBox.y} width={Math.max(0, markerX - viewBox.x)} height={viewBox.height} />
        </clipPath>
      </defs>

      {segmentPaths.map((segment) => (
        <g key={`segment-${segment.segmentIndex}`}>
          <path
            d={segment.pathD}
            data-export-elevation-segment
            data-export-elevation-ridge={segment.ridgeD}
            data-export-elevation-color={segment.color}
            data-export-elevation-type={segment.type}
            fill={`url(#segmentGradient-${segment.segmentIndex})`}
            id={`segmentPath-${segment.segmentIndex}`}
          />
          <path
            d={segment.ridgeD}
            fill="none"
            stroke={segment.color}
            strokeWidth="1"
            strokeOpacity={segment.type === 'transport' ? '0.3' : '0.5'}
            strokeDasharray={segment.type === 'transport' ? '4,4' : 'none'}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}

      {sectionHighlights.length > 0 && (
        <g opacity="0.95" data-export-elevation-focus-sections>
          {sectionHighlights.map((highlight) => (
            <g key={highlight.section.id}>
              <path
                d={highlight.ridgeD}
                fill="none"
                stroke="white"
                strokeWidth="5"
                strokeOpacity="0.72"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={highlight.ridgeD}
                fill="none"
                stroke={highlight.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                data-export-elevation-focus-section
                data-export-elevation-start-progress={highlight.section.startProgress}
                data-export-elevation-end-progress={highlight.section.endProgress}
                data-export-elevation-color={highlight.color}
                data-export-elevation-kind={highlight.section.kind}
              />
            </g>
          ))}
        </g>
      )}

      {progress > 0 && (
        <g clipPath="url(#elevationProgressClip)" data-export-elevation-dynamic>
          {segmentPaths.map((segment) => (
            <g key={`progress-${segment.segmentIndex}`}>
              <path d={segment.pathD} fill="url(#progressGradient)" />
              <path
                d={segment.ridgeD}
                fill="none"
                stroke={currentColor}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </g>
      )}

      {sectionMetrics && progress > 0 && (
        <line
          x1={markerX}
          y1={viewBox.y}
          x2={markerX}
          y2={viewBox.bottom}
          stroke="white"
          strokeWidth="1"
          strokeOpacity="0.38"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
          data-export-elevation-dynamic
        />
      )}

      {segmentTimings.slice(1).map((timing, index) => {
        const start = routeTimingMode === 'uniform'
          ? timing.distanceStartRatio
          : timing.progressStartRatio;
        return (
          <line
            key={`boundary-${index}`}
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
  );
}
