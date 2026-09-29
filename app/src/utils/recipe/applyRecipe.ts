import type { AppState } from '@/store/storeTypes';
import type { AppSettings, CameraSettings } from '@/types';
import {
  createDefaultCameraSettings,
  createDefaultPlayback,
  createDefaultSettings,
  createDefaultSocialShareSettings,
  mergeVideoExportSettings,
} from '@/store/defaults';
import type { Recipe } from './types';
import type { ResolvedRecipe } from './resolveRecipe';

function mergeSettings(recipe: Recipe, activeColor: string, activeIcon: string): AppSettings {
  const defaults = createDefaultSettings();
  const saved = recipe.settings ?? {};
  return {
    ...defaults,
    ...saved,
    trailStyle: {
      ...defaults.trailStyle,
      // The active track's colour is the trail's colour unless the recipe says
      // otherwise, so setting one colour does the obvious thing.
      trailColor: activeColor,
      markerColor: activeColor,
      currentIcon: activeIcon,
      ...saved.trailStyle,
    },
    mapOverlays: { ...defaults.mapOverlays, ...saved.mapOverlays },
  } as AppSettings;
}

function mergeCamera(recipe: Recipe): CameraSettings {
  return { ...createDefaultCameraSettings(), ...recipe.cameraSettings };
}

/**
 * Put a resolved recipe into the store, replacing whatever was there.
 *
 * A recipe describes a whole replay, not an addition to one, so this mirrors
 * opening a project rather than importing another GPX.
 */
export function applyRecipe(recipe: Recipe, resolved: ResolvedRecipe, store: AppState): void {
  store.reset();

  for (const track of resolved.tracks) {
    store.addTrack(track);
  }

  const activeTrack = resolved.tracks.find((track) => track.id === resolved.activeTrackId)
    ?? resolved.tracks[0];

  store.hydrateState({
    // Kept so saving preserves where this came from, not only what it became.
    sourceRecipe: recipe,
    activeTrackId: resolved.activeTrackId,
    journey: {
      id: 'recipe-journey',
      name: recipe.name ?? activeTrack.name,
      segments: [],
      totalDuration: 0,
      totalDistance: 0,
    },
    // addTrack built a segment per track; the recipe's layout replaces it,
    // carrying the leg durations it worked out. An empty list means the tracks
    // are alternatives and only the active one plays.
    journeySegments: resolved.journeySegments,
    userLandmarks: resolved.userLandmarks,
    textAnnotations: resolved.textAnnotations,
    iconChanges: resolved.iconChanges,
    pictures: [],
    videos: [],
    cinematicCameraKeyframes: [],
    hiddenLandmarkIds: [],
    selectedLandmarkId: null,
    isPlacingLandmark: false,
    // Authored pins are the point of a recipe; derived ones would compete with
    // them for the map's label budget.
    showAutomaticLandmarks: recipe.showAutomaticLandmarks ?? false,
    ...(recipe.nearbyPlaceTypes !== undefined ? { nearbyPlaceTypes: recipe.nearbyPlaceTypes } : {}),
    playback: {
      ...createDefaultPlayback(),
      routeTimingMode: recipe.routeTimingMode ?? 'recorded',
    },
    settings: mergeSettings(recipe, activeTrack.color, activeTrack.activityIcon),
    cameraSettings: mergeCamera(recipe),
    videoExportSettings: mergeVideoExportSettings(recipe.videoExportSettings),
    socialShareSettings: { ...createDefaultSocialShareSettings(), ...recipe.socialShareSettings },
    activePanel: 'tracks',
  });
}
