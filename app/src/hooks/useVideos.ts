import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { VideoAnnotation } from '@/types';
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
 */
export function useVideos() {
  const { t } = useI18n();
  const [isProcessing, setIsProcessing] = useState(false);
  const videos = useAppStore((state) => state.videos);
  const addVideo = useAppStore((state) => state.addVideo);
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
    let placedAtPlayhead = 0;
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

        const video: VideoAnnotation = {
          id: createId('video'),
          file,
          url,
          isPlaceholder: false,
          originalFileName: file.name,
          lat: match?.match.lat ?? metadata.latitude,
          lon: match?.match.lon ?? metadata.longitude,
          timestamp: metadata.timestamp,
          // A clip the route cannot place still belongs in the replay: it is
          // dropped at the playhead, where the user can seek it into place,
          // rather than being refused.
          progress: match?.match.progress ?? playback.progress,
          durationSeconds,
          placementSource: match?.source ?? 'manual',
          routeDistance: match?.match.routeDistance,
          routeSegmentId: match?.match.routeSegmentId,
          routeSegmentDistance: match?.match.routeSegmentDistance,
        };

        addVideo(video);
        if (match) placedByRoute += 1;
        else placedAtPlayhead += 1;

        trackEvent('video_import_file_processed', {
          video_placement_result: video.placementSource ?? 'unknown',
          video_has_gps: metadata.latitude !== undefined,
          video_has_timestamp: metadata.timestamp !== undefined,
          video_duration_seconds: durationSeconds !== undefined ? Math.round(durationSeconds) : null,
        });
      }

      if (placedAtPlayhead === 1) {
        toast.warning(t('media.videoPlacedAtPlayheadSingle'));
      } else if (placedAtPlayhead > 1) {
        toast.warning(t('media.videoPlacedAtPlayheadMultiple', { count: placedAtPlayhead }));
      }

      trackEvent('video_import_completed', {
        video_count_added: placedByRoute + placedAtPlayhead,
        video_count_unreadable: unreadable,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [addVideo, findPositionAtTime, findPositionOnRoute, playback.progress, t]);

  return { videos, isProcessing, addVideos, removeVideo };
}
