import { defaultSidebarOpen } from '@/store/defaults';
import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';

type UiSlice = Pick<
  AppState,
  | 'isSidebarOpen'
  | 'exploreMode'
  | 'activePanel'
  | 'isLoading'
  | 'fileImportStatus'
  | 'error'
  | 'recipeReport'
  | 'sourceRecipe'
  | 'setSidebarOpen'
  | 'setExploreMode'
  | 'setActivePanel'
  | 'setLoading'
  | 'setFileImportStatus'
  | 'setError'
  | 'setRecipeReport'
  | 'setSourceRecipe'
>;

export const createUiSlice: AppSliceCreator<UiSlice> = (set) => ({
  isSidebarOpen: defaultSidebarOpen,
  exploreMode: false,
  activePanel: 'tracks',
  isLoading: false,
  fileImportStatus: null,
  error: null,
  recipeReport: null,
  sourceRecipe: null,

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
