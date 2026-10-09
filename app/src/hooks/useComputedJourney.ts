import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  buildComputedJourney,
  buildJourneyDistanceProfile,
  calculateBearing,
  getBearingAtProgress,
  getBearingAtDistance,
  getCompletedCoordinates,
  getCompletedCoordinatesAtDistance,
  getJourneyDistanceAtProgress,
  getJourneyElevationData,
  getJourneyPointAtDistance,
  getJourneyPointAtProgress,
  getSegmentAtDistance,
  getSegmentAtProgress,
  getAllJourneyCoordinates,
  TRANSPORT_ICONS,
  type ComputedJourney,
  type JourneyDistanceProfile,
  type JourneyPoint,
  type SegmentTiming,
} from '@/utils/journeyUtils';
import { DEFAULT_ACTIVITY_ICON } from '@/utils/activityIcons';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import type { GPXTrack, JourneySegment, RouteTimingMode } from '@/types';

const computedJourneyCache = new WeakMap<
  JourneySegment[],
  WeakMap<GPXTrack[], ComputedJourney | null>
>();
const journeyGeometryCache = new WeakMap<GPXTrack[], Map<string, ComputedJourney['coordinates']>>();
const distanceProfileCache = new WeakMap<ComputedJourney['coordinates'], JourneyDistanceProfile | null>();
const journeyCoordinatesCache = new WeakMap<ComputedJourney['coordinates'], number[][]>();
const trackCoordinatesCache = new WeakMap<GPXTrack, number[][]>();
const journeyElevationCache = new WeakMap<ComputedJourney, Map<RouteTimingMode, ReturnType<typeof getJourneyElevationData>>>();
const trackElevationCache = new WeakMap<GPXTrack, ReturnType<typeof buildTrackElevationData>>();
const journeyCameraPathCache = new WeakMap<ComputedJourney, Map<RouteTimingMode, number[][]>>();
const trackCameraPathCache = new WeakMap<GPXTrack, number[][]>();

function getCachedComputedJourney(journeySegments: JourneySegment[], tracks: GPXTrack[]) {
  let tracksCache = computedJourneyCache.get(journeySegments);
  if (!tracksCache) {
    tracksCache = new WeakMap();
    computedJourneyCache.set(journeySegments, tracksCache);
  }
  if (!tracksCache.has(tracks)) {
    let computedJourney = buildComputedJourney(journeySegments, tracks);
    if (computedJourney) {
      const geometryKey = journeySegments.map((segment) => segment.type === 'track'
        ? `track:${segment.id}:${segment.trackId}`
        : [
            'transport', segment.id, segment.mode,
            segment.from.lat, segment.from.lon, segment.to.lat, segment.to.lon,
          ].join(':')).join('|');
      let geometryCache = journeyGeometryCache.get(tracks);
      if (!geometryCache) {
        geometryCache = new Map();
        journeyGeometryCache.set(tracks, geometryCache);
      }
      const cachedCoordinates = geometryCache.get(geometryKey);
      if (cachedCoordinates) {
        computedJourney = { ...computedJourney, coordinates: cachedCoordinates };
      } else {
        geometryCache.set(geometryKey, computedJourney.coordinates);
      }
    }
    tracksCache.set(tracks, computedJourney);
  }
  return tracksCache.get(tracks) ?? null;
}

function getCachedDistanceProfile(computedJourney: ComputedJourney) {
  if (!distanceProfileCache.has(computedJourney.coordinates)) {
    distanceProfileCache.set(
      computedJourney.coordinates,
      buildJourneyDistanceProfile(computedJourney.coordinates),
    );
  }
  return distanceProfileCache.get(computedJourney.coordinates) ?? null;
}

function getCachedJourneyCoordinates(computedJourney: ComputedJourney) {
  let coordinates = journeyCoordinatesCache.get(computedJourney.coordinates);
  if (!coordinates) {
    coordinates = getAllJourneyCoordinates(computedJourney.coordinates);
    journeyCoordinatesCache.set(computedJourney.coordinates, coordinates);
  }
  return coordinates;
}

function getCachedTrackCoordinates(track: GPXTrack) {
  let coordinates = trackCoordinatesCache.get(track);
  if (!coordinates) {
    coordinates = track.points.map((point) => [point.lon, point.lat]);
    trackCoordinatesCache.set(track, coordinates);
  }
  return coordinates;
}

