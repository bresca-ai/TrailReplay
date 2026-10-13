import type { ElevationFocusSection } from './elevationSections';

// Give the profile enough screen time to read as a camera move instead of a
// viewBox cut. This duration is expressed in the authored/output timeline, so
// Studio captures the same intermediate zoom frames as live playback.
export const ELEVATION_FOCUS_TRANSITION_MS = 1_800;

// Keep the original chapter grouping tolerance independent from the camera
// move duration. Otherwise a longer, nicer zoom would merge unrelated nearby
// sections into one focus group and remove their individual reveals.
const ELEVATION_FOCUS_GROUP_MERGE_GAP_MS = 1_400;

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

interface FocusGroupWindow {
  group: FocusGroup;
  transitionInStartMs: number;
  transitionOutEndMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cinematicEase(value: number): number {
  const clamped = clamp(value, 0, 1);
  // Smootherstep has zero velocity and acceleration at both ends. That makes
  // the profile settle naturally before metrics appear and before it returns
  // to the overview.
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function interpolate(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function interpolateDomain(
  from: [number, number],
  to: [number, number],
  amount: number,
): [number, number] {
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  const fromSpan = from[1] - from[0];
  const toSpan = to[1] - to[0];
  if (fromSpan <= 0 || toSpan <= 0) return to;

  const fromCenter = (from[0] + from[1]) / 2;
  const toCenter = (to[0] + to[1]) / 2;
  const center = interpolate(fromCenter, toCenter, amount);
  // Interpolate scale geometrically, as a camera zoom would. Interpolating
  // the rectangle edges linearly makes the apparent scale rush at the end.
  const span = fromSpan * ((toSpan / fromSpan) ** amount);
  return [center - span / 2, center + span / 2];
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
      && startTimeMs - previous.endTimeMs <= ELEVATION_FOCUS_GROUP_MERGE_GAP_MS
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

function buildFocusGroupWindows(
  groups: FocusGroup[],
  totalDurationMs: number,
): FocusGroupWindow[] {
  return groups.map((group, index) => {
    const next = groups[index + 1];
    const transitionInStartMs = group.startTimeMs;
    let transitionOutEndMs = Math.min(
      totalDurationMs,
      group.endTimeMs + ELEVATION_FOCUS_TRANSITION_MS,
    );

    // Finish the previous zoom-out before the following section starts. The
    // next push-in always begins from the complete profile at its own start.
    if (next) {
      transitionOutEndMs = Math.min(
        transitionOutEndMs,
        Math.max(group.endTimeMs, next.startTimeMs),
      );
    }

    return { group, transitionInStartMs, transitionOutEndMs };
  });
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
  const windows = buildFocusGroupWindows(groups, totalDurationMs);
  const focusedWindow = [...windows].reverse().find(({ group }) => (
    safeCurrentTimeMs >= group.startTimeMs
    && safeCurrentTimeMs <= group.endTimeMs
  ));
  const transitionWindows = windows
    .filter(({ transitionInStartMs, transitionOutEndMs }) => (
      safeCurrentTimeMs >= transitionInStartMs
      && safeCurrentTimeMs < transitionOutEndMs
    ))
    .sort((left, right) => {
      const leftDistance = safeCurrentTimeMs < left.group.startTimeMs
        ? left.group.startTimeMs - safeCurrentTimeMs
        : safeCurrentTimeMs - left.group.endTimeMs;
      const rightDistance = safeCurrentTimeMs < right.group.startTimeMs
        ? right.group.startTimeMs - safeCurrentTimeMs
        : safeCurrentTimeMs - right.group.endTimeMs;
      return leftDistance - rightDistance || right.group.startTimeMs - left.group.startTimeMs;
    });
  const activeWindow = focusedWindow ?? transitionWindows[0];

  if (activeWindow) {
    const { group, transitionInStartMs, transitionOutEndMs } = activeWindow;
    if (safeCurrentTimeMs === 0 && group.startTimeMs === 0) {
      return overview(fullElevationDomain);
    }
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
        ? cinematicEase((safeCurrentTimeMs - transitionInStartMs) / duration)
        : 1;
    } else if (safeCurrentTimeMs <= group.endTimeMs) {
      mode = 'focused';
      focusAmount = 1;
    } else {
      mode = 'transition-out';
      const duration = transitionOutEndMs - group.endTimeMs;
      focusAmount = duration > 0
        ? 1 - cinematicEase((safeCurrentTimeMs - group.endTimeMs) / duration)
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
