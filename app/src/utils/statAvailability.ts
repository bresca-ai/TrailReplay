import type { GPXTrack, StatId } from '@/types';

/** Stats that can only be answered from recorded timestamps. */
export const TIME_DEPENDENT_STATS: readonly StatId[] = ['duration', 'movingDuration', 'pace', 'speed'];

export interface StatAvailability {
  hasRecordedTime: boolean;
  hasHeartRate: boolean;
}

export function getStatAvailability(tracks: GPXTrack[]): StatAvailability {
  return {
    hasRecordedTime: tracks.some((track) => track.points.some((point) => point.time !== null)),
    hasHeartRate: tracks.some((track) => track.points.some((point) => point.heartRate !== null)),
  };
}

/**
 * Whether the loaded routes carry what this stat is derived from. Elevation
 * is always considered answerable: a track with no `<ele>` reads as zero
 * rather than as absent, and a genuinely sea-level route would be wrongly
 * ruled out by guessing from the values.
 */
export function isStatAvailable(id: StatId, availability: StatAvailability): boolean {
  if (TIME_DEPENDENT_STATS.includes(id)) return availability.hasRecordedTime;
  if (id === 'heartRate') return availability.hasHeartRate;
  return true;
}

/**
 * Drops the stats a route has no answer for. Without timestamps duration
 * sits at 0:00 and pace at --:--, and without a sensor heart rate never
 * fills in, which reads as a broken overlay rather than as data the file
 * never carried.
 */
export function getAvailableStats(visibleStats: StatId[], tracks: GPXTrack[]): StatId[] {
  const availability = getStatAvailability(tracks);
  return visibleStats.filter((id) => isStatAvailable(id, availability));
}
