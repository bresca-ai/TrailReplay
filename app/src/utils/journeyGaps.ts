import type { GPXTrack, JourneySegment } from '@/types';
import { createTransportSegment } from '@/components/sidebar/journey/createTransportSegment';
import { calculateDistance } from './journeyUtils';

/** Two routes closer than this (end of one to start of the next) count as joined. */
export const JOINED_TRACKS_MAX_GAP_METERS = 100;

/** Metres between the end of `from` and the start of `to`, or null when either route is missing or empty. */
export function trackGapMeters(from: JourneySegment | undefined, to: JourneySegment | undefined, tracks: GPXTrack[]): number | null {
  if (from?.type !== 'track' || to?.type !== 'track') return null;
  const end = tracks.find((track) => track.id === from.trackId)?.points.at(-1);
  const start = tracks.find((track) => track.id === to.trackId)?.points[0];
  if (!end || !start) return null;
  return calculateDistance(end.lat, end.lon, start.lat, start.lon) * 1000;
}

/** True when two routes follow each other directly but don't join up. */
export function isUnjoinedTrackPair(from: JourneySegment | undefined, to: JourneySegment | undefined, tracks: GPXTrack[]): boolean {
  const gap = trackGapMeters(from, to, tracks);
  return gap !== null && gap > JOINED_TRACKS_MAX_GAP_METERS;
}

/**
 * Put a camera transition between consecutive routes that don't join up, so
 * the replay flies from one to the next instead of jumping. Returns the same
 * array when nothing needs adding.
 */
export function withGapCameraTransitions(segments: JourneySegment[], tracks: GPXTrack[]): JourneySegment[] {
  let result: JourneySegment[] | null = null;
  segments.forEach((segment, index) => {
    const next = segments[index + 1];
    (result ??= []).push(segment);
    if (!isUnjoinedTrackPair(segment, next, tracks) || segment.type !== 'track' || next?.type !== 'track') return;
    const end = tracks.find((track) => track.id === segment.trackId)!.points.at(-1)!;
    const start = tracks.find((track) => track.id === next.trackId)!.points[0];
    result.push(createTransportSegment('camera', { lat: end.lat, lon: end.lon }, { lat: start.lat, lon: start.lon }));
  });
  return result && (result as JourneySegment[]).length !== segments.length ? result : segments;
}
