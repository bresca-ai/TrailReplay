import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';

type MediaSlice = Pick<
  AppState,
  | 'pictures'
  | 'pendingPicturePlacements'
  | 'selectedPendingMediaIds'
  | 'pendingMediaMapPlacementActive'
  | 'setPendingMediaMapPlacementActive'
  | 'setSelectedPendingMediaIds'
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
  selectedPendingMediaIds: [],
  pendingMediaMapPlacementActive: false,
  setPendingMediaMapPlacementActive: (active) => set((state) => { state.pendingMediaMapPlacementActive = active; }),
  setSelectedPendingMediaIds: (ids) => set((state) => { state.selectedPendingMediaIds = ids; }),
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
      state.selectedPendingMediaIds.push(picture.id);
    }),

  removePendingPicturePlacement: (pictureId) =>
    set((state) => {
      state.pendingPicturePlacements = state.pendingPicturePlacements.filter((picture) => picture.id !== pictureId);
      state.selectedPendingMediaIds = state.selectedPendingMediaIds.filter((id) => id !== pictureId);
      if (!state.pendingPicturePlacements.length) state.pendingMediaMapPlacementActive = false;
    }),

  clearPendingPicturePlacements: () =>
    set((state) => {
      state.pendingPicturePlacements = [];
      state.selectedPendingMediaIds = [];
      state.pendingMediaMapPlacementActive = false;
    }),

  removePicture: (pictureId) =>
    set((state) => {
      state.pictures = state.pictures.filter((picture) => picture.id !== pictureId);
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
      state.videos = state.videos.filter((video) => video.id !== videoId);
      if (state.selectedVideoId === videoId) {
        state.selectedVideoId = null;
      }
    }),

  updateVideoPosition: (videoId, progress, routeAnchor) =>
    set((state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (!video) return;

      video.progress = progress;
      video.routeDistance = routeAnchor?.routeDistance;
      video.routeSegmentId = routeAnchor?.routeSegmentId;
      video.routeSegmentDistance = routeAnchor?.routeSegmentDistance;
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

  relinkPictureFile: (pictureId, file, asset) =>
    set((state) => {
      const picture = state.pictures.find((entry) => entry.id === pictureId);
      if (!picture) return;

      const previousUrl = picture.url;
      const nextUrl = asset?.url ?? URL.createObjectURL(file);
      picture.file = file;
      // Accept a pre-built renderable asset (e.g. HEIC converted to JPEG).
      picture.displayFile = asset?.displayFile;
      picture.url = nextUrl;
      picture.originalFileName = file.name;
      picture.isPlaceholder = false;
      if (previousUrl !== nextUrl && previousUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previousUrl);
      }
    }),

  relinkVideoFile: (videoId, file) =>
    set((state) => {
      const video = state.videos.find((entry) => entry.id === videoId);
      if (!video) return;

      video.file = file;
      video.url = URL.createObjectURL(file);
      video.isPlaceholder = false;
    }),
});
