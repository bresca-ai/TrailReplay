import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { PendingPicturePlacement, PictureAnnotation } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { isImageFile } from '@/utils/files';
import { createRenderableImageAsset } from '@/utils/imagePreview';
import { createId } from '@/utils/id';
import type { ProcessPhotoResult } from '@/utils/photoPlacement';
import { resolvePhotoPlacement } from '@/utils/photoPlacement';
import { readPhotoMetadata } from '@/utils/photoMetadata';
import { useMediaPlacement } from '@/hooks/useMediaPlacement';
import { trackEvent } from '@/utils/analytics';

// Match an uploaded file to an existing picture by file name.
export function findPictureByFileName(pictures: PictureAnnotation[], fileName: string): PictureAnnotation | undefined {
  const name = fileName.toLowerCase();
  const matches = pictures.filter((picture) =>
    (picture.file?.name ?? picture.originalFileName ?? '').toLowerCase() === name);
  return matches.find((picture) => picture.isPlaceholder) ?? matches[0];
}

export function usePhotos() {
  const { t } = useI18n();
  const [isProcessing, setIsProcessing] = useState(false);
  const pictures = useAppStore((state) => state.pictures);
  const addPicture = useAppStore((state) => state.addPicture);
  const relinkPictureFile = useAppStore((state) => state.relinkPictureFile);
  const queuePendingPicturePlacement = useAppStore((state) => state.queuePendingPicturePlacement);
  const removePicture = useAppStore((state) => state.removePicture);
  const playback = useAppStore((state) => state.playback);
  const { findPositionOnRoute, findPositionAtTime } = useMediaPlacement();

  const processPhoto = useCallback(async (file: File): Promise<ProcessPhotoResult> => {
    const renderableAsset = await createRenderableImageAsset(file);
    const id = createId('photo');

    const metadata = await readPhotoMetadata(file);
    const routeMatch =
      metadata.latitude !== undefined && metadata.longitude !== undefined
        ? findPositionOnRoute(metadata.latitude, metadata.longitude)
        : null;
    const timestampPlacement = findPositionAtTime(metadata.timestamp);

    return resolvePhotoPlacement({
      id,
      file,
      displayFile: renderableAsset.displayFile,
      url: renderableAsset.url,
      timestamp: metadata.timestamp,
      metadata,
      gpsRouteMatch: routeMatch,
      timestampPlacement: timestampPlacement.match,
      timestampFailureReason: timestampPlacement.reason,
      fallbackProgress: playback.progress,
    });
  }, [findPositionAtTime, findPositionOnRoute, playback.progress]);

  const addPhotos = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      const allFiles = Array.from(files);
      const imageFiles = allFiles.filter((file) => isImageFile(file));
      trackEvent('photo_import_started', {
        photo_received_file_count: allFiles.length,
        photo_image_file_count: imageFiles.length,
      });
      const queuedPlacements: PendingPicturePlacement[] = [];
      let relinkedCount = 0;

      for (const file of imageFiles) {
        // A file whose name matches a picture already in the list
        // (e.g. a placeholder restored from a .replay project) is re-linked to
        // that picture - keeping its position, duration and texts - instead of
        // being added a second time. Placeholders are preferred over pictures
        // that already have a file.
        const existing = findPictureByFileName(useAppStore.getState().pictures, file.name);
        if (existing) {
          const asset = await createRenderableImageAsset(file);
          relinkPictureFile(existing.id, file, asset);
          relinkedCount += 1;
          continue;
        }

        const result = await processPhoto(file);
        trackEvent('photo_import_file_processed', {
          photo_has_gps: result.kind === 'picture'
            ? result.picture.placementSource === 'gps'
            : result.pendingPlacement.hasGpsMetadata ?? false,
          photo_has_timestamp: result.kind === 'picture'
            ? result.picture.timestamp !== undefined
            : result.pendingPlacement.hasTimestampMetadata ?? false,
          photo_placement_result: result.kind === 'picture'
            ? (result.picture.placementSource ?? 'unknown')
            : 'pending',
          photo_manual_reason: result.kind === 'pending'
            ? result.pendingPlacement.placementReason.replaceAll('-', '_')
            : null,
        });

        if (result.kind === 'picture') {
          addPicture(result.picture);
          continue;
        }

        queuedPlacements.push(result.pendingPlacement);
      }

      queuedPlacements.forEach((pendingPlacement) => {
        queuePendingPicturePlacement(pendingPlacement);
      });

      if (relinkedCount > 0) {
        toast.success(relinkedCount === 1
          ? t('media.picturesRelinkedSingle')
          : t('media.picturesRelinkedMultiple', { count: relinkedCount }));
      }

      trackEvent('photo_import_completed', {
        photo_picture_count_added: imageFiles.length - queuedPlacements.length - relinkedCount,
        photo_queued_for_manual_placement: queuedPlacements.length,
      });

      if (queuedPlacements.length === 1) {
        toast.warning(t('media.manualPlacementQueuedSingle'));
      } else if (queuedPlacements.length > 1) {
        toast.warning(t('media.manualPlacementQueuedMultiple', { count: queuedPlacements.length }));
      }
    } finally {
      setIsProcessing(false);
    }
  }, [addPicture, processPhoto, queuePendingPicturePlacement, relinkPictureFile, t]);

  return {
    pictures,
    isProcessing,
    addPhotos,
    removePicture,
  };
}
