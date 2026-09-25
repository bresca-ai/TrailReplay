import type { PictureAnnotation } from '@/types';

export const PLAYBACK_PICTURE_PROGRESS_EPSILON = 0.005;
export const PLAYBACK_PICTURE_REWIND_TOLERANCE = 0.001;

export function hasPlaybackProgressRewound(
  previousProgress: number,
  currentProgress: number,
  tolerance = PLAYBACK_PICTURE_REWIND_TOLERANCE
) {
  return currentProgress + tolerance < previousProgress;
}

interface PlaybackTriggerable {
  id: string;
  progress: number;
}

/**
 * The media the marker has just passed, in route order.
 *
 * Pictures and clips are triggered the same way, so both go through this: a
 * clip that opened on a different rule than a photo would drift out of order
 * with the photos around it.
 */
export function getTriggeredPlaybackItems<T extends PlaybackTriggerable>(params: {
  items: T[];
  previousProgress: number;
  currentProgress: number;
  shownItemIds: ReadonlySet<string>;
  queuedItemIds: readonly string[];
  progressEpsilon?: number;
}): T[] {
  const {
    items,
    previousProgress,
    currentProgress,
    shownItemIds,
    queuedItemIds,
    progressEpsilon = PLAYBACK_PICTURE_PROGRESS_EPSILON,
  } = params;

  const lowerBound = Math.max(0, previousProgress - progressEpsilon);
  // No look-ahead: adding the epsilon here as well opened a photo 0.5% of the
  // route before the marker reached it, i.e. several seconds early on long
  // replays. The lower bound keeps the epsilon so nothing is skipped.
  const upperBound = Math.min(1, currentProgress);
  const queuedIds = new Set(queuedItemIds);

  return items
    .filter((item) => (
      !shownItemIds.has(item.id)
      && !queuedIds.has(item.id)
      && item.progress >= lowerBound
      && item.progress <= upperBound
    ))
    .sort((a, b) => a.progress - b.progress);
}

export function getTriggeredPlaybackPictures(params: {
  pictures: PictureAnnotation[];
  previousProgress: number;
  currentProgress: number;
  shownPictureIds: ReadonlySet<string>;
  queuedPictureIds: readonly string[];
  progressEpsilon?: number;
}) {
  return getTriggeredPlaybackItems({
    items: params.pictures,
    previousProgress: params.previousProgress,
    currentProgress: params.currentProgress,
    shownItemIds: params.shownPictureIds,
    queuedItemIds: params.queuedPictureIds,
    progressEpsilon: params.progressEpsilon,
  });
}
