import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  createDefaultCameraSettings,
  createDefaultPlayback,
  createDefaultSettings,
  createDefaultSocialShareSettings,
  createDefaultVideoExportSettings,
} from '@/store/defaults';
import type { AppState } from '@/store/storeTypes';
import { createJourneySlice } from '@/store/slices/journeySlice';
import { createMediaSlice } from '@/store/slices/mediaSlice';
import { createPlaybackSlice } from '@/store/slices/playbackSlice';
import { createSettingsSlice } from '@/store/slices/settingsSlice';
import { createTracksSlice } from '@/store/slices/tracksSlice';
import { createUiSlice } from '@/store/slices/uiSlice';
import { createLandmarksSlice } from '@/store/slices/landmarksSlice';

export function createAppStore() {
  return create<AppState>()(
    immer((set, get, store) => ({
      ...createTracksSlice(set, get, store),
      ...createJourneySlice(set, get, store),
      ...createMediaSlice(set, get, store),
      ...createPlaybackSlice(set, get, store),
      ...createSettingsSlice(set, get, store),
      ...createUiSlice(set, get, store),
      ...createLandmarksSlice(set, get, store),

      reset: () =>
        set((state) => {
          state.tracks = [];
          state.activeTrackId = null;
          state.recipeReport = null;
          state.sourceRecipe = null;
          state.comparisonTracks = [];
          state.journey = null;
          state.journeySegments = [];
          state.cinematicCameraKeyframes = [];
          state.pictures = [];
          state.pendingPicturePlacements = [];
          state.videos = [];
          state.iconChanges = [];
          state.textAnnotations = [];
          state.userLandmarks = [];
          state.enrichedLandmarks = [];
          state.showAutomaticLandmarks = false;
          state.enabledLandmarkGroups = [];
          state.nearbyPlaceTypes = null;
          state.nearbyPlacesEnabled = true;
          state.nearbyPlacesLoading = false;
          state.nearbyPlacesError = null;
          state.nearbyPlacesCoverage = null;
          state.playback = createDefaultPlayback();
          state.cinematicPlayed = false;
          state.animationPhase = 'idle';
          state.settings = createDefaultSettings();
          state.cameraSettings = createDefaultCameraSettings();
          state.videoExportSettings = createDefaultVideoExportSettings();
          state.socialShareSettings = createDefaultSocialShareSettings();
          state.isExporting = false;
          state.exportProgress = 0;
          state.exportStage = '';
          state.error = null;
          state.selectedPictureId = null;
          state.selectedVideoId = null;
          state.cameraPosition = null;
          state.exploreMode = false;
          state.activePanel = 'tracks';
        }),

      hydrateState: (partial) =>
        set((state) => {
          Object.assign(state, partial);
        }),
    }))
  );
}
