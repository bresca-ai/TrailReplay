import { createId } from '@/utils/id';
import { trackColors } from '@/store/defaults';
import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';
import { DEFAULT_ACTIVITY_ICON } from '@/utils/activityIcons';
import { getTrackTimeRange } from '@/utils/trackTimeOverlap';
import { comparisonIssueForMode, getComparisonAvailability } from '@/utils/comparisonAvailability';
import { translate } from '@/i18n/translations';
import type { GPXTrack } from '@/types';

type TracksSlice = Pick<
  AppState,
  | 'tracks'
  | 'activeTrackId'
  | 'comparisonTracks'
  | 'addTrack'
  | 'addImportedTracks'
  | 'removeTrack'
  | 'setActiveTrack'
  | 'updateTrackColor'
  | 'updateTrackIcon'
  | 'updateTrackName'
  | 'toggleTrackVisibility'
  | 'reorderTracks'
  | 'addComparisonTrack'
  | 'moveTrackToComparison'
  | 'removeComparisonTrack'
  | 'ungroupComparisonTrack'
  | 'toggleComparisonTrack'
  | 'updateComparisonOffset'
  | 'updateComparisonTrackName'
  | 'updateComparisonColor'
>;

/**
 * Places a track into `state.tracks` (at `insertIndex`, or appended when
 * omitted/out of range) and gives it a matching journey segment, sharing the
 * logic `addTrack` and `ungroupComparisonTrack` both need. The segment is
 * inserted right before the segment of the track that ends up after it, so a
 * mid-sequence insert keeps the journey order consistent with track order.
 */
function insertTrackIntoJourney(state: AppState, track: GPXTrack, insertIndex?: number) {
  const colorIndex = state.tracks.length % trackColors.length;
  const trackColor = track.color || trackColors[colorIndex];
  const trackWithColor = {
    ...track,
    activityIcon: track.activityIcon || DEFAULT_ACTIVITY_ICON,
    color: trackColor,
    visible: true,
  };

  const atEnd = insertIndex === undefined || insertIndex >= state.tracks.length;
  const nextTrack = atEnd ? null : state.tracks[insertIndex!];
  if (atEnd) {
    state.tracks.push(trackWithColor);
  } else {
    state.tracks.splice(insertIndex!, 0, trackWithColor);
  }
  state.exploreMode = false;

  if (!state.activeTrackId) {
    state.activeTrackId = track.id;
    state.settings.trailStyle.trailColor = trackColor;
    state.settings.trailStyle.currentIcon = trackWithColor.activityIcon;
    state.settings.trailStyle.markerColor = trackColor;
  }

  if (!state.journey) {
    state.journey = {
      id: createId('journey'),
      name: translate(state.settings.language, 'export.projectNamePlaceholder'),
      segments: [],
      totalDuration: 0,
      totalDistance: 0,
    };
  }

  const segment = {
    id: createId(`segment-${track.id}`),
    type: 'track' as const,
    trackId: track.id,
    duration: 60000,
  };
  const nextSegmentIndex = nextTrack
    ? state.journeySegments.findIndex(
        (entry) => entry.type === 'track' && entry.trackId === nextTrack.id
      )
    : -1;
  if (nextSegmentIndex >= 0) {
    state.journeySegments.splice(nextSegmentIndex, 0, segment);
  } else {
    state.journeySegments.push(segment);
  }
  state.activePanel = 'journey';
}

function reconcileComparisonMode(state: AppState) {
  if (!state.comparisonTracks.some((track) => track.visible)) return;
  const primary = state.tracks.find((track) => track.id === state.activeTrackId) ?? state.tracks[0];
  const availability = getComparisonAvailability(primary, state.comparisonTracks.filter((track) => track.visible).map((track) => track.track));
  const issue = comparisonIssueForMode(availability, state.comparisonMode);
  if (!issue) return;
  const alternative = state.comparisonMode === 'time' ? 'route' : 'time';
  if (availability[alternative]) {
    state.comparisonMode = alternative;
    if (alternative === 'route' && state.playback.speed === 1) state.playback.speed = 0.5;
  }
  state.error = translate(state.settings.language, `journey.editor.${issue}`);
}

