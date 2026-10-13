import type { ElevationFocusSection } from './elevationSections';

export const ELEVATION_FOCUS_TRANSITION_MS = 700;

const MIN_PROGRESS_PADDING = 0.01;
const PROGRESS_PADDING_RATIO = 0.12;
const MIN_ELEVATION_PADDING = 5;
const ELEVATION_PADDING_RATIO = 0.12;
const FULL_RANGE_ELEVATION_PADDING_RATIO = 0.02;

export type DynamicElevationViewportMode =
  | 'overview'
  | 'transition-in'
  | 'focused'
  | 'transition-out';

export interface DynamicElevationViewportInput {
  currentTimeMs: number;
  totalDurationMs: number;
  fullElevationMin: number;
  fullElevationMax: number;
  sections: ElevationFocusSection[];
}

export interface DynamicElevationViewport {
  mode: DynamicElevationViewportMode;
  progressDomain: [number, number];
  elevationDomain: [number, number];
  focusAmount: number;
  activeSection: ElevationFocusSection | null;
}

interface FocusGroup {
  sections: ElevationFocusSection[];
  startProgress: number;
  endProgress: number;
  minElevation: number;
  maxElevation: number;
  startTimeMs: number;
  endTimeMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function interpolate(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function interpolateDomain(
  from: [number, number],
  to: [number, number],
  amount: number,
): [number, number] {
  return [
    interpolate(from[0], to[0], amount),
    interpolate(from[1], to[1], amount),
  ];
}

function normalizeFullElevationDomain(
  first: number,
  second: number,
): [number, number] {
  const safeFirst = Number.isFinite(first) ? first : 0;
  const safeSecond = Number.isFinite(second) ? second : safeFirst;
  return safeFirst <= safeSecond
    ? [safeFirst, safeSecond]
    : [safeSecond, safeFirst];
}

function normalizeSections(
  sections: ElevationFocusSection[],
): ElevationFocusSection[] {
  return sections
    .filter((section) => (
      Number.isFinite(section.startProgress)
      && Number.isFinite(section.endProgress)
      && Number.isFinite(section.minElevation)
      && Number.isFinite(section.maxElevation)
      && section.endProgress >= section.startProgress
    ))
    .map((section) => ({
      ...section,
      startProgress: clamp(section.startProgress, 0, 1),
      endProgress: clamp(section.endProgress, 0, 1),
      minElevation: Math.min(section.minElevation, section.maxElevation),
      maxElevation: Math.max(section.minElevation, section.maxElevation),
    }))
    .filter((section) => section.endProgress >= section.startProgress)
    .sort((left, right) => (
      left.startProgress - right.startProgress
      || left.endProgress - right.endProgress
    ));
}

function buildFocusGroups(
  sections: ElevationFocusSection[],
  totalDurationMs: number,
): FocusGroup[] {
  const groups: FocusGroup[] = [];

  for (const section of normalizeSections(sections)) {
    const startTimeMs = section.startProgress * totalDurationMs;
    const endTimeMs = section.endProgress * totalDurationMs;
    const previous = groups[groups.length - 1];

    // If the outgoing and incoming transitions would overlap, keep one stable
    // viewport around both sections. Never bridge distinct route segments.
    if (
      previous
      && previous.sections[previous.sections.length - 1].segmentIndex === section.segmentIndex
      && startTimeMs - previous.endTimeMs <= ELEVATION_FOCUS_TRANSITION_MS * 2
    ) {
      previous.sections.push(section);
      previous.startProgress = Math.min(previous.startProgress, section.startProgress);
      previous.endProgress = Math.max(previous.endProgress, section.endProgress);
      previous.minElevation = Math.min(previous.minElevation, section.minElevation);
      previous.maxElevation = Math.max(previous.maxElevation, section.maxElevation);
      previous.endTimeMs = Math.max(previous.endTimeMs, endTimeMs);
      continue;
    }

    groups.push({
      sections: [section],
      startProgress: section.startProgress,
      endProgress: section.endProgress,
      minElevation: section.minElevation,
      maxElevation: section.maxElevation,
      startTimeMs,
      endTimeMs,
    });
  }

  return groups;
}

function getFocusedDomains(
  group: FocusGroup,
  fullElevationDomain: [number, number],
): {
  progress: [number, number];
  elevation: [number, number];
} {
  const progressSpan = group.endProgress - group.startProgress;
  const progressPadding = Math.max(
    MIN_PROGRESS_PADDING,
    progressSpan * PROGRESS_PADDING_RATIO,
  );

  const elevationSpan = group.maxElevation - group.minElevation;
  const fullElevationSpan = fullElevationDomain[1] - fullElevationDomain[0];
  const elevationPadding = Math.max(
    MIN_ELEVATION_PADDING,
    elevationSpan * ELEVATION_PADDING_RATIO,
    fullElevationSpan * FULL_RANGE_ELEVATION_PADDING_RATIO,
  );

  return {
    progress: [
      clamp(group.startProgress - progressPadding, 0, 1),
      clamp(group.endProgress + progressPadding, 0, 1),
    ],
    elevation: [
      clamp(
        group.minElevation - elevationPadding,
        fullElevationDomain[0],
        fullElevationDomain[1],
      ),
      clamp(
        group.maxElevation + elevationPadding,
        fullElevationDomain[0],
        fullElevationDomain[1],
      ),
    ],
  };
}

function getActiveSection(
  group: FocusGroup,
  currentTimeMs: number,
  totalDurationMs: number,
): ElevationFocusSection {
  let closest = group.sections[0];
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const section of group.sections) {
    const startTimeMs = section.startProgress * totalDurationMs;
    const endTimeMs = section.endProgress * totalDurationMs;
    const distance = currentTimeMs < startTimeMs
      ? startTimeMs - currentTimeMs
      : currentTimeMs > endTimeMs
        ? currentTimeMs - endTimeMs
        : 0;

    if (distance < closestDistance) {
      closest = section;
      closestDistance = distance;
    }
  }

  return closest;
}

function overview(
  fullElevationDomain: [number, number],
): DynamicElevationViewport {
  return {
    mode: 'overview',
    progressDomain: [0, 1],
    elevationDomain: fullElevationDomain,
    focusAmount: 0,
    activeSection: null,
  };
}

/**
 * Plans the elevation profile viewport from output/playback time alone.
 * Calling this function with the same values always returns the same frame,
 * which keeps previews, scrubbing, and exported video in sync.
 */
export function getDynamicElevationViewport({
  currentTimeMs,
  totalDurationMs,
  fullElevationMin,
  fullElevationMax,
  sections,
}: DynamicElevationViewportInput): DynamicElevationViewport {
  const fullElevationDomain = normalizeFullElevationDomain(
    fullElevationMin,
    fullElevationMax,
  );

  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0 || sections.length === 0) {
    return overview(fullElevationDomain);
  }

