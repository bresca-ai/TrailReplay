import type { LandmarkType, NearbyPlacesCoverage, RouteLandmark } from '@/types/landmarks';
import type { AppState } from '@/store/storeTypes';
import type { AppSliceCreator } from './types';

type LandmarksSlice = Pick<AppState,
  'landmarkPriorityIds' | 'setLandmarkPriorityIds' | 'userLandmarks' | 'enabledLandmarkGroups' | 'hiddenLandmarkIds' | 'selectedLandmarkId' | 'isPlacingLandmark' |
  'nearbyPlaceTypes' |
  'showAutomaticLandmarks' |
  'enrichedLandmarks' | 'nearbyPlacesEnabled' | 'nearbyPlacesLoading' | 'nearbyPlacesError' | 'nearbyPlacesCoverage' |
  'addLandmark' | 'updateLandmark' | 'removeLandmark' | 'hideLandmark' | 'restoreHiddenLandmarks' |
  'selectLandmark' | 'setIsPlacingLandmark' | 'adoptLandmark' | 'setEnabledLandmarkGroups' | 'setNearbyPlaceTypes' |
  'setNearbyPlacesEnabled' | 'setEnrichedLandmarks' | 'setNearbyPlacesStatus' | 'setShowAutomaticLandmarks'>;

export const createLandmarksSlice: AppSliceCreator<LandmarksSlice> = (set) => ({
  userLandmarks: [],
  landmarkPriorityIds: [],
  hiddenLandmarkIds: [],
  selectedLandmarkId: null,
  isPlacingLandmark: false,
  showAutomaticLandmarks: false,
  enabledLandmarkGroups: [],
  nearbyPlaceTypes: null,
  enrichedLandmarks: [],
  nearbyPlacesEnabled: true,
  nearbyPlacesLoading: false,
  nearbyPlacesError: null,
  nearbyPlacesCoverage: null,
  setLandmarkPriorityIds: (ids) => set((state) => { state.landmarkPriorityIds = [...new Set(ids)]; }),
  addLandmark: (landmark) => set((state) => { state.userLandmarks.push(landmark); }),
  updateLandmark: (id, updates) => set((state) => {
    const landmark = state.userLandmarks.find((entry) => entry.id === id);
    if (landmark) Object.assign(landmark, updates);
  }),
  // Only drops the user's own copy. An adopted landmark already hid its derived
  // original when it was adopted, so that stays suppressed; a landmark the user
  // placed by hand leaves nothing behind to restore.
  removeLandmark: (id) => set((state) => {
    state.userLandmarks = state.userLandmarks.filter((entry) => entry.id !== id);
    if (state.selectedLandmarkId === id) state.selectedLandmarkId = null;
  }),
  hideLandmark: (id) => set((state) => {
    if (!state.hiddenLandmarkIds.includes(id)) state.hiddenLandmarkIds.push(id);
    if (state.selectedLandmarkId === id) state.selectedLandmarkId = null;
  }),
  restoreHiddenLandmarks: () => set((state) => { state.hiddenLandmarkIds = []; }),
  selectLandmark: (id) => set((state) => { state.selectedLandmarkId = id; }),
  setIsPlacingLandmark: (isPlacing) => set((state) => {
    state.isPlacingLandmark = isPlacing;
    if (isPlacing) state.selectedLandmarkId = null;
  }),
  adoptLandmark: (landmark: RouteLandmark) => {
    const adopted: RouteLandmark = { ...landmark, source: 'user', display: 'highlight' };
    set((state) => {
      // The copy keeps the original id so hiding the original also covers it,
      // and so re-adopting the same place cannot produce a duplicate.
      if (!state.hiddenLandmarkIds.includes(landmark.id)) state.hiddenLandmarkIds.push(landmark.id);
      if (!state.userLandmarks.some((entry) => entry.id === landmark.id)) {
        state.userLandmarks.push(adopted);
      }
      state.selectedLandmarkId = landmark.id;
    });
    return landmark.id;
  },
  setShowAutomaticLandmarks: (showAutomaticLandmarks) => set((state) => { state.showAutomaticLandmarks = showAutomaticLandmarks; }),
  setEnabledLandmarkGroups: (groups: LandmarkType[]) => set((state) => { state.enabledLandmarkGroups = groups; }),
  setNearbyPlaceTypes: (types) => set((state) => { state.nearbyPlaceTypes = types; }),
  setNearbyPlacesEnabled: (enabled) => set((state) => { state.nearbyPlacesEnabled = enabled; if (!enabled) { state.enrichedLandmarks = []; state.nearbyPlacesCoverage = null; } }),
  setEnrichedLandmarks: (landmarks) => set((state) => { state.enrichedLandmarks = landmarks; }),
  setNearbyPlacesStatus: (loading, error = null, coverage: NearbyPlacesCoverage | null = null) => set((state) => { state.nearbyPlacesLoading = loading; state.nearbyPlacesError = error; state.nearbyPlacesCoverage = coverage; }),
});
