export interface ElevationSectionPoint {
  /** Cumulative route distance, in metres. */
  distance: number;
  elevation: number;
  progress: number;
  segmentIndex: number;
  segmentType: 'track' | 'transport';
}

export interface ElevationFocusSection {
  id: string;
  kind: 'climb' | 'descent';
  startProgress: number;
  endProgress: number;
  startDistance: number;
  endDistance: number;
  distance: number;
  minElevation: number;
  maxElevation: number;
  elevationGain: number;
  elevationLoss: number;
  segmentIndex: number;
}

export interface ElevationSectionDetectionOptions {
  minSectionDistance?: number;
  minElevationChange?: number;
  minAverageGrade?: number;
  mergeGapDistance?: number;
  minOverviewGap?: number;
  maxSections?: number;
}

interface Sample extends ElevationSectionPoint {
  smoothedElevation: number;
}

interface Candidate {
  kind: ElevationFocusSection['kind'];
  startIndex: number;
  endIndex: number;
  samples: Sample[];
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function isUsablePoint(point: ElevationSectionPoint): boolean {
  return point.segmentType === 'track'
    && Number.isFinite(point.distance)
    && point.distance >= 0
    && Number.isFinite(point.elevation)
    && point.elevation > 0
    && Number.isFinite(point.progress);
}

/**
 * Smooth by distance rather than sample count, so a densely-recorded part of a
 * GPX does not get treated differently from a sparse one.
 */
function smoothRun(points: ElevationSectionPoint[]): Sample[] {
  const runDistance = points.at(-1)!.distance - points[0].distance;
  const radius = clamp(runDistance * 0.015, 30, 120);

  return points.map((point, index) => {
    let weightedElevation = 0;
    let totalWeight = 0;

    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const distance = point.distance - points[cursor].distance;
      if (distance > radius) break;
      const weight = 1 - (distance / (radius + 1));
      weightedElevation += points[cursor].elevation * weight;
      totalWeight += weight;
    }
    for (let cursor = index + 1; cursor < points.length; cursor += 1) {
      const distance = points[cursor].distance - point.distance;
      if (distance > radius) break;
      const weight = 1 - (distance / (radius + 1));
      weightedElevation += points[cursor].elevation * weight;
      totalWeight += weight;
    }

    return {
      ...point,
      smoothedElevation: totalWeight > 0
        ? weightedElevation / totalWeight
        : point.elevation,
    };
  });
}

function findTrendLegs(samples: Sample[]): Candidate[] {
  if (samples.length < 2) return [];

  const elevations = samples.map((sample) => sample.smoothedElevation);
  const elevationRange = Math.max(...elevations) - Math.min(...elevations);
  const reversalTolerance = clamp(elevationRange * 0.08, 6, 14);
  const activation = Math.min(4, reversalTolerance / 2);
  const result: Candidate[] = [];

  let trend: ElevationFocusSection['kind'] | null = null;
  let pivotIndex = 0;
  let extremeIndex = 0;
  let lowIndex = 0;
  let highIndex = 0;

  const addLeg = () => {
    if (pivotIndex === extremeIndex) return;
    result.push({
      kind: trend!,
      startIndex: Math.min(pivotIndex, extremeIndex),
      endIndex: Math.max(pivotIndex, extremeIndex),
      samples,
    });
  };

  for (let index = 1; index < samples.length; index += 1) {
    const elevation = samples[index].smoothedElevation;

    if (trend === null) {
      if (elevation < samples[lowIndex].smoothedElevation) lowIndex = index;
      if (elevation > samples[highIndex].smoothedElevation) highIndex = index;

      if (samples[highIndex].smoothedElevation - samples[lowIndex].smoothedElevation < activation) {
        continue;
      }

      if (lowIndex < highIndex) {
        trend = 'climb';
        pivotIndex = lowIndex;
        extremeIndex = highIndex;
      } else {
        trend = 'descent';
        pivotIndex = highIndex;
        extremeIndex = lowIndex;
      }
      continue;
    }

    if (trend === 'climb') {
      if (elevation >= samples[extremeIndex].smoothedElevation) {
        extremeIndex = index;
      } else if (samples[extremeIndex].smoothedElevation - elevation >= reversalTolerance) {
        addLeg();
        trend = 'descent';
        pivotIndex = extremeIndex;
        extremeIndex = index;
      }
    } else if (elevation <= samples[extremeIndex].smoothedElevation) {
      extremeIndex = index;
    } else if (elevation - samples[extremeIndex].smoothedElevation >= reversalTolerance) {
      addLeg();
      trend = 'climb';
      pivotIndex = extremeIndex;
      extremeIndex = index;
    }
  }

  if (trend !== null) addLeg();
  return result;
}

function candidateDistance(candidate: Candidate): number {
  return candidate.samples[candidate.endIndex].distance
    - candidate.samples[candidate.startIndex].distance;
}

function candidateChange(candidate: Candidate): number {
  const start = candidate.samples[candidate.startIndex].smoothedElevation;
  const end = candidate.samples[candidate.endIndex].smoothedElevation;
  return Math.abs(end - start);
}

