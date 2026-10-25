import type { CustomElevationSection, ElevationSectionOverride } from '@/types';
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
    // An edited range may cross onto the opposite slope. Keep its identity
    // for saved overrides, but derive its direction from the new endpoints.
    kind: end.elevation >= start.elevation ? 'climb' : 'descent',
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

export function createCustomElevationSection(
  elevationData: ElevationSectionPoint[],
  centerProgress: number,
  id: string,
  segmentIndex?: number,
): ElevationFocusSection | null {
  const usablePoints = elevationData.filter((point) => (
    point.segmentType === 'track'
    && point.elevation > 0
    && (segmentIndex === undefined || point.segmentIndex === segmentIndex)
  ));
  if (usablePoints.length < 2) return null;

  const center = closestPoint(usablePoints, centerProgress);
  const segmentPoints = usablePoints.filter((point) => point.segmentIndex === center.segmentIndex);
  if (segmentPoints.length < 2) return null;

  const segmentStart = segmentPoints[0].progress;
  const segmentEnd = segmentPoints.at(-1)!.progress;
  const segmentSpan = segmentEnd - segmentStart;
  const initialSpan = Math.min(0.1, Math.max(0.025, segmentSpan * 0.12));
  let startProgress = Math.max(segmentStart, center.progress - initialSpan / 2);
  const endProgress = Math.min(segmentEnd, startProgress + initialSpan);
  startProgress = Math.max(segmentStart, endProgress - initialSpan);

  let start = closestPoint(segmentPoints, startProgress);
  let end = closestPoint(segmentPoints, endProgress);
  if (segmentPoints.indexOf(end) <= segmentPoints.indexOf(start)) {
    const centerIndex = segmentPoints.indexOf(center);
    const startIndex = Math.max(0, Math.min(centerIndex - 1, segmentPoints.length - 2));
    start = segmentPoints[startIndex];
    end = segmentPoints[Math.min(segmentPoints.length - 1, Math.max(startIndex + 1, centerIndex + 1))];
  }
  const base: ElevationFocusSection = {
    id,
    kind: end.elevation >= start.elevation ? 'climb' : 'descent',
    startProgress: start.progress,
    endProgress: end.progress,
    startDistance: start.distance,
    endDistance: end.distance,
    distance: Math.max(0, end.distance - start.distance),
    minElevation: Math.min(start.elevation, end.elevation),
    maxElevation: Math.max(start.elevation, end.elevation),
    elevationGain: Math.max(0, end.elevation - start.elevation),
    elevationLoss: Math.max(0, start.elevation - end.elevation),
    segmentIndex: center.segmentIndex,
  };
  return resizeElevationSection(base, elevationData, start.progress, end.progress);
}

export function applyElevationSectionOverrides(
  sections: ElevationFocusSection[],
  overrides: ElevationSectionOverride[],
  elevationData: ElevationSectionPoint[],
  customSections: CustomElevationSection[] = [],
  hiddenSectionIds: string[] = [],
): ElevationFocusSection[] {
  const automatic = sections.filter((section) => !hiddenSectionIds.includes(section.id)).map((section) => {
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
  const custom = customSections.flatMap((section) => {
    const created = createCustomElevationSection(
      elevationData,
      (section.startProgress + section.endProgress) / 2,
      section.id,
      section.segmentIndex,
    );
    if (!created) return [];
    const resized = resizeElevationSection(
      created,
      elevationData,
      section.startProgress,
      section.endProgress,
    );
    return [resized];
  });
  return [...automatic, ...custom].sort((left, right) => left.startProgress - right.startProgress);
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
