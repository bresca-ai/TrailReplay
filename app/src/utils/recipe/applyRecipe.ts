import type { AppState } from '@/store/storeTypes';
import type { AppSettings, CameraSettings } from '@/types';
import {
  createDefaultCameraSettings,
  createDefaultPlayback,
  createDefaultSettings,
  createDefaultSocialShareSettings,
  createDefaultVideoExportSettings,
} from '@/store/defaults';
import type { Recipe } from './types';
import type { ResolvedRecipe } from './resolveRecipe';
import { createPhotoSlot, presetSettings } from '@/components/sidebar/export/socialSharePresets';
import {
  getFollowBehindLevelForStopIndex,
  getFollowBehindStopIndexForLevel,
  getFollowBehindZoomLevelForPreset,
  getNearestFollowBehindPreset,
} from '@/utils/followBehindCamera';

function mergeSettings(recipe: Recipe, activeColor: string, activeIcon: string): AppSettings {
  const defaults = createDefaultSettings();
  const saved = recipe.settings ?? {};
  const coverFont = recipe.socialShareSettings?.layoutPreset === 'long-way' ? 'poster'
    : recipe.socialShareSettings?.layoutPreset === 'ridge-photo' || recipe.socialShareSettings?.layoutPreset === 'photo-grid' ? 'condensed'
      : defaults.trailStyle.overlayFont;
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
      overlayFont: coverFont,
      ...saved.trailStyle,
    },
    mapOverlays: { ...defaults.mapOverlays, ...saved.mapOverlays },
  } as AppSettings;
}

export function mergeRecipeCameraSettings(recipe: Recipe): CameraSettings {
  const defaults = createDefaultCameraSettings();
  const authored = recipe.cameraSettings ?? {};
  const merged = { ...defaults, ...authored };

  if (authored.followBehindZoomLevel !== undefined) {
    const stopIndex = getFollowBehindStopIndexForLevel(authored.followBehindZoomLevel);
    const level = getFollowBehindLevelForStopIndex(stopIndex);
    return {
      ...merged,
      followBehindZoomLevel: level,
      followBehindPreset: getNearestFollowBehindPreset(level),
    };
  }

  if (authored.followBehindPreset !== undefined) {
    return {
      ...merged,
      followBehindZoomLevel: getFollowBehindZoomLevelForPreset(authored.followBehindPreset),
    };
  }

  return merged;
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
  const defaultCover = createDefaultSocialShareSettings();
  const authoredCover = recipe.socialShareSettings;
  const coverPreset = authoredCover?.layoutPreset
    ? presetSettings(authoredCover.layoutPreset, defaultCover)
    : {};
  const mergedCover = { ...defaultCover, ...coverPreset, ...authoredCover };

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
    cameraSettings: mergeRecipeCameraSettings(recipe),
    videoExportSettings: { ...createDefaultVideoExportSettings(), ...recipe.videoExportSettings },
    socialShareSettings: {
      ...mergedCover,
      ...(mergedCover.template === 'split' && !mergedCover.photoSlots?.length
        ? { photoSlots: [createPhotoSlot('hero', 0, 0, 1, 0.66)] }
        : {}),
      ...(recipe.socialShareSettings?.stats ? {
        stats: recipe.socialShareSettings.stats.map((stat, index) => ({
          id: stat.id || `recipe-stat-${index}`,
          metric: stat.metric || 'custom',
          label: stat.label ?? '',
          value: stat.value ?? '',
          visible: stat.visible !== false,
          icon: stat.icon,
        })),
      } : {}),
      ...(recipe.videoExportSettings?.includeCover
        ? { aspectRatio: recipe.videoExportSettings.aspectRatio ?? createDefaultVideoExportSettings().aspectRatio }
        : {}),
    },
    activePanel: 'tracks',
  });
}
