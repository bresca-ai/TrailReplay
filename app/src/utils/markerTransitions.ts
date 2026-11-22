import type { GPXTrack, JourneySegment, RouteTimingMode, TextAnnotation } from '@/types';
import { annotationExtraTime } from './annotationTiming';
import { buildComputedJourney, TRANSPORT_MARKERS, uniformJourneyWithCameraTransitions, uniformJourneyWithTransportDurations } from './journeyUtils';

/**
 * When the 3D marker changes model between two journey segments (runner → bus,
 * bus → bike…), the person gets off, stands in a neutral pose, and gets on the
 * next model. Playback holds at the boundary for as long as both clips last,
 * using the same slowdown curve as route annotations so live playback, the
 * media timeline and video export all agree.
 */

export type MarkerTransitionGroup = 'foot' | 'ride' | 'climb' | 'swim' | 'glide';

/** Choreography group per 3D marker; models without an entry never transition. */
export const MARKER_TRANSITION_GROUPS: Record<string, MarkerTransitionGroup> = {
  '3d-runner': 'foot', '3d-road-runner': 'foot', '3d-trail-runner': 'foot', '3d-hiker': 'foot',
  '3d-road-bike': 'ride', '3d-gravel-bike': 'ride', '3d-mountain-bike': 'ride',
  '3d-motorbike': 'ride', '3d-race-motorbike': 'ride', '3d-motocross': 'ride',
  '3d-race-car': 'climb', '3d-rally': 'climb', '3d-bus': 'climb', '3d-train': 'climb',
  '3d-plane': 'climb', '3d-boat': 'climb', '3d-sailboat': 'climb', '3d-kayak': 'climb',
  '3d-swimmer': 'swim', '3d-paraglider': 'glide',
};

/**
 * Clip lengths in seconds (Get ready / Finish), matching the choreography in
 * `markerTransition3d`, which reads them from here.
 */
const CLIP_SECONDS: Record<string, { enter: number; exit: number }> = {
  '3d-road-bike': { enter: 4.3, exit: 4.4 }, '3d-gravel-bike': { enter: 4.3, exit: 4.4 }, '3d-mountain-bike': { enter: 3.7, exit: 4.0 },
  '3d-motorbike': { enter: 5.25, exit: 4.65 }, '3d-race-motorbike': { enter: 5.25, exit: 4.65 }, '3d-motocross': { enter: 5.25, exit: 4.65 },
  '3d-race-car': { enter: 3.7, exit: 4.0 }, '3d-rally': { enter: 3.8, exit: 4.15 },
  '3d-bus': { enter: 4.2, exit: 4.35 }, '3d-train': { enter: 4.3, exit: 4.4 }, '3d-plane': { enter: 4.8, exit: 5.15 },
  '3d-boat': { enter: 4.3, exit: 4.55 }, '3d-sailboat': { enter: 4.3, exit: 4.55 }, '3d-kayak': { enter: 4.45, exit: 4.75 },
  '3d-swimmer': { enter: 3.85, exit: 4.25 }, '3d-paraglider': { enter: 4.6, exit: 4.1 },
};

export function markerClipDurations(icon: string): { enter: number; exit: number } {
  if (MARKER_TRANSITION_GROUPS[icon] === 'foot') return { enter: 3.1, exit: 3.6 };
  return CLIP_SECONDS[icon] ?? { enter: 0, exit: 0 };
}

/** Clips play a little faster than the standalone previews so the hold stays short. */
export const MARKER_TRANSITION_SPEED = 1.15;

/** The user can stretch or squeeze the clips within these bounds (ms). */
export const MARKER_TRANSITION_MIN_MS = 2000;
export const MARKER_TRANSITION_MAX_MS = 20000;
export const clampTransitionDuration = (ms: number) => Math.round(Math.max(MARKER_TRANSITION_MIN_MS, Math.min(MARKER_TRANSITION_MAX_MS, ms)));
const defaultTransitionDuration = (exit: number, enter: number) => Math.round((exit + enter) / MARKER_TRANSITION_SPEED * 1000);

export function supportsMarkerTransition(icon: string | null | undefined): icon is string {
  return !!icon && icon in MARKER_TRANSITION_GROUPS;
}

export interface MarkerTransition {
  /** Stable id: the segment the marker transitions into. */
  id: string;
  segmentId: string;
  fromIcon: string;
  toIcon: string;
  /** Playback progress (0–1) of the boundary between the two segments. */
  progress: number;
  /** Output time the transition adds, in ms (the user's choice, or `defaultDuration`). */
  holdDuration: number;
  defaultDuration: number;
  /** Clip length in seconds: Finish of `fromIcon` then Get ready of `toIcon`. */
  exitSeconds: number;
  enterSeconds: number;
  /** Set when the user switched this transition off in the chronology. */
  skipped: boolean;
}

export interface MarkerTransitionInput {
  segments: JourneySegment[];
  tracks: GPXTrack[];
  routeTimingMode: RouteTimingMode;
  markerType: 'icon' | 'dot';
  comparisonActive: boolean;
}

function segmentIcon(segment: JourneySegment, tracks: GPXTrack[], markerType: 'icon' | 'dot'): string | null {
  if (segment.type === 'transport') return segment.mode === 'camera' ? null : TRANSPORT_MARKERS[segment.mode] ?? null;
  if (markerType !== 'icon') return null;
  return tracks.find((track) => track.id === segment.trackId)?.activityIcon ?? null;
}

