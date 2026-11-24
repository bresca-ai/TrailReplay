import type { GPXTrack, JourneySegment, RouteTimingMode, TextAnnotation, UnitSystem } from '@/types';
import { buildComputedJourney, uniformJourneyWithCameraTransitions, uniformJourneyWithTransportDurations } from './journeyUtils';
import { formatDistance, formatElevation } from './units';

/** Locate the start of a specific journey segment, including repeated tracks. */
export function routeSectionStart(segments: JourneySegment[], tracks: GPXTrack[], mode: RouteTimingMode, segmentId: string) {
  const base = buildComputedJourney(segments, tracks);
  if (!base) return null;
  const hasTransport = segments.some(segment => segment.type === 'transport' && segment.mode !== 'camera');
  const hasCamera = segments.some(segment => segment.type === 'transport' && segment.mode === 'camera');
  const journey = mode === 'uniform' && hasTransport ? uniformJourneyWithTransportDurations(base)
    : mode === 'uniform' && hasCamera ? uniformJourneyWithCameraTransitions(base) : base;
  const timing = journey.segmentTimings.find(segment => segment.segmentId === segmentId && segment.type === 'track');
  if (!timing) return null;
  return {
    progress: mode === 'uniform' && !hasTransport && !hasCamera ? timing.distanceStartRatio : timing.progressStartRatio,
    routeDistance: timing.startDistance,
  };
}

export function createRouteSectionAnnotation({ id, segmentId, segments, tracks, mode, unitSystem, eyebrow }: {
  id: string; segmentId: string; segments: JourneySegment[]; tracks: GPXTrack[];
  mode: RouteTimingMode; unitSystem: UnitSystem; eyebrow: string;
}): TextAnnotation | null {
  const segment = segments.find(item => item.id === segmentId);
  if (!segment || segment.type !== 'track') return null;
  const track = tracks.find(item => item.id === segment.trackId);
  const start = routeSectionStart(segments, tracks, mode, segmentId);
  const point = track?.points[0];
  if (!track || !start || !point) return null;
  return {
    id, ...start, routeSectionSegmentId: segmentId,
    lat: point.lat, lon: point.lon, elevation: point.elevation,
    title: track.name, eyebrow, meta: `${formatDistance(track.totalDistance, unitSystem)} · ↑ ${formatElevation(track.elevationGain, unitSystem)}`,
    color: track.color, displayDuration: 4000, presentation: 'side-panel', logo: 'map:pin',
  };
}
