import { defaultSidebarOpen } from '@/store/defaults';
import { translate } from '@/i18n/translations';
import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';
import { comparisonIssueForMode, getComparisonAvailability } from '@/utils/comparisonAvailability';
import { normalizeRouteDivergenceThreshold, ROUTE_DIVERGENCE_THRESHOLD_METERS } from '@/utils/routeDivergence';

type UiSlice = Pick<
  AppState,
  | 'isSidebarOpen'
  | 'exploreMode'
  | 'activePanel'
  | 'comparisonMode'
  | 'comparisonSlowdown'
  | 'comparisonThresholdMeters'
  | 'isLoading'
  | 'fileImportStatus'
  | 'error'
  | 'recipeReport'
  | 'sourceRecipe'
  | 'studioDeliveryEmail'
  | 'setSidebarOpen'
  | 'setExploreMode'
  | 'setActivePanel'
  | 'setComparisonMode'
  | 'setComparisonSlowdown'
  | 'setComparisonThresholdMeters'
  | 'setLoading'
  | 'setFileImportStatus'
  | 'setError'
  | 'setRecipeReport'
  | 'setSourceRecipe'
  | 'setStudioDeliveryEmail'
>;

export const createUiSlice: AppSliceCreator<UiSlice> = (set) => ({
  isSidebarOpen: defaultSidebarOpen,
  exploreMode: false,
  activePanel: 'tracks',
  comparisonMode: 'time',
  comparisonSlowdown: 0.25,
  comparisonThresholdMeters: ROUTE_DIVERGENCE_THRESHOLD_METERS,
  isLoading: false,
  fileImportStatus: null,
  error: null,
  recipeReport: null,
  sourceRecipe: null,
  studioDeliveryEmail: '',

  setSidebarOpen: (isOpen) =>
    set((state) => {
      state.isSidebarOpen = isOpen;
    }),

  setSourceRecipe: (recipe) =>
    set((state) => {
      state.sourceRecipe = recipe;
    }),

  setRecipeReport: (report) =>
    set((state) => {
      state.recipeReport = report;
    }),

  setStudioDeliveryEmail: (email) =>
    set((state) => {
      state.studioDeliveryEmail = email;
    }),

  setExploreMode: (enabled) =>
    set((state) => {
      state.exploreMode = enabled;
    }),

  setActivePanel: (panel) =>
    set((state) => {
      if (state.isExporting && panel !== 'export') {
        return;
      }
      state.activePanel = panel;
      if (panel !== 'tracks') state.trackTrimPreview = null;
    }),

  setComparisonMode: (mode) => set((state) => {
    if (state.comparisonTracks.some((track) => track.visible)) {
      const primary = state.tracks.find((track) => track.id === state.activeTrackId) ?? state.tracks[0];
      const availability = getComparisonAvailability(primary, state.comparisonTracks.filter((track) => track.visible).map((track) => track.track));
      const issue = comparisonIssueForMode(availability, mode);
      if (issue) {
        state.error = translate(state.settings.language, `journey.editor.${issue}`);
        return;
      }
    }
    // The whole live comparison starts at a watchable pace. The player shows
    // 0.5× and can still be adjusted; authored video duration stays intact.
    if (mode === 'route' && state.comparisonMode !== 'route'
      && state.comparisonTracks.length > 0 && state.playback.speed === 1) state.playback.speed = 0.5;
    state.comparisonMode = mode;
  }),
  setComparisonSlowdown: (speed) => set((state) => {
    if (Number.isFinite(speed)) state.comparisonSlowdown = Math.max(0.1, Math.min(1, speed));
  }),
  setComparisonThresholdMeters: (meters) => set((state) => {
    if (Number.isFinite(meters)) state.comparisonThresholdMeters = normalizeRouteDivergenceThreshold(meters);
  }),

  setLoading: (isLoading) =>
    set((state) => {
      state.isLoading = isLoading;
    }),

  setFileImportStatus: (status) =>
    set((state) => {
      state.fileImportStatus = status;
    }),

  setError: (error) =>
    set((state) => {
      state.error = error;
    }),
});
