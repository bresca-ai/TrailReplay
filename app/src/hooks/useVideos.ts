import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { PendingPicturePlacement, VideoAnnotation } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { isVideoFile } from '@/utils/files';
import { createId } from '@/utils/id';
import { useMediaPlacement } from '@/hooks/useMediaPlacement';
import { GPS_ROUTE_MATCH_THRESHOLD_METERS } from '@/utils/photoPlacement';
import { readVideoDuration, readVideoMetadata } from '@/utils/videoMetadata';
import { trackEvent } from '@/utils/analytics';

/**
 * Imports clips into the replay.
 *
 * A clip that cannot be decoded, or that the route has no place for, says so.
 * The previous Media panel simply dropped every video it was given — no entry,
 * no error, nothing on screen — which is what issue #104 reports as "videos
 * seem not to load".
 *
 * Placement is the same as a photo's: GPS first, capture time second, and
 * failing both, the user is asked to click the spot on the route.
 */
export function useVideos() {
  const { t } = useI18n();
  const [isProcessing, setIsProcessing] = useState(false);
  const videos = useAppStore((state) => state.videos);
  const addVideo = useAppStore((state) => state.addVideo);
  const queuePendingPicturePlacement = useAppStore((state) => state.queuePendingPicturePlacement);
  const removeVideo = useAppStore((state) => state.removeVideo);
  const playback = useAppStore((state) => state.playback);
  const { findPositionOnRoute, findPositionAtTime } = useMediaPlacement();

  const addVideos = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    const allFiles = Array.from(files);
    const videoFiles = allFiles.filter((file) => isVideoFile(file));
    if (videoFiles.length === 0) return;

    setIsProcessing(true);
    trackEvent('video_import_started', { video_received_file_count: videoFiles.length });

    let placedByRoute = 0;
    let queuedForPlacement = 0;
    let unreadable = 0;

    try {
      for (const file of videoFiles) {
        const url = URL.createObjectURL(file);
        const probe = await readVideoDuration(url);

        if (probe.status === 'unsupported') {
          URL.revokeObjectURL(url);
          unreadable += 1;
          toast.error(t('media.videoUnreadable', { name: file.name }));
          continue;
        }

        // `unknown` means the browser has not decoded it yet, not that it
        // cannot: the popup reads the length off the element that plays it.
        const durationSeconds = probe.status === 'ok' ? probe.durationSeconds : undefined;

        const metadata = await readVideoMetadata(file);
        const gpsMatch = metadata.latitude !== undefined && metadata.longitude !== undefined
          ? findPositionOnRoute(metadata.latitude, metadata.longitude)
          : null;
        const timestampPlacement = findPositionAtTime(metadata.timestamp);

        const match = gpsMatch && gpsMatch.distanceMeters <= GPS_ROUTE_MATCH_THRESHOLD_METERS
          ? { match: gpsMatch, source: 'gps' as const }
          : timestampPlacement.match
            ? { match: timestampPlacement.match, source: 'timestamp' as const }
            : null;

        // A clip the route cannot place is not dropped at the playhead: that
        // is a position nobody chose, and it happens to be wherever playback
        // was paused when the file was dropped. It joins the same
        // click-the-route queue photos use, so both kinds of media are placed
        // the same way.
        if (!match) {
          const pending: PendingPicturePlacement = {
            id: createId('video'),
            mediaKind: 'video',
            file,
            url,
            timestamp: metadata.timestamp,
            displayDuration: 5000,
            durationSeconds,
            placementReason: metadata.latitude !== undefined ? 'route-mismatch' : 'missing-gps',
            originalLat: metadata.latitude,
            originalLon: metadata.longitude,
            mismatchDistanceMeters: gpsMatch?.distanceMeters,
            hasGpsMetadata: metadata.latitude !== undefined,
            hasTimestampMetadata: metadata.timestamp !== undefined,
          };
          queuePendingPicturePlacement(pending);
          queuedForPlacement += 1;

          trackEvent('video_import_file_processed', {
            video_placement_result: 'pending',
            video_has_gps: metadata.latitude !== undefined,
            video_has_timestamp: metadata.timestamp !== undefined,
            video_duration_seconds: durationSeconds !== undefined ? Math.round(durationSeconds) : null,
          });
          continue;
        }

        const video: VideoAnnotation = {
          id: createId('video'),
          file,
          url,
          isPlaceholder: false,
          originalFileName: file.name,
          lat: match.match.lat ?? metadata.latitude,
          lon: match.match.lon ?? metadata.longitude,
          timestamp: metadata.timestamp,
          progress: match.match.progress ?? playback.progress,
          durationSeconds,
          placementSource: match.source,
          routeDistance: match.match.routeDistance,
          routeSegmentId: match.match.routeSegmentId,
          routeSegmentDistance: match.match.routeSegmentDistance,
        };

        addVideo(video);
        placedByRoute += 1;

        trackEvent('video_import_file_processed', {
          video_placement_result: video.placementSource ?? 'unknown',
          video_has_gps: metadata.latitude !== undefined,
          video_has_timestamp: metadata.timestamp !== undefined,
          video_duration_seconds: durationSeconds !== undefined ? Math.round(durationSeconds) : null,
        });
      }

      if (queuedForPlacement === 1) {
        toast.warning(t('media.manualPlacementQueuedSingleVideo'));
      } else if (queuedForPlacement > 1) {
        toast.warning(t('media.manualPlacementQueuedMultipleVideo', { count: queuedForPlacement }));
      }

      trackEvent('video_import_completed', {
        video_count_added: placedByRoute,
        video_count_queued_for_placement: queuedForPlacement,
        video_count_unreadable: unreadable,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [addVideo, findPositionAtTime, findPositionOnRoute, playback.progress, queuePendingPicturePlacement, t]);

  return { videos, isProcessing, addVideos, removeVideo };
}
