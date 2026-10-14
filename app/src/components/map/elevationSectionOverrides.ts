import type { ElevationSectionOverride } from '@/types';
import type { ElevationFocusSection, ElevationSectionPoint } from './elevationSections';

const MATCH_TOLERANCE = 0.000_001;

function closestPoint(
  points: ElevationSectionPoint[],
  progress: number,
): ElevationSectionPoint {
  return points.reduce((closest, point) => (
    Math.abs(point.progress - progress) < Math.abs(closest.progress - progress)
      ? point
      : closest
  ));
}

export function resizeElevationSection(
  section: ElevationFocusSection,
  elevationData: ElevationSectionPoint[],
  requestedStart: number,
  requestedEnd: number,
): ElevationFocusSection {
  const segmentPoints = elevationData.filter((point) => (
    point.segmentType === 'track'
    && point.segmentIndex === section.segmentIndex
    && point.elevation > 0
  ));
  if (segmentPoints.length < 2) return section;

  const start = closestPoint(segmentPoints, requestedStart);
  const end = closestPoint(segmentPoints, requestedEnd);
  const startIndex = segmentPoints.indexOf(start);
  const endIndex = segmentPoints.indexOf(end);
  if (endIndex <= startIndex) return section;

  const points = segmentPoints.slice(startIndex, endIndex + 1);
  let elevationGain = 0;
  let elevationLoss = 0;
  points.slice(1).forEach((point, index) => {
    const change = point.elevation - points[index].elevation;
    if (change > 0) elevationGain += change;
    else elevationLoss -= change;
  });

  const elevations = points.map((point) => point.elevation);
  return {
    ...section,
    startProgress: start.progress,
    endProgress: end.progress,
    startDistance: start.distance,
    endDistance: end.distance,
    distance: end.distance - start.distance,
    minElevation: Math.min(...elevations),
    maxElevation: Math.max(...elevations),
    elevationGain,
    elevationLoss,
  };
}

export function applyElevationSectionOverrides(
  sections: ElevationFocusSection[],
  overrides: ElevationSectionOverride[],
  elevationData: ElevationSectionPoint[],
): ElevationFocusSection[] {
  return sections.map((section) => {
    const override = overrides.find((candidate) => (
      candidate.sectionId === section.id
      && candidate.segmentIndex === section.segmentIndex
      && candidate.kind === section.kind
      && Math.abs(candidate.detectedStartProgress - section.startProgress) <= MATCH_TOLERANCE
      && Math.abs(candidate.detectedEndProgress - section.endProgress) <= MATCH_TOLERANCE
    ));
    return override
      ? resizeElevationSection(section, elevationData, override.startProgress, override.endProgress)
      : section;
  });
}

export function upsertElevationSectionOverride(
  overrides: ElevationSectionOverride[],
  detected: ElevationFocusSection,
  adjusted: ElevationFocusSection,
): ElevationSectionOverride[] {
  const next: ElevationSectionOverride = {
    sectionId: detected.id,
    segmentIndex: detected.segmentIndex,
    kind: detected.kind,
    detectedStartProgress: detected.startProgress,
    detectedEndProgress: detected.endProgress,
    startProgress: adjusted.startProgress,
    endProgress: adjusted.endProgress,
  };
  return [...overrides.filter((entry) => entry.sectionId !== detected.id), next];
}
