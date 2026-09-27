import type { PendingPicturePlacement, PictureAnnotation } from '@/types';
import type { NormalizedPhotoMetadata } from '@/utils/photoMetadata';
import type { TimestampPlacementFailureReason, TimestampPlacementMatch } from '@/utils/photoTimelinePlacement';
import type { RouteMatch } from '@/utils/routeProjection';

export type ProcessPhotoResult =
  | { kind: 'picture'; picture: PictureAnnotation }
  | { kind: 'pending'; pendingPlacement: PendingPicturePlacement };

export const GPS_ROUTE_MATCH_THRESHOLD_METERS = 250;

export function createPendingPlacement(params: {
  id: string;
  file: File;
  displayFile?: File;
  url: string;
  timestamp?: Date;
  reason: PendingPicturePlacement['placementReason'];
  originalLat?: number;
  originalLon?: number;
  mismatchDistanceMeters?: number;
  hasGpsMetadata?: boolean;
  hasTimestampMetadata?: boolean;
  timestampAlternative?: PendingPicturePlacement['timestampAlternative'];
}): ProcessPhotoResult {
  return {
    kind: 'pending',
    pendingPlacement: {
      id: params.id,
      file: params.file,
      displayFile: params.displayFile,
      url: params.url,
      timestamp: params.timestamp,
      displayDuration: 3000,
      placementReason: params.reason,
      originalLat: params.originalLat,
      originalLon: params.originalLon,
      mismatchDistanceMeters: params.mismatchDistanceMeters,
      hasGpsMetadata: params.hasGpsMetadata,
      hasTimestampMetadata: params.hasTimestampMetadata,
      timestampAlternative: params.timestampAlternative,
    },
  };
}

function createPicture(params: {
  id: string;
  file: File;
  displayFile?: File;
  url: string;
  timestamp?: Date;
  match: RouteMatch | TimestampPlacementMatch;
  placementSource: PictureAnnotation['placementSource'];
  fallbackProgress: number;
}): ProcessPhotoResult {
  const { fallbackProgress, file, id, match, placementSource, timestamp, url } = params;

  return {
    kind: 'picture',
    picture: {
      id,
      file,
      displayFile: params.displayFile,
      url,
      isPlaceholder: false,
      lat: match.lat,
      lon: match.lon,
      timestamp,
      progress: match.progress ?? fallbackProgress,
      position: match.progress ?? fallbackProgress,
      // Keeps the point the placement actually found, so a later change of
      // timing mode can be recalculated from it rather than searched for.
      routeDistance: match.routeDistance,
      routeSegmentId: match.routeSegmentId,
      routeSegmentDistance: match.routeSegmentDistance,
      placementSource,
      displayDuration: 3000,
    },
  };
}

function normalizePendingReason(reason: TimestampPlacementFailureReason | null, hasGpsCoordinates: boolean) {
  if (hasGpsCoordinates) {
    return 'route-mismatch';
  }

  if (!reason) {
    return 'missing-gps';
  }

  switch (reason) {
    case 'missing-timestamp':
      return 'missing-gps';
    case 'no-timed-route':
      return 'no-timed-route';
    case 'timestamp-out-of-range':
      return 'timestamp-out-of-range';
    default:
      return 'missing-gps';
  }
}

export function resolvePhotoPlacement(params: {
  id: string;
  file: File;
  displayFile?: File;
  url: string;
  timestamp?: Date;
  metadata: NormalizedPhotoMetadata;
  gpsRouteMatch: RouteMatch | null;
  timestampPlacement: TimestampPlacementMatch | null;
  timestampFailureReason: TimestampPlacementFailureReason | null;
  fallbackProgress: number;
}): ProcessPhotoResult {
  const {
    fallbackProgress,
    file,
    displayFile,
    gpsRouteMatch,
    id,
    metadata,
    timestamp,
    timestampFailureReason,
    timestampPlacement,
    url,
  } = params;

  const hasGpsCoordinates = metadata.latitude !== undefined && metadata.longitude !== undefined;

  if (hasGpsCoordinates && gpsRouteMatch && gpsRouteMatch.distanceMeters <= GPS_ROUTE_MATCH_THRESHOLD_METERS) {
    return createPicture({
      id,
      file,
      displayFile,
      url,
      timestamp,
      match: gpsRouteMatch,
      placementSource: 'gps',
      fallbackProgress,
    });
  }

  if (!hasGpsCoordinates && timestampPlacement) {
    return createPicture({
      id,
      file,
      displayFile,
      url,
      timestamp,
      match: timestampPlacement,
      placementSource: 'timestamp',
      fallbackProgress,
    });
  }

  return createPendingPlacement({
    id,
    file,
    displayFile,
    url,
    timestamp,
    reason: normalizePendingReason(timestampFailureReason, hasGpsCoordinates),
    originalLat: metadata.latitude,
    originalLon: metadata.longitude,
    mismatchDistanceMeters: gpsRouteMatch?.distanceMeters,
    hasGpsMetadata: hasGpsCoordinates,
    hasTimestampMetadata: metadata.timestamp !== undefined,
    timestampAlternative: hasGpsCoordinates && timestampPlacement
      ? {
          lat: timestampPlacement.lat,
          lon: timestampPlacement.lon,
          progress: timestampPlacement.progress,
          routeDistance: timestampPlacement.routeDistance,
          routeSegmentId: timestampPlacement.routeSegmentId,
          routeSegmentDistance: timestampPlacement.routeSegmentDistance,
        }
      : undefined,
  });
}
