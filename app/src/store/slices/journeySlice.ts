import { createId } from '@/utils/id';
import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';

type JourneySlice = Pick<
  AppState,
  | 'journey'
  | 'journeySegments'
  | 'cinematicCameraKeyframes'
  | 'cameraPlanReview'
  | 'stageCameraPlan'
  | 'previewCameraPlan'
  | 'applyCameraPlan'
  | 'discardCameraPlan'
  | 'createJourney'
  | 'updateJourneyName'
  | 'addJourneySegment'
  | 'removeJourneySegment'
  | 'reorderJourneySegments'
  | 'updateJourneySegmentDuration'
  | 'addTransportSegment'
  | 'clearJourney'
  | 'addCinematicCameraKeyframe'
  | 'updateCinematicCameraKeyframe'
  | 'removeCinematicCameraKeyframe'
>;

export const createJourneySlice: AppSliceCreator<JourneySlice> = (set) => ({
  journey: null,
  journeySegments: [],
  // Cinematic keyframes are journey data, not settings: they reference a
  // segment anchor and are meaningless without the route they were captured
  // on. See CINEMATIC_CAMERA_PLAN.md section 3.4.
  cinematicCameraKeyframes: [],
  cameraPlanReview: null,
  stageCameraPlan: (review) => set((state) => {
    state.cameraPlanReview = { ...review, previewing: false };
  }),
  previewCameraPlan: (previewing) => set((state) => {
    if (state.cameraPlanReview) state.cameraPlanReview.previewing = previewing;
  }),
  applyCameraPlan: (currentFingerprint) => set((state) => {
    if (!state.cameraPlanReview || state.cameraPlanReview.contextFingerprint !== currentFingerprint) return;
    state.cinematicCameraKeyframes = state.cameraPlanReview.frames;
    state.cameraPlanReview = null;
    state.cameraSettings.mode = 'cinematic';
    state.settings.cameraMode = 'cinematic';
  }),
  discardCameraPlan: () => set((state) => { state.cameraPlanReview = null; }),

  createJourney: (name) =>
    set((state) => {
      state.journey = {
        id: createId('journey'),
        name,
        segments: [],
        totalDuration: 0,
        totalDistance: 0,
      };
    }),

  updateJourneyName: (name) =>
    set((state) => {
      if (state.journey) state.journey.name = name;
    }),

  addJourneySegment: (segment) =>
    set((state) => {
      state.journeySegments.push(segment);
    }),

  removeJourneySegment: (segmentId) =>
    set((state) => {
      state.journeySegments = state.journeySegments.filter((segment) => segment.id !== segmentId);
    }),

  reorderJourneySegments: (segments) =>
    set((state) => {
      state.journeySegments = segments;
    }),

  updateJourneySegmentDuration: (segmentId, duration) =>
    set((state) => {
      const segment = state.journeySegments.find((entry) => entry.id === segmentId);
      if (segment) segment.duration = duration;
    }),

  addTransportSegment: (from, to, mode) =>
    set((state) => {
      state.journeySegments.push({
        id: createId('transport'),
        type: 'transport',
        mode,
        from,
        to,
        duration: 0,
        distance: 0,
      });
    }),

  clearJourney: () =>
    set((state) => {
      state.journey = null;
      state.journeySegments = [];
    }),

  addCinematicCameraKeyframe: (keyframe) =>
    set((state) => {
      const frames = state.cameraPlanReview?.previewing ? state.cameraPlanReview.frames : state.cinematicCameraKeyframes;
      frames.push(keyframe);
    }),

  updateCinematicCameraKeyframe: (keyframeId, updates) =>
    set((state) => {
      const frames = state.cameraPlanReview?.previewing ? state.cameraPlanReview.frames : state.cinematicCameraKeyframes;
      const keyframe = frames.find((entry) => entry.id === keyframeId);
      if (keyframe) {
        Object.assign(keyframe, updates);
        if (keyframe.terrain && ['bearingDeg', 'pitchDeg', 'zoom', 'anchor', 'frame', 'easing'].some((key) => key in updates)) {
          keyframe.terrain.confidence = undefined;
          keyframe.terrain.estimatedMinClearanceMeters = undefined;
          keyframe.terrain.warnings = ['Shot edited since terrain assessment. Reassess before accepting.'];
        }
      }
    }),

  removeCinematicCameraKeyframe: (keyframeId) =>
    set((state) => {
      if (state.cameraPlanReview?.previewing) {
        state.cameraPlanReview.frames = state.cameraPlanReview.frames.filter((entry) => entry.id !== keyframeId);
      } else {
        state.cinematicCameraKeyframes = state.cinematicCameraKeyframes.filter((entry) => entry.id !== keyframeId);
      }
    }),
});