function mergeNearbyLegs(candidates: Candidate[], mergeGapDistance: number): Candidate[] {
  const merged = [...candidates];
  let index = 0;

  // A small counter-slope is normally a shelf or GPS wobble inside the same hill.
  while (index <= merged.length - 3) {
    const first = merged[index];
    const interruption = merged[index + 1];
    const last = merged[index + 2];
    const interruptionIsSmall = candidateDistance(interruption) <= mergeGapDistance
      && candidateChange(interruption) <= Math.max(16, candidateChange(first) * 0.35);

    if (first.kind === last.kind && interruptionIsSmall) {
      merged.splice(index, 3, {
        kind: first.kind,
        startIndex: first.startIndex,
        endIndex: last.endIndex,
        samples: first.samples,
      });
      index = Math.max(0, index - 2);
    } else {
      index += 1;
    }
  }

  return merged;
}

function toSection(candidate: Candidate): ElevationFocusSection {
  const points = candidate.samples.slice(candidate.startIndex, candidate.endIndex + 1);
  let elevationGain = 0;
  let elevationLoss = 0;
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;

  points.forEach((point, index) => {
    minElevation = Math.min(minElevation, point.smoothedElevation);
    maxElevation = Math.max(maxElevation, point.smoothedElevation);
    if (index === 0) return;
    const change = point.smoothedElevation - points[index - 1].smoothedElevation;
    if (change > 0) elevationGain += change;
    else elevationLoss += -change;
  });

  const start = points[0];
  const end = points.at(-1)!;
  return {
    id: '',
    kind: candidate.kind,
    startProgress: Math.min(start.progress, end.progress),
    endProgress: Math.max(start.progress, end.progress),
    startDistance: start.distance,
    endDistance: end.distance,
    distance: Math.max(0, end.distance - start.distance),
    minElevation,
    maxElevation,
    elevationGain,
    elevationLoss,
    segmentIndex: start.segmentIndex,
  };
}

function sectionScore(section: ElevationFocusSection): number {
  const vertical = section.kind === 'climb' ? section.elevationGain : section.elevationLoss;
  return vertical * Math.sqrt(Math.max(1, section.distance));
}

function mergeSections(
  first: ElevationFocusSection,
  second: ElevationFocusSection,
): ElevationFocusSection {
  return {
    ...first,
    endProgress: second.endProgress,
    endDistance: second.endDistance,
    distance: second.endDistance - first.startDistance,
    minElevation: Math.min(first.minElevation, second.minElevation),
    maxElevation: Math.max(first.maxElevation, second.maxElevation),
    elevationGain: first.elevationGain + second.elevationGain,
    elevationLoss: first.elevationLoss + second.elevationLoss,
  };
}

/** Detects noteworthy, animation-friendly climbing and descending sections. */
export function detectElevationFocusSections(
  points: ElevationSectionPoint[],
  options: ElevationSectionDetectionOptions = {},
): ElevationFocusSection[] {
  const runs: ElevationSectionPoint[][] = [];
  let currentRun: ElevationSectionPoint[] = [];

  const flush = () => {
    if (currentRun.length >= 2) runs.push(currentRun);
    currentRun = [];
  };

  points.forEach((point) => {
    const previous = currentRun.at(-1);
    if (!isUsablePoint(point)) {
      flush();
    } else if (previous && (
      point.segmentIndex !== previous.segmentIndex
      || point.distance < previous.distance
      || point.progress < previous.progress
    )) {
      flush();
      currentRun.push(point);
    } else {
      currentRun.push(point);
    }
  });
  flush();

  const sections: ElevationFocusSection[] = [];
  runs.forEach((run) => {
    const samples = smoothRun(run);
    const runDistance = samples.at(-1)!.distance - samples[0].distance;
    if (runDistance <= 0) return;

    const minDistance = options.minSectionDistance
      ?? clamp(runDistance * 0.06, 250, 700);
    const minChange = options.minElevationChange
      ?? clamp(runDistance * 0.006, 25, 55);
    const minGrade = options.minAverageGrade ?? 0.025;
    const mergeGap = options.mergeGapDistance
      ?? clamp(runDistance * 0.025, 120, 350);

    const candidates = mergeNearbyLegs(findTrendLegs(samples), mergeGap);
    sections.push(...candidates
      .filter((candidate) => {
        const distance = candidateDistance(candidate);
        const change = candidateChange(candidate);
        return distance >= minDistance
          && change >= minChange
          && change / distance >= minGrade;
      })
      .map(toSection));
  });

  sections.sort((left, right) => left.startProgress - right.startProgress);

  // Leave enough playback between focus events to show the route overview.
  const totalDistance = points.reduce(
    (maximum, point) => Number.isFinite(point.distance) ? Math.max(maximum, point.distance) : maximum,
    0,
  );
  const overviewGap = options.minOverviewGap
    ?? clamp(totalDistance * 0.025, 150, 500);
  const spaced: ElevationFocusSection[] = [];
  sections.forEach((section) => {
    const previous = spaced.at(-1);
    if (!previous || previous.segmentIndex !== section.segmentIndex
      || section.startDistance - previous.endDistance >= overviewGap) {
      spaced.push(section);
    } else if (previous.kind === section.kind) {
      spaced[spaced.length - 1] = mergeSections(previous, section);
    } else if (sectionScore(section) > sectionScore(previous)) {
      spaced[spaced.length - 1] = section;
    }
  });

  const maxSections = Math.max(1, Math.floor(options.maxSections ?? 6));
  const capped = spaced.length <= maxSections
    ? spaced
    : [...spaced]
      .sort((left, right) => sectionScore(right) - sectionScore(left))
      .slice(0, maxSections)
      .sort((left, right) => left.startProgress - right.startProgress);

  return capped.map((section, index) => ({
    ...section,
    id: `elevation-${section.segmentIndex}-${section.kind}-${index + 1}`,
  }));
}
