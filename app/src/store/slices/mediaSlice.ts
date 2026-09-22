import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';

function revokeBlobUrlIfUnused(
  state: Pick<AppState, 'pictures' | 'pendingPicturePlacements' | 'videos'>,
  url: string,
) {
  const stillReferenced = [
    ...state.pictures,
    ...state.pendingPicturePlacements,
    ...state.videos,
  ].some((media) => media.url === url);

  if (!stillReferenced && url.startsWith('blob:') && typeof URL !== 'undefined') {
    URL.revokeObjectURL(url);
  }
}

type MediaSlice = Pick<
  AppState,
  | 'pictures'
  | 'pendingPicturePlacements'
  | 'videos'
  | 'iconChanges'
  | 'textAnnotations'
  | 'selectedPictureId'
  | 'selectedVideoId'
  | 'addPicture'
  | 'queuePendingPicturePlacement'
  | 'removePendingPicturePlacement'
  | 'clearPendingPicturePlacements'
  | 'removePicture'
  | 'updatePicturePosition'
  | 'updatePictureMetadata'
  | 'updatePictureDuration'
  | 'addVideo'
  | 'removeVideo'
  | 'updateVideoPosition'
  | 'setSelectedVideoId'
  | 'addIconChange'
  | 'removeIconChange'
  | 'updateIconChangePosition'
  | 'addTextAnnotation'
  | 'updateTextAnnotation'
  | 'removeTextAnnotation'
  | 'setSelectedPictureId'
  | 'relinkPictureFile'
  | 'relinkVideoFile'
>;

export const createMediaSlice: AppSliceCreator<MediaSlice> = (set) => ({
  pictures: [],
  pendingPicturePlacements: [],
  videos: [],
  iconChanges: [],
  textAnnotations: [],
  selectedPictureId: null,
  selectedVideoId: null,

  addPicture: (picture) =>
    set((state) => {
      state.pictures.push(picture);
    }),

  queuePendingPicturePlacement: (picture) =>
    set((state) => {
      state.pendingPicturePlacements.push(picture);
    }),

  removePendingPicturePlacement: (pictureId) =>
    set((state) => {
      const pending = state.pendingPicturePlacements.find((picture) => picture.id === pictureId);
      state.pendingPicturePlacements = state.pendingPicturePlacements.filter((picture) => picture.id !== pictureId);
      if (pending) revokeBlobUrlIfUnused(state, pending.url);
    }),

  clearPendingPicturePlacements: () =>
    set((state) => {
      const urls = new Set(state.pendingPicturePlacements.map((picture) => picture.url));
      state.pendingPicturePlacements = [];
      urls.forEach((url) => revokeBlobUrlIfUnused(state, url));
    }),

  removePicture: (pictureId) =>
    set((state) => {
      const picture = state.pictures.find((entry) => entry.id === pictureId);
      state.pictures = state.pictures.filter((picture) => picture.id !== pictureId);
      if (picture) revokeBlobUrlIfUnused(state, picture.url);
      if (state.selectedPictureId === pictureId) {
        state.selectedPictureId = null;
      }
    }),

  updatePicturePosition: (pictureId, progress, routeAnchor) =>
    set((state) => {
      const picture = state.pictures.find((entry) => entry.id === pictureId);
      if (!picture) return;

      picture.progress = progress;
      picture.position = progress;
      if (routeAnchor) {
        picture.routeDistance = routeAnchor.routeDistance;
        picture.routeSegmentId = routeAnchor.routeSegmentId;
        picture.routeSegmentDistance = routeAnchor.routeSegmentDistance;
      }
    }),

  updatePictureMetadata: (pictureId, title, description) =>
    set((state) => {
      const picture = state.pictures.find((entry) => entry.id === pictureId);
      if (!picture) return;

      picture.title = title;
      picture.description = description;
    }),

  updatePictureDuration: (pictureId, duration) =>
    set((state) => {
      const picture = state.pictures.find((entry) => entry.id === pictureId);
      if (picture) picture.displayDuration = duration;
    }),

  addVideo: (video) =>
    set((state) => {
      state.videos.push(video);
    }),

  removeVideo: (videoId) =>
    set((state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      state.videos = state.videos.filter((video) => video.id !== videoId);
      if (video) revokeBlobUrlIfUnused(state, video.url);
      if (state.selectedVideoId === videoId) {
        state.selectedVideoId = null;
      }
    }),

  updateVideoPosition: (videoId, progress, routeAnchor) =>
    set((state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (!video) return;

      video.progress = progress;
      if (routeAnchor) {
        video.routeDistance = routeAnchor.routeDistance;
        video.routeSegmentId = routeAnchor.routeSegmentId;
        video.routeSegmentDistance = routeAnchor.routeSegmentDistance;
      } else {
        // Moving a clip to the playhead is a manual placement. Retaining its
        // old GPS/timestamp anchor makes the route-sync effect move it back on
        // the next timing-mode change.
        video.placementSource = 'manual';
        video.routeDistance = undefined;
        video.routeSegmentId = undefined;
        video.routeSegmentDistance = undefined;
      }
    }),

  setSelectedVideoId: (videoId) =>
    set((state) => {
      state.selectedVideoId = videoId;
    }),

  addIconChange: (iconChange) =>
    set((state) => {
      state.iconChanges.push(iconChange);
    }),

  removeIconChange: (iconChangeId) =>
    set((state) => {
      state.iconChanges = state.iconChanges.filter((entry) => entry.id !== iconChangeId);
    }),

  updateIconChangePosition: (iconChangeId, progress) =>
    set((state) => {
      const iconChange = state.iconChanges.find((entry) => entry.id === iconChangeId);
      if (iconChange) iconChange.progress = progress;
    }),

  addTextAnnotation: (annotation) =>
    set((state) => {
      state.textAnnotations.push(annotation);
    }),

  updateTextAnnotation: (annotationId, updates) =>
    set((state) => {
      const annotation = state.textAnnotations.find((entry) => entry.id === annotationId);
      if (!annotation) return;

      Object.assign(annotation, updates);
    }),

  removeTextAnnotation: (annotationId) =>
    set((state) => {
      state.textAnnotations = state.textAnnotations.filter((annotation) => annotation.id !== annotationId);
    }),

  setSelectedPictureId: (pictureId) =>
    set((state) => {
      state.selectedPictureId = pictureId;
    }),

  relinkPictureFile: (pictureId, file) =>
    set((state) => {
      const picture = state.pictures.find((entry) => entry.id === pictureId);
      if (!picture) return;

      const oldUrl = picture.url;
      picture.file = file;
      picture.url = URL.createObjectURL(file);
      picture.isPlaceholder = false;
      revokeBlobUrlIfUnused(state, oldUrl);
    }),

  relinkVideoFile: (videoId, file) =>
    set((state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (!video) return;

      const oldUrl = video.url;
      video.file = file;
      video.url = URL.createObjectURL(file);
      video.isPlaceholder = false;
      revokeBlobUrlIfUnused(state, oldUrl);
    }),
});
