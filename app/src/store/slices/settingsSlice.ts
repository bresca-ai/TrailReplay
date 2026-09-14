import {
  createDefaultCameraSettings,
  createDefaultSettings,
  createDefaultSocialShareSettings,
  createDefaultVideoExportSettings,
} from '@/store/defaults';
import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';

type SettingsSlice = Pick<
  AppState,
  | 'settings'
  | 'cameraSettings'
  | 'videoExportSettings'
  | 'socialShareSettings'
  | 'isExporting'
  | 'isDeterministicExport'
  | 'exportProgress'
  | 'exportStage'
  | 'cameraPosition'
  | 'setSettings'
  | 'setCameraSettings'
  | 'setCameraMode'
  | 'setMapStyle'
  | 'setUnitSystem'
  | 'setTrailStyle'
  | 'setVideoExportSettings'
  | 'setSocialShareSettings'
  | 'exportSubMode'
  | 'setExportSubMode'
  | 'setIsExporting'
  | 'setIsDeterministicExport'
  | 'setExportProgress'
  | 'setExportStage'
  | 'setCameraPosition'
>;

export const createSettingsSlice: AppSliceCreator<SettingsSlice> = (set) => ({
  settings: createDefaultSettings(),
  cameraSettings: createDefaultCameraSettings(),
  videoExportSettings: createDefaultVideoExportSettings(),
  socialShareSettings: createDefaultSocialShareSettings(),
  exportSubMode: 'video',
  isExporting: false,
  isDeterministicExport: false,
  exportProgress: 0,
  exportStage: '',
  cameraPosition: null,

  setSettings: (settings) =>
    set((state) => {
      Object.assign(state.settings, settings);
    }),

  setCameraSettings: (settings) =>
    set((state) => {
      Object.assign(state.cameraSettings, settings);
    }),

  setCameraMode: (mode) =>
    set((state) => {
      state.cameraSettings.mode = mode;
      state.settings.cameraMode = mode;
    }),

  setMapStyle: (style) =>
    set((state) => {
      state.settings.mapStyle = style;
    }),

  setUnitSystem: (unit) =>
    set((state) => {
      state.settings.unitSystem = unit;
    }),

  setTrailStyle: (settings) =>
    set((state) => {
      Object.assign(state.settings.trailStyle, settings);
    }),

  setVideoExportSettings: (settings) =>
    set((state) => {
      Object.assign(state.videoExportSettings, settings);
    }),

  setSocialShareSettings: (settings) =>
    set((state) => {
      Object.assign(state.socialShareSettings, settings);
    }),

  setExportSubMode: (mode) =>
    set((state) => {
      state.exportSubMode = mode;
    }),

  setIsExporting: (isExporting) =>
    set((state) => {
      state.isExporting = isExporting;
      if (isExporting) {
        state.activePanel = 'export';
      }
      if (!isExporting) {
        state.isDeterministicExport = false;
        state.exportProgress = 0;
        state.exportStage = '';
      }
    }),

  setIsDeterministicExport: (isDeterministicExport) =>
    set((state) => {
      state.isDeterministicExport = isDeterministicExport;
    }),

  setExportProgress: (progress) =>
    set((state) => {
      state.exportProgress = progress;
    }),

  setExportStage: (stage) =>
    set((state) => {
      state.exportStage = stage;
    }),

  setCameraPosition: (position) =>
    set((state) => {
      const current = state.cameraPosition;
      if (current && current.lat === position.lat && current.lon === position.lon &&
        current.zoom === position.zoom && current.pitch === position.pitch &&
        current.bearing === position.bearing) {
        return;
      }
      state.cameraPosition = position;
    }),
});