  const safeCurrentTimeMs = clamp(
    Number.isFinite(currentTimeMs) ? currentTimeMs : 0,
    0,
    totalDurationMs,
  );
  const groups = buildFocusGroups(sections, totalDurationMs);
  const focusedGroup = [...groups].reverse().find((group) => (
    safeCurrentTimeMs >= group.startTimeMs
    && safeCurrentTimeMs <= group.endTimeMs
  ));
  const transitionGroups = groups
    .filter((group) => (
      safeCurrentTimeMs >= Math.max(
        0,
        group.startTimeMs - ELEVATION_FOCUS_TRANSITION_MS,
      )
      && safeCurrentTimeMs < Math.min(
        totalDurationMs,
        group.endTimeMs + ELEVATION_FOCUS_TRANSITION_MS,
      )
    ))
    .sort((left, right) => {
      const leftDistance = safeCurrentTimeMs < left.startTimeMs
        ? left.startTimeMs - safeCurrentTimeMs
        : safeCurrentTimeMs - left.endTimeMs;
      const rightDistance = safeCurrentTimeMs < right.startTimeMs
        ? right.startTimeMs - safeCurrentTimeMs
        : safeCurrentTimeMs - right.endTimeMs;
      return leftDistance - rightDistance || right.startTimeMs - left.startTimeMs;
    });
  const activeGroup = focusedGroup ?? transitionGroups[0];

  if (activeGroup) {
    const group = activeGroup;
    if (safeCurrentTimeMs === 0 && group.startTimeMs === 0) {
      return overview(fullElevationDomain);
    }
    const transitionInStartMs = Math.max(
      0,
      group.startTimeMs - ELEVATION_FOCUS_TRANSITION_MS,
    );
    const transitionOutEndMs = Math.min(
      totalDurationMs,
      group.endTimeMs + ELEVATION_FOCUS_TRANSITION_MS,
    );
    const transitionInEndMs = Math.min(
      group.endTimeMs,
      transitionInStartMs + ELEVATION_FOCUS_TRANSITION_MS,
    );

    const focusedDomains = getFocusedDomains(group, fullElevationDomain);
    const activeSection = getActiveSection(
      group,
      safeCurrentTimeMs,
      totalDurationMs,
    );

    let mode: DynamicElevationViewportMode;
    let focusAmount: number;

    if (safeCurrentTimeMs < transitionInEndMs) {
      mode = 'transition-in';
      const duration = transitionInEndMs - transitionInStartMs;
      focusAmount = duration > 0
        ? smoothstep((safeCurrentTimeMs - transitionInStartMs) / duration)
        : 1;
    } else if (safeCurrentTimeMs <= group.endTimeMs) {
      mode = 'focused';
      focusAmount = 1;
    } else {
      mode = 'transition-out';
      const duration = transitionOutEndMs - group.endTimeMs;
      focusAmount = duration > 0
        ? 1 - smoothstep((safeCurrentTimeMs - group.endTimeMs) / duration)
        : 0;
    }

    return {
      mode,
      progressDomain: interpolateDomain(
        [0, 1],
        focusedDomains.progress,
        focusAmount,
      ),
      elevationDomain: interpolateDomain(
        fullElevationDomain,
        focusedDomains.elevation,
        focusAmount,
      ),
      focusAmount,
      activeSection,
    };
  }

  return overview(fullElevationDomain);
}