export const createTracksSlice: AppSliceCreator<TracksSlice> = (set) => ({
  tracks: [],
  activeTrackId: null,
  comparisonTracks: [],

  addTrack: (track) =>
    set((state) => {
      insertTrackIntoJourney(state, track);
    }),

  addImportedTracks: (tracks, comparisonTracks) =>
    set((state) => {
      // One store publication prevents each large file from triggering a full
      // journey/map recomputation while the rest of the import is still being
      // installed.
      tracks.forEach((track) => insertTrackIntoJourney(state, track));
      state.comparisonTracks.push(...comparisonTracks);
      reconcileComparisonMode(state);
    }),

  removeTrack: (trackId) =>
    set((state) => {
      delete state.trackTrimOriginals[trackId];
      if (state.trackTrimPreview?.trackId === trackId) state.trackTrimPreview = null;
      state.tracks = state.tracks.filter((track) => track.id !== trackId);
      state.journeySegments = state.journeySegments.filter((segment) =>
        segment.type !== 'track' || segment.trackId !== trackId
      );

      if (state.activeTrackId === trackId) {
        const nextActiveTrack = state.tracks[0] ?? null;
        state.activeTrackId = nextActiveTrack?.id || null;
        if (nextActiveTrack) {
          state.settings.trailStyle.trailColor = nextActiveTrack.color;
          state.settings.trailStyle.currentIcon = nextActiveTrack.activityIcon;
        }
      }
    }),

  setActiveTrack: (trackId) =>
    set((state) => {
      state.activeTrackId = trackId;
      const activeTrack = state.tracks.find((track) => track.id === trackId);
      if (activeTrack) {
        const previousTrailColor = state.settings.trailStyle.trailColor;
        state.settings.trailStyle.trailColor = activeTrack.color;
        state.settings.trailStyle.currentIcon = activeTrack.activityIcon;
        if (state.settings.trailStyle.markerColor === previousTrailColor) {
          state.settings.trailStyle.markerColor = activeTrack.color;
        }
      }
    }),

  updateTrackColor: (trackId, color) =>
    set((state) => {
      const track = state.tracks.find((entry) => entry.id === trackId);
      if (!track) return;

      track.color = color;
      if (state.activeTrackId === trackId) {
        const previousTrailColor = state.settings.trailStyle.trailColor;
        state.settings.trailStyle.trailColor = color;
        if (state.settings.trailStyle.markerColor === previousTrailColor) {
          state.settings.trailStyle.markerColor = color;
        }
      }
    }),

  updateTrackIcon: (trackId, icon) =>
    set((state) => {
      const track = state.tracks.find((entry) => entry.id === trackId);
      if (!track) return;

      track.activityIcon = icon;
      if (state.activeTrackId === trackId) {
        state.settings.trailStyle.currentIcon = icon;
      }
    }),

  updateTrackName: (trackId, name) =>
    set((state) => {
      const track = state.tracks.find((entry) => entry.id === trackId);
      if (track) track.name = name;
    }),

  toggleTrackVisibility: (trackId) =>
    set((state) => {
      const track = state.tracks.find((entry) => entry.id === trackId);
      if (track) track.visible = !track.visible;
    }),

  reorderTracks: (fromIndex, toIndex) =>
    set((state) => {
      const [movedTrack] = state.tracks.splice(fromIndex, 1);
      state.tracks.splice(toIndex, 0, movedTrack);
    }),

  addComparisonTrack: (track) =>
    set((state) => {
      state.comparisonTracks.push(track);
      reconcileComparisonMode(state);
    }),

  moveTrackToComparison: (trackId, primaryTrackId) =>
    set((state) => {
      const trackIndex = state.tracks.findIndex((track) => track.id === trackId);
      const track = state.tracks[trackIndex];
      const primary = state.tracks.find((entry) => entry.id === primaryTrackId);
      if (!track || !primary || trackId === primaryTrackId) return;
      const removedIndices = new Set<number>();
      state.journeySegments.forEach((segment, index) => {
        if (segment.type !== 'track' || segment.trackId !== trackId) return;
        removedIndices.add(index);
        // Connections touching the moved route belong to its sequence too.
        if (state.journeySegments[index - 1]?.type === 'transport') removedIndices.add(index - 1);
        if (state.journeySegments[index + 1]?.type === 'transport') removedIndices.add(index + 1);
      });
      state.comparisonTracks.push({
        id: track.id, name: track.name,
        color: track.color !== primary.color ? track.color : trackColors.find((color) => color !== primary.color && !state.comparisonTracks.some((entry) => entry.color === color)) ?? '#059669',
        track,
        visible: true, offset: 0, groupId: primary.id,
        sequenceRestore: {
          trackIndex,
          segments: state.journeySegments.flatMap((segment, index) => removedIndices.has(index) ? [{ index, segment }] : []),
        },
      });
      state.tracks.splice(trackIndex, 1);
      state.journeySegments = state.journeySegments.filter((_, index) => !removedIndices.has(index));
      if (!state.journeySegments.some((segment) => segment.type === 'track' && segment.trackId === primary.id)) {
        state.journeySegments.push({ id: createId('segment'), type: 'track', trackId: primary.id, duration: 60_000 });
      }
      state.activeTrackId = primary.id;
      state.settings.trailStyle.trailColor = primary.color;
      state.settings.trailStyle.currentIcon = primary.activityIcon;
      state.settings.trailStyle.markerColor = primary.color;
      state.playback.isPlaying = false;
      state.playback.currentTime = 0;
      state.playback.progress = 0;
      state.cinematicPlayed = false;
      state.animationPhase = 'idle';
      reconcileComparisonMode(state);
    }),

  removeComparisonTrack: (trackId) =>
    set((state) => {
      state.comparisonTracks = state.comparisonTracks.filter((track) => track.id !== trackId);
    }),

  ungroupComparisonTrack: (trackId) =>
    set((state) => {
      const comparisonTrack = state.comparisonTracks.find((entry) => entry.id === trackId);
      if (!comparisonTrack) return;

      state.comparisonTracks = state.comparisonTracks.filter((entry) => entry.id !== trackId);

      if (comparisonTrack.sequenceRestore) {
        const restore = comparisonTrack.sequenceRestore;
        state.tracks.splice(Math.min(restore.trackIndex, state.tracks.length), 0, comparisonTrack.track);
        restore.segments.forEach(({ index, segment }) => {
          if (!state.journeySegments.some((entry) => entry.id === segment.id)) {
            state.journeySegments.splice(Math.min(index, state.journeySegments.length), 0, segment);
          }
        });
        return;
      }

      const range = getTrackTimeRange(comparisonTrack.track);
      const insertIndex = range
        ? state.tracks.findIndex((existing) => {
            const existingRange = getTrackTimeRange(existing);
            return !!existingRange && existingRange.start > range.start;
          })
        : -1;

      insertTrackIntoJourney(
        state,
        comparisonTrack.track,
        insertIndex >= 0 ? insertIndex : undefined
      );
    }),

  toggleComparisonTrack: (trackId) =>
    set((state) => {
      const track = state.comparisonTracks.find((entry) => entry.id === trackId);
      if (track) {
        track.visible = !track.visible;
        if (track.visible) reconcileComparisonMode(state);
      }
    }),

  updateComparisonOffset: (trackId, offset) =>
    set((state) => {
      const track = state.comparisonTracks.find((entry) => entry.id === trackId);
      if (track) track.offset = offset;
    }),

  updateComparisonTrackName: (trackId, name) =>
    set((state) => {
      const track = state.comparisonTracks.find((entry) => entry.id === trackId);
      if (track) track.name = name;
    }),

  updateComparisonColor: (trackId, color) =>
    set((state) => {
      const track = state.comparisonTracks.find((entry) => entry.id === trackId);
      if (track) track.color = color;
    }),
});
