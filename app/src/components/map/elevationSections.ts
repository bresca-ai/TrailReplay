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
  /** Include downhill focus moments. Enabled by default. */
  includeDescents?: boolean;
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

function isMinorCounterSlope(
  first: Candidate,
  interruption: Candidate,
  last: Candidate,
  mergeGapDistance: number,
): boolean {
  const firstDistance = candidateDistance(first);
  const lastDistance = candidateDistance(last);
  const interruptionDistance = candidateDistance(interruption);
  const firstChange = candidateChange(first);
  const lastChange = candidateChange(last);
  const interruptionChange = candidateChange(interruption);

  // Scale the distance allowance to the shorter surrounding leg. A 500 m dip
  // can be a brief interruption inside two multi-kilometre climbs even though
  // it is too long for the absolute GPS-noise allowance.
  const distanceLimit = Math.max(
    mergeGapDistance,
    Math.min(firstDistance, lastDistance) * 0.5,
  );
  // Compare the reversal with both legs, not just the first. This prevents a
  // large valley after a huge climb from absorbing a genuinely separate hill.
  const verticalLimit = Math.max(
    24,
    Math.min(firstChange, lastChange) * 0.4,
  );
  const reversalShare = interruptionChange
    / Math.max(1, firstChange + interruptionChange + lastChange);

  return interruptionDistance <= distanceLimit
    && interruptionChange <= verticalLimit
    && reversalShare <= 0.18;
}

function mergeNearbyLegs(candidates: Candidate[], mergeGapDistance: number): Candidate[] {
  const merged = [...candidates];
  let index = 0;

  // A minor counter-slope is normally a shelf or rolling interruption inside
  // the same hill, even when it exceeds the fixed GPS-noise distance.
  while (index <= merged.length - 3) {
    const first = merged[index];
    const interruption = merged[index + 1];
    const last = merged[index + 2];

    if (
      first.kind === last.kind
      && isMinorCounterSlope(first, interruption, last, mergeGapDistance)
    ) {
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

/** Detects noteworthy, animation-friendly climbs and descents. */
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
    const minGrade = options.minAverageGrade ?? 0.03;
    const mergeGap = options.mergeGapDistance
      ?? clamp(runDistance * 0.025, 120, 350);

    const candidates = mergeNearbyLegs(findTrendLegs(samples), mergeGap);
    const includeDescents = options.includeDescents ?? true;
    sections.push(...candidates
      .filter((candidate) => {
        const distance = candidateDistance(candidate);
        const change = candidateChange(candidate);
        return (includeDescents || candidate.kind === 'climb')
          && distance >= minDistance
          && change >= minChange
          && change / distance >= minGrade;
      })
      .map(toSection)
      // A meaningful leg may contain shelves and small reversals, but its
      // direction should remain unmistakable. This keeps noisy rolling
      // terrain from producing arbitrary-looking focus moments.
      .filter((section) => {
        const totalMovement = section.elevationGain + section.elevationLoss;
        const dominantMovement = section.kind === 'climb'
          ? section.elevationGain
          : section.elevationLoss;
        return dominantMovement / Math.max(1, totalMovement) >= 0.72;
      }));
  });

  sections.sort((left, right) => left.startProgress - right.startProgress);

  // Leave enough playback between focus events to show the route overview.
  const totalDistance = points.reduce(
    (maximum, point) => Number.isFinite(point.distance) ? Math.max(maximum, point.distance) : maximum,
    0,
  );
  const overviewGap = options.minOverviewGap
    ?? clamp(totalDistance * 0.035, 800, 5_000);
  const maxSections = Math.max(1, Math.floor(options.maxSections ?? 4));
  const ranked = [...sections].sort((left, right) => sectionScore(right) - sectionScore(left));
  const selected: ElevationFocusSection[] = [];
  const canAdd = (candidate: ElevationFocusSection) => selected.every((existing) => {
    if (candidate.segmentIndex !== existing.segmentIndex) return true;
    return candidate.endDistance + overviewGap <= existing.startDistance
      || existing.endDistance + overviewGap <= candidate.startDistance;
  });
  const addFirstMatching = (predicate: (section: ElevationFocusSection) => boolean) => {
    const candidate = ranked.find((section) => predicate(section) && canAdd(section));
    if (candidate) selected.push(candidate);
  };

  // Anchor the edit with the strongest terrain moment, then reserve room for
  // the opposite direction when the route provides a separated one. This
  // keeps a mountainous route from becoming an all-climb or all-descent reel.
  const strongest = ranked[0];
  if (strongest) selected.push(strongest);
  if (strongest && maxSections > 1) {
    addFirstMatching((section) => section.kind !== strongest.kind);
  }
  ranked.forEach((section) => {
    if (selected.length >= maxSections || selected.includes(section) || !canAdd(section)) return;
    selected.push(section);
  });

  const capped = selected.sort((left, right) => left.startProgress - right.startProgress);

  return capped.map((section, index) => ({
    ...section,
    id: `elevation-${section.segmentIndex}-${section.kind}-${index + 1}`,
  }));
}
