import type { GPXTrack, Journey, JourneySegment, SocialShareSettings, UnitSystem } from '@/types';

export interface ElevationStats {
  profile: Array<{ x: number; y: number }>;
  minElev: number;
  maxElev: number;
}

export interface SocialShareSummaryData {
  title: string;
  locationLabel: string;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number;
  elevation: ElevationStats;
  unitSystem: UnitSystem;
}

export function buildSocialShareSummary(
  settings: SocialShareSettings,
  tracks: GPXTrack[],
  activeTrackId: string | null,
  journey: Journey | null,
  journeySegments: JourneySegment[],
  unitSystem: UnitSystem,
): SocialShareSummaryData {
  let title = settings.customTitle;
  if (settings.titleMode !== 'custom') {
    title = (settings.titleMode === 'journey-name' && journey?.name)
      ? journey.name
      : (tracks.find((t) => t.id === activeTrackId) ?? tracks[0])?.name ?? '';
  }

  let distanceMeters = 0;
  let durationSeconds = 0;
  let elevationGainMeters = 0;
  let primaryTrack: GPXTrack | undefined;

  if (journey && journeySegments.length > 0) {
    primaryTrack = tracks[0];
    for (const seg of journeySegments) {
      if (seg.type !== 'track') continue;
      const track = tracks.find((t) => t.id === seg.trackId);
      if (!track) continue;
      distanceMeters += track.totalDistance;
      durationSeconds += track.totalTime || track.movingTime;
      elevationGainMeters += track.elevationGain;
    }
  } else {
    primaryTrack = tracks.find((t) => t.id === activeTrackId) ?? tracks[0];
    if (primaryTrack) {
      distanceMeters = primaryTrack.totalDistance;
      durationSeconds = primaryTrack.totalTime || primaryTrack.movingTime;
      elevationGainMeters = primaryTrack.elevationGain;
    }
  }

  return {
    title,
    locationLabel: settings.locationLabel,
    distanceMeters,
    durationSeconds,
    elevationGainMeters,
    elevation: buildElevationStats(primaryTrack),
    unitSystem,
  };
}

function buildElevationStats(track: GPXTrack | undefined): ElevationStats {
  if (!track || track.points.length < 2) return { profile: [], minElev: 0, maxElev: 0 };

  const N = Math.min(80, track.points.length);
  const step = track.points.length / N;
  let minElev = Infinity;
  let maxElev = -Infinity;

  const sampled: number[] = [];
  for (let i = 0; i < N; i++) {
    const elev = track.points[Math.floor(i * step)].elevation;
    sampled.push(elev);
    if (elev < minElev) minElev = elev;
    if (elev > maxElev) maxElev = elev;
  }

  const elevRange = maxElev - minElev || 1;
  return {
    profile: sampled.map((elev, i) => ({
      x: i / (N - 1),
      y: (elev - minElev) / elevRange,
    })),
    minElev,
    maxElev,
  };
}
