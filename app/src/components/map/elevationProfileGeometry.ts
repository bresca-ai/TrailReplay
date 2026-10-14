import type { GPXTrack } from '@/types';
import type { SegmentTiming } from '@/utils/journeyUtils';
import type { ElevationSectionPoint } from './elevationSections';

export interface NormalizedElevationPoint extends ElevationSectionPoint {
  x: number;
  y: number;
}

export interface ElevationSegmentPath {
  pathD: string;
  ridgeD: string;
  color: string;
  segmentIndex: number;
  type: 'track' | 'transport';
}

export interface ElevationProfileGeometry {
  svgWidth: number;
  svgHeight: number;
  padding: number;
  chartHeight: number;
  minElevation: number;
  maxElevation: number;
  pointsBySegment: Map<number, NormalizedElevationPoint[]>;
  normalizedPoints: NormalizedElevationPoint[];
  segmentPaths: ElevationSegmentPath[];
}

export function buildElevationProfileGeometry(
  elevationData: ElevationSectionPoint[],
  segmentTimings: SegmentTiming[],
  trailColor: string,
  tracks: GPXTrack[],
): ElevationProfileGeometry | null {
  if (elevationData.length === 0) return null;

  const svgWidth = 800;
  const svgHeight = 60;
  const padding = 5;
  const chartHeight = svgHeight - padding * 2;
  const validElevations = elevationData
    .filter((point) => point.segmentType === 'track' && point.elevation > 0)
    .map((point) => point.elevation);
  if (validElevations.length === 0) return null;

  const minElevation = Math.min(...validElevations);
  const maxElevation = Math.max(...validElevations);
  const elevationRange = maxElevation - minElevation;
  const normalizedPoints = elevationData.map((point): NormalizedElevationPoint => {
    const elevation = point.segmentType === 'transport'
      ? minElevation
      : (point.elevation > 0 ? point.elevation : minElevation);
    const normalizedY = elevationRange > 0
      ? ((elevation - minElevation) / elevationRange) * chartHeight
      : chartHeight / 2;
    return {
      ...point,
      x: point.progress * svgWidth,
      y: svgHeight - padding - normalizedY,
    };
  });

  const pointsBySegment = new Map<number, NormalizedElevationPoint[]>();
  normalizedPoints.forEach((point) => {
    const points = pointsBySegment.get(point.segmentIndex) ?? [];
    points.push(point);
    pointsBySegment.set(point.segmentIndex, points);
  });

  const segmentPaths: ElevationSegmentPath[] = [];
  segmentTimings.forEach((timing) => {
    const points = pointsBySegment.get(timing.segmentIndex) ?? [];
    if (points.length < 2) return;

    const ridgeD = points.reduce(
      (path, point, index) => `${path}${index === 0 ? 'M' : ' L'} ${point.x} ${point.y}`,
      '',
    );
    const pathD = `M ${points[0].x} ${svgHeight} ${ridgeD.replace(/^M/, 'L')} L ${points.at(-1)!.x} ${svgHeight} Z`;
    const track = timing.trackId
      ? tracks.find((candidate) => candidate.id === timing.trackId)
      : null;

    segmentPaths.push({
      pathD,
      ridgeD,
      color: timing.type === 'transport' ? '#888888' : (track?.color || trailColor),
      segmentIndex: timing.segmentIndex,
      type: timing.type,
    });
  });

  return {
    svgWidth,
    svgHeight,
    padding,
    chartHeight,
    minElevation,
    maxElevation,
    pointsBySegment,
    normalizedPoints,
    segmentPaths,
  };
}