function buildTrackElevationData(track: GPXTrack) {
  return track.points.map((point, index) => ({
    distance: point.distance,
    elevation: point.elevation,
    progress: index / (track.points.length - 1),
    segmentIndex: 0,
    segmentType: 'track' as const,
  }));
}

function getCachedElevationData(
  computedJourney: ComputedJourney | null,
  activeTrack: GPXTrack | undefined,
  routeTimingMode: RouteTimingMode,
) {
  if (!computedJourney) {
    if (!activeTrack) return [];
    let elevationData = trackElevationCache.get(activeTrack);
    if (!elevationData) {
      elevationData = buildTrackElevationData(activeTrack);
      trackElevationCache.set(activeTrack, elevationData);
    }
    return elevationData;
  }

  let timingCache = journeyElevationCache.get(computedJourney);
  if (!timingCache) {
    timingCache = new Map();
    journeyElevationCache.set(computedJourney, timingCache);
  }
  let elevationData = timingCache.get(routeTimingMode);
  if (!elevationData) {
    elevationData = getJourneyElevationData(
      computedJourney.coordinates,
      computedJourney.segmentTimings,
      routeTimingMode,
    );
    timingCache.set(routeTimingMode, elevationData);
  }
  return elevationData;
}

const CAMERA_PATH_SAMPLE_COUNT = 601;

function getCachedCameraPath(
  computedJourney: ComputedJourney | null,
  journeyDistanceProfile: JourneyDistanceProfile | null,
  activeTrack: GPXTrack | undefined,
  routeTimingMode: RouteTimingMode,
) {
  if (!computedJourney) {
    if (!activeTrack || activeTrack.points.length === 0) return [];
    let coordinates = trackCameraPathCache.get(activeTrack);
    if (!coordinates) {
      coordinates = Array.from({ length: CAMERA_PATH_SAMPLE_COUNT }, (_, index) => {
        const progress = index / (CAMERA_PATH_SAMPLE_COUNT - 1);
        const point = interpolateTrackPoint(activeTrack, activeTrack.totalDistance * progress);
        return point ? [point.lon, point.lat] : [];
      }).filter((coordinate) => coordinate.length === 2);
      trackCameraPathCache.set(activeTrack, coordinates);
    }
    return coordinates;
  }

  let timingCache = journeyCameraPathCache.get(computedJourney);
  if (!timingCache) {
    timingCache = new Map();
    journeyCameraPathCache.set(computedJourney, timingCache);
  }
  let coordinates = timingCache.get(routeTimingMode);
  if (!coordinates) {
    coordinates = Array.from({ length: CAMERA_PATH_SAMPLE_COUNT }, (_, index) => {
      const progress = index / (CAMERA_PATH_SAMPLE_COUNT - 1);
      const point = routeTimingMode === 'uniform' && journeyDistanceProfile
        ? getJourneyPointAtDistance(
            journeyDistanceProfile,
            journeyDistanceProfile.totalDistance * progress,
          )
        : getJourneyPointAtProgress(
            progress,
            computedJourney.coordinates,
            computedJourney.segmentTimings,
          );
      return point ? [point.lon, point.lat] : [];
    }).filter((coordinate) => coordinate.length === 2);
    timingCache.set(routeTimingMode, coordinates);
  }
  return coordinates;
}

/**
 * Hook that provides computed journey data for multi-track animations
 */