let cache: { key: MarkerTransitionInput; result: MarkerTransition[] } | null = null;

/** Every model change in the journey, including ones the user switched off. */
export function computeMarkerTransitions(input: MarkerTransitionInput): MarkerTransition[] {
  if (cache && cache.key.segments === input.segments && cache.key.tracks === input.tracks && cache.key.routeTimingMode === input.routeTimingMode
    && cache.key.markerType === input.markerType && cache.key.comparisonActive === input.comparisonActive) return cache.result;
  const result = buildTransitions(input);
  cache = { key: input, result };
  return result;
}

function buildTransitions({ segments, tracks, routeTimingMode, markerType, comparisonActive }: MarkerTransitionInput): MarkerTransition[] {
  if (comparisonActive || segments.length < 2) return [];
  const base = buildComputedJourney(segments, tracks);
  if (!base) return [];
  const hasCamera = segments.some((segment) => segment.type === 'transport' && segment.mode === 'camera');
  const hasTransport = segments.some((segment) => segment.type === 'transport' && segment.mode !== 'camera');
  const journey = routeTimingMode === 'uniform' && hasTransport ? uniformJourneyWithTransportDurations(base)
    : routeTimingMode === 'uniform' && hasCamera ? uniformJourneyWithCameraTransitions(base) : base;
  const mode = (hasCamera || hasTransport) && routeTimingMode === 'uniform' ? 'recorded' : routeTimingMode;

  const transitions: MarkerTransition[] = [];
  let previous: string | null = null;
  segments.forEach((segment) => {
    // Camera moves between routes carry no marker: pair the routes either side of them.
    if (segment.type === 'transport' && segment.mode === 'camera') return;
    const icon = segmentIcon(segment, tracks, markerType);
    const timing = journey.segmentTimings.find((entry) => entry.segmentId === segment.id);
    if (previous && icon && timing && previous !== icon && supportsMarkerTransition(previous) && supportsMarkerTransition(icon)) {
      const exit = markerClipDurations(previous).exit, enter = markerClipDurations(icon).enter;
      transitions.push({
        id: `marker-transition:${segment.id}`,
        segmentId: segment.id,
        fromIcon: previous,
        toIcon: icon,
        progress: mode === 'uniform' ? timing.distanceStartRatio : timing.progressStartRatio,
        holdDuration: clampTransitionDuration(segment.markerTransitionDuration ?? defaultTransitionDuration(exit, enter)),
        defaultDuration: defaultTransitionDuration(exit, enter),
        exitSeconds: exit,
        enterSeconds: enter,
        skipped: !!segment.skipMarkerTransition,
      });
    }
    previous = icon;
  });
  return transitions;
}

/** The transitions that play, as timing moments the annotation hold maths understands. */
export function markerTransitionHolds(transitions: MarkerTransition[]): TextAnnotation[] {
  return transitions.filter((transition) => !transition.skipped).map((transition) => ({
    id: transition.id,
    progress: transition.progress,
    holdDuration: transition.holdDuration,
    lat: 0, lon: 0, title: '', color: '',
    presentation: 'side-panel',
  } as unknown as TextAnnotation));
}

/** Read the transition holds straight from the store state (playback loop, export). */
export function markerTransitionHoldsForState(state: {
  journeySegments: JourneySegment[]; tracks: GPXTrack[]; playback: { routeTimingMode: RouteTimingMode };
  settings: { trailStyle: { markerType: 'icon' | 'dot' } };
  comparisonTracks: { visible: boolean }[];
}): TextAnnotation[] {
  return markerTransitionHolds(computeMarkerTransitions({
    segments: state.journeySegments,
    tracks: state.tracks,
    routeTimingMode: state.playback.routeTimingMode,
    markerType: state.settings.trailStyle.markerType,
    comparisonActive: state.comparisonTracks.some((track) => track.visible),
  }));
}

/** Same half-width as the annotation slowdown in `annotationTiming`. */
const HOLD_APPROACH_MS = 500;

/**
 * The transition playing at this route time, and how far into its clips it is.
 * The hold spreads the clips over output time, so the clip clock is the output
 * time elapsed since the slowdown began, scaled to the clip length.
 */
export function activeMarkerTransition(transitions: MarkerTransition[], routeTimeMs: number, totalDurationMs: number): { transition: MarkerTransition; clipSeconds: number } | null {
  if (!totalDurationMs) return null;
  for (const transition of transitions) {
    if (transition.skipped) continue;
    const arrival = transition.progress * totalDurationMs;
    const start = Math.max(0, arrival - HOLD_APPROACH_MS), end = Math.min(totalDurationMs, arrival + HOLD_APPROACH_MS);
    if (routeTimeMs < start || routeTimeMs > end || end <= start) continue;
    const [hold] = markerTransitionHolds([transition]);
    const elapsed = (routeTimeMs - start) + annotationExtraTime(routeTimeMs, totalDurationMs, [hold]);
    const k = Math.max(0, Math.min(1, elapsed / transition.holdDuration));
    return { transition, clipSeconds: k * (transition.exitSeconds + transition.enterSeconds) };
  }
  return null;
}
