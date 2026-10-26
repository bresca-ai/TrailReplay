import { createDefaultPlayback } from '@/store/defaults';
import { translate } from '@/i18n/translations';
import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';
import { comparisonIssueForMode, getComparisonAvailability } from '@/utils/comparisonAvailability';

type PlaybackSlice = Pick<
  AppState,
  | 'playback'
  | 'cinematicPlayed'
  | 'animationPhase'
  | 'exportPictureHoldElapsedMs'
  | 'exportVideoHoldTimeSeconds'
  | 'setPlayback'
  | 'play'
  | 'pause'
  | 'seek'
  | 'seekToProgress'
  | 'setSpeed'
  | 'setRouteTimingMode'
  | 'setCurrentSegment'
  | 'setCinematicPlayed'
  | 'setAnimationPhase'
  | 'setExportPictureHoldElapsedMs'
  | 'setExportVideoHoldTimeSeconds'
  | 'resetPlayback'
>;

export const createPlaybackSlice: AppSliceCreator<PlaybackSlice> = (set) => ({
  playback: createDefaultPlayback(),
  cinematicPlayed: false,
  animationPhase: 'idle',
  exportPictureHoldElapsedMs: null,
  exportVideoHoldTimeSeconds: null,

  setPlayback: (playback) =>
    set((state) => {
      Object.assign(state.playback, playback);
    }),

  play: () =>
    set((state) => {
      if (state.comparisonTracks.some((track) => track.visible)) {
        const primary = state.tracks.find((track) => track.id === state.activeTrackId) ?? state.tracks[0];
        const availability = getComparisonAvailability(primary, state.comparisonTracks.filter((track) => track.visible).map((track) => track.track));
        const issue = comparisonIssueForMode(availability, state.comparisonMode);
        if (issue) {
          state.error = translate(state.settings.language, `journey.editor.${issue}`);
          return;
        }
      }
      state.playback.isPlaying = true;
    }),

  pause: () =>
    set((state) => {
      state.playback.isPlaying = false;
    }),

  seek: (time) =>
    set((state) => {
      state.playback.currentTime = Math.max(0, Math.min(time, state.playback.totalDuration));
      state.playback.progress = state.playback.totalDuration > 0
        ? state.playback.currentTime / state.playback.totalDuration
        : 0;
    }),

  seekToProgress: (progress) =>
    set((state) => {
      state.playback.progress = Math.max(0, Math.min(progress, 1));
      state.playback.currentTime = state.playback.progress * state.playback.totalDuration;
    }),

  setSpeed: (speed) =>
    set((state) => {
      state.playback.speed = speed;
    }),

  setRouteTimingMode: (mode) =>
    set((state) => {
      state.playback.routeTimingMode = mode;
    }),

  setCurrentSegment: (index, progress) =>
    set((state) => {
      state.playback.currentSegmentIndex = index;
      state.playback.segmentProgress = progress;
    }),

  setCinematicPlayed: (played) =>
    set((state) => {
      state.cinematicPlayed = played;
    }),

  setAnimationPhase: (phase) =>
    set((state) => {
      state.animationPhase = phase;
    }),

  setExportPictureHoldElapsedMs: (elapsedMs) =>
    set((state) => {
      state.exportPictureHoldElapsedMs = elapsedMs;
    }),

  setExportVideoHoldTimeSeconds: (seconds) =>
    set((state) => {
      state.exportVideoHoldTimeSeconds = seconds;
    }),

  resetPlayback: () =>
    set((state) => {
      const routeTimingMode = state.playback.routeTimingMode;
      const totalDuration = state.playback.totalDuration;
      state.playback = {
        ...createDefaultPlayback(),
        routeTimingMode,
        totalDuration,
      };
      state.cinematicPlayed = false;
      state.animationPhase = 'idle';
      state.exportPictureHoldElapsedMs = null;
      state.exportVideoHoldTimeSeconds = null;
    }),
});
