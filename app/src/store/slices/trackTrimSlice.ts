import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';
import { isValidTrackTrimRange, trimTrack } from '@/utils/gpx/trimTrack';

/**
 * Route-anchored settings are stored as progress along the current geometry,
 * so trimming or restoring would silently retarget them without remapping.
 */
function hasRouteAnchoredSettings({ settings }: AppState): boolean {
  return settings.customElevationSections.length > 0
    || settings.elevationSectionOverrides.length > 0
    || settings.hiddenElevationSectionIds.length > 0
    || settings.trailStyle.colorZones.length > 0;
}

/** V1 edits route geometry only. Authored replay content needs a separate retiming workflow. */
export function hasTrackTrimDependencies(state: AppState): boolean {
  return state.pictures.length > 0 || state.videos.length > 0 || state.textAnnotations.length > 0
    || state.iconChanges.length > 0 || state.cinematicCameraKeyframes.length > 0
    || state.userLandmarks.length > 0 || state.comparisonTracks.length > 0
    || state.journeySegments.some((segment) => segment.type === 'transport')
    || hasRouteAnchoredSettings(state);
}

type TrackTrimSlice = Pick<AppState,
  | 'trackTrimPreview' | 'trackTrimOriginals' | 'setTrackTrimPreview' | 'applyTrackTrim' | 'restoreTrackTrim'
>;

export const createTrackTrimSlice: AppSliceCreator<TrackTrimSlice> = (set, get) => ({
  trackTrimPreview: null,
  trackTrimOriginals: {},

  setTrackTrimPreview: (range) => {
    if (range) {
      const state = get();
      const track = state.tracks.find((entry) => entry.id === range.trackId);
      if (state.isExporting || !track || !isValidTrackTrimRange(track, range.startIndex, range.endIndex)) return;
      // Stop any intro/outro loop as well as playback before showing the overlay.
      if (state.trackTrimPreview?.trackId !== range.trackId) state.resetPlayback();
    }
    set((state) => { state.trackTrimPreview = range; });
  },

  applyTrackTrim: (trackId, startIndex, endIndex) => {
    const state = get();
    const track = state.tracks.find((entry) => entry.id === trackId);
    if (state.isExporting || hasTrackTrimDependencies(state) || !track
      || !isValidTrackTrimRange(track, startIndex, endIndex)
      || (startIndex === 0 && endIndex === track.points.length - 1)) return false;
    const trimmed = trimTrack(track, startIndex, endIndex);
    state.resetPlayback();
    set((draft) => {
      // Keep the first imported geometry through successive trims, without
      // duplicating it in saved projects or copying thousands of points on drag.
      draft.trackTrimOriginals[trackId] ??= track;
      draft.tracks = draft.tracks.map((entry) => entry.id === trackId ? trimmed : entry);
      draft.trackTrimPreview = null;
    });
    return true;
  },

  restoreTrackTrim: (trackId) => {
    const state = get();
    const original = state.trackTrimOriginals[trackId];
    if (!original || state.isExporting || hasTrackTrimDependencies(state)) return false;
    state.resetPlayback();
    set((draft) => {
      draft.tracks = draft.tracks.map((track) => track.id === trackId ? {
        ...original,
        name: track.name,
        color: track.color,
        activityIcon: track.activityIcon,
        visible: track.visible,
      } : track);
      delete draft.trackTrimOriginals[trackId];
      draft.trackTrimPreview = null;
    });
    return true;
  },
});