export function useComputedJourney() {
  const tracks = useAppStore((state) => state.tracks);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const activeTrackId = useAppStore((state) => state.activeTrackId);
  const playback = useAppStore((state) => state.playback);
  const routeTimingMode = playback.routeTimingMode;

  // Build the computed journey whenever segments or tracks change
  const computedJourney = useMemo<ComputedJourney | null>(() => {
    return getCachedComputedJourney(journeySegments, tracks);
  }, [journeySegments, tracks]);

  // Get active track for single-track mode
  const activeTrack = useMemo(() => {
    return tracks.find((t) => t.id === activeTrackId);
  }, [tracks, activeTrackId]);

  const journeyDistanceProfile = useMemo<JourneyDistanceProfile | null>(() => {
    if (!computedJourney) return null;
    return getCachedDistanceProfile(computedJourney);
  }, [computedJourney]);

  const routeDistance = useMemo(() => {
    if (computedJourney && journeyDistanceProfile) {
      if (routeTimingMode === 'uniform') {
        return journeyDistanceProfile.totalDistance * playback.progress;
      }

      return getJourneyDistanceAtProgress(
        playback.progress,
        journeyDistanceProfile,
        computedJourney.segmentTimings
      );
    }

    if (activeTrack) {
      return activeTrack.totalDistance * playback.progress;
    }

    return 0;
  }, [activeTrack, computedJourney, journeyDistanceProfile, playback.progress, routeTimingMode]);

  // Determine if we're in journey mode (multiple segments) or single track mode
  const isJourneyMode = journeySegments.length > 1 ||
    (journeySegments.length === 1 && computedJourney !== null);

  // Get current position based on progress
  const currentPosition = useMemo<JourneyPoint | null>(() => {
    if (!computedJourney) {
      // Fall back to single track mode
      if (!activeTrack || activeTrack.points.length === 0) return null;

      const targetDistance = routeDistance;
      if (routeTimingMode === 'uniform') {
        const point = interpolateTrackPoint(activeTrack, targetDistance);
        if (!point) return null;

        return {
          ...point,
          segmentIndex: 0,
          segmentType: 'track' as const,
          trackId: activeTrack.id,
        };
      }

      let pointIndex = 0;

      for (let i = 0; i < activeTrack.points.length; i++) {
        if (activeTrack.points[i].distance >= targetDistance) {
          pointIndex = i;
          break;
        }
        pointIndex = i;
      }

      const point = activeTrack.points[pointIndex];
      return {
        ...point,
        segmentIndex: 0,
        segmentType: 'track' as const,
        trackId: activeTrack.id,
      };
    }

    if (routeTimingMode === 'uniform' && journeyDistanceProfile) {
      return getJourneyPointAtDistance(journeyDistanceProfile, routeDistance);
    }

    return getJourneyPointAtProgress(
      playback.progress,
      computedJourney.coordinates,
      computedJourney.segmentTimings
    );
  }, [computedJourney, activeTrack, journeyDistanceProfile, playback.progress, routeDistance, routeTimingMode]);

  // Get current bearing
  const currentBearing = useMemo<number>(() => {
    if (!computedJourney) {
      // Fall back to single track bearing calculation
      if (!activeTrack || activeTrack.points.length < 2) return 0;

      if (routeTimingMode === 'uniform') {
        const current = interpolateTrackPoint(activeTrack, routeDistance);
        const next = interpolateTrackPoint(
          activeTrack,
          Math.min(routeDistance + Math.max(activeTrack.totalDistance * 0.01, 10), activeTrack.totalDistance)
        );

        if (!current || !next) return 0;

        return calculateBearing(
          { lat: current.lat, lon: current.lon },
          { lat: next.lat, lon: next.lon }
        );
      }

      const pointIndex = Math.floor(playback.progress * (activeTrack.points.length - 1));
      const lookAhead = Math.min(10, activeTrack.points.length - pointIndex - 1);
      const nextIndex = pointIndex + lookAhead;

      const current = activeTrack.points[pointIndex];
      const next = activeTrack.points[nextIndex];

      if (!current || !next) return 0;

      const lat1 = (current.lat * Math.PI) / 180;
      const lat2 = (next.lat * Math.PI) / 180;
      const lon1 = (current.lon * Math.PI) / 180;
      const lon2 = (next.lon * Math.PI) / 180;

      const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
      const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

      const bearing = (Math.atan2(y, x) * 180) / Math.PI;
      return (bearing + 360) % 360;
    }

    if (routeTimingMode === 'uniform' && journeyDistanceProfile) {
      return getBearingAtDistance(journeyDistanceProfile, routeDistance);
    }

    return getBearingAtProgress(
      playback.progress,
      computedJourney.coordinates,
      computedJourney.segmentTimings
    );
  }, [computedJourney, activeTrack, journeyDistanceProfile, playback.progress, routeDistance, routeTimingMode]);

  // Get current segment info
  const currentSegment = useMemo<{ segment: SegmentTiming; localProgress: number } | null>(() => {
    if (!computedJourney) return null;
    if (routeTimingMode === 'uniform' && journeyDistanceProfile) {
      return getSegmentAtDistance(journeyDistanceProfile, routeDistance, computedJourney.segmentTimings);
    }
    return getSegmentAtProgress(playback.progress, computedJourney.segmentTimings);
  }, [computedJourney, journeyDistanceProfile, playback.progress, routeDistance, routeTimingMode]);

  // Get completed coordinates for trail rendering
  const completedCoordinates = useMemo<number[][]>(() => {
    if (!computedJourney) {
      // Fall back to single track
      if (!activeTrack) return [];

      const targetDistance = routeDistance;
      const completed: number[][] = [];

      for (const point of activeTrack.points) {
        if (point.distance <= targetDistance) {
          completed.push([point.lon, point.lat]);
        } else {
          break;
        }
      }

      if (routeTimingMode === 'uniform') {
        const currentPoint = interpolateTrackPoint(activeTrack, targetDistance);
        if (
          currentPoint &&
          (completed.length === 0 ||
            completed[completed.length - 1][0] !== currentPoint.lon ||
            completed[completed.length - 1][1] !== currentPoint.lat)
        ) {
          completed.push([currentPoint.lon, currentPoint.lat]);
        }
      }

      return completed;
    }

    if (routeTimingMode === 'uniform' && journeyDistanceProfile) {
      return getCompletedCoordinatesAtDistance(journeyDistanceProfile, routeDistance);
    }

    return getCompletedCoordinates(
      playback.progress,
      computedJourney.coordinates,
      computedJourney.segmentTimings
    );
  }, [computedJourney, activeTrack, journeyDistanceProfile, playback.progress, routeDistance, routeTimingMode]);

  // Get all journey coordinates for the full trail line
  const allCoordinates = useMemo<number[][]>(() => {
    if (!computedJourney) return activeTrack ? getCachedTrackCoordinates(activeTrack) : [];
    return getCachedJourneyCoordinates(computedJourney);
  }, [computedJourney, activeTrack]);

  // Camera prediction must follow replay time, not raw GPX point index. GPX
  // samples are rarely spaced evenly, and journey segments can have independent
  // durations. This normalized path gives one coordinate per equal replay-time
  // step, using the same interpolation rules as the visible marker.
  const cameraPathCoordinates = useMemo<number[][]>(() => {
    return getCachedCameraPath(
      computedJourney,
      journeyDistanceProfile,
      activeTrack,
      routeTimingMode,
    );
  }, [activeTrack, computedJourney, journeyDistanceProfile, routeTimingMode]);

  // Get elevation data for elevation profile
  const elevationData = useMemo(() => {
    return getCachedElevationData(computedJourney, activeTrack, routeTimingMode);
  }, [computedJourney, activeTrack, routeTimingMode]);

  // Get the current icon based on segment type
  const currentIcon = useMemo<string>(() => {
    if (currentSegment?.segment.type === 'transport') {
      return TRANSPORT_ICONS[currentSegment.segment.transportMode || 'car'] || '🚗';
    }
    if (currentSegment?.segment.type === 'track' && currentSegment.segment.trackId) {
      return tracks.find((track) => track.id === currentSegment.segment.trackId)?.activityIcon || DEFAULT_ACTIVITY_ICON;
    }
    return activeTrack?.activityIcon || DEFAULT_ACTIVITY_ICON;
  }, [activeTrack, currentSegment, tracks]);

  // Is currently in a transport segment?
  const isInTransport = currentSegment?.segment.type === 'transport';

  // Get current track color (for elevation profile and trail)
  const currentTrackColor = useMemo<string | undefined>(() => {
    if (currentSegment?.segment.type === 'track' && currentSegment.segment.trackId) {
      const track = tracks.find((t) => t.id === currentSegment.segment.trackId);
      return track?.color;
    }
    return undefined;
  }, [currentSegment, tracks]);

  const totalDistance = computedJourney
    ? journeyDistanceProfile?.totalDistance ?? computedJourney.totalDistance
    : activeTrack?.totalDistance ?? 0;
  const routeProgress = totalDistance > 0 ? routeDistance / totalDistance : playback.progress;

  return {
    computedJourney,
    isJourneyMode,
    currentPosition,
    currentBearing,
    currentSegment,
    completedCoordinates,
    allCoordinates,
    cameraPathCoordinates,
    elevationData,
    currentIcon,
    isInTransport,
    currentTrackColor,
    activeTrack,
    // Expose segment timings for other components
    segmentTimings: computedJourney?.segmentTimings || [],
    totalDuration: computedJourney?.totalDuration || 0,
    totalDistance,
    routeDistance,
    routeProgress,
    routeTimingMode,
  };
}
