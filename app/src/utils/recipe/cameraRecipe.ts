import type { GPXTrack, JourneySegment } from '@/types';
import type { CinematicCameraKeyframe } from '@/utils/cinematicCameraPlan';
import type { AppState } from '@/store/storeTypes';
import { terrainContextFingerprint } from '@/utils/terrainCamera/context';
import { calculateDistance } from '@/utils/gpx/trackStats';
import { RecipeError, type Recipe, type RecipeCameraFrame, type RecipeCameraKeyframes } from './types';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Resolve recipe distances (local to one segment occurrence) into runtime stable segment anchors. */
export function resolveRecipeCameraKeyframes(
  recipe: Recipe,
  tracks: GPXTrack[],
  journeySegments: JourneySegment[],
): CinematicCameraKeyframe[] {
  const spec = recipe.cameraKeyframes;
  if (spec === undefined) return [];
  if (!spec || spec.version !== 1) throw new RecipeError(`cameraKeyframes.version: unsupported version "${String(spec?.version)}"`);
  if (spec.contextFingerprint !== undefined && (typeof spec.contextFingerprint !== 'string' || spec.contextFingerprint.length === 0)) {
    throw new RecipeError('cameraKeyframes.contextFingerprint must be a non-empty string');
  }
  if (spec.contextFingerprint && spec.contextFingerprint !== terrainContextFingerprint(tracks, journeySegments, recipe.routeTimingMode ?? 'recorded')) {
    throw new RecipeError('cameraKeyframes.contextFingerprint does not match the current routes and journey timeline');
  }
  if (!Array.isArray(spec.frames)) throw new RecipeError('cameraKeyframes.frames must be an array');
  if (spec.frames.length > 1000) throw new RecipeError('cameraKeyframes.frames supports at most 1000 frames');
  const seen = new Set<string>();
  const anchors = new Set<string>();
  return spec.frames.map((frame, index) => {
    const label = `cameraKeyframes.frames[${index}]`;
    if (!frame || typeof frame !== 'object') throw new RecipeError(`${label} must be an object`);
    if (!frame.id || typeof frame.id !== 'string') throw new RecipeError(`${label}.id must be a non-empty string`);
    if (frame.title !== undefined && typeof frame.title !== 'string') throw new RecipeError(`${label}.title must be a string`);
    if (seen.has(frame.id)) throw new RecipeError(`${label}.id duplicates "${frame.id}"`);
    seen.add(frame.id);
    const { anchor } = frame;
    if (!anchor || typeof anchor.trackId !== 'string' || typeof anchor.segmentId !== 'string') {
      throw new RecipeError(`${label}.anchor requires trackId and segmentId`);
    }
    const track = tracks.find((entry) => entry.id === anchor.trackId);
    if (!track) throw new RecipeError(`${label}.anchor.trackId "${anchor.trackId}" is unknown`);
    const segment = journeySegments.find((entry) => entry.id === anchor.segmentId);
    if (!segment || segment.type !== 'track' || segment.trackId !== track.id) {
      throw new RecipeError(`${label}.anchor.segmentId "${anchor.segmentId}" is not an active occurrence of track "${track.id}"`);
    }
    if (!finite(anchor.distanceMeters) || anchor.distanceMeters < 0 || anchor.distanceMeters > track.totalDistance) {
      throw new RecipeError(`${label}.anchor.distanceMeters must be between 0 and ${track.totalDistance}`);
    }
    const anchorKey = JSON.stringify([anchor.segmentId, anchor.distanceMeters]);
    if (anchors.has(anchorKey)) throw new RecipeError(`${label}.anchor duplicates another shot at the same segment distance`);
    anchors.add(anchorKey);
    const bearingValid = finite(frame.bearingDeg) && (frame.frame === 'route'
      ? frame.bearingDeg >= -360 && frame.bearingDeg <= 360
      : frame.bearingDeg >= 0 && frame.bearingDeg < 360);
    if (!bearingValid) throw new RecipeError(`${label}.bearingDeg is outside the allowed range for its frame`);
    if (!finite(frame.pitchDeg) || frame.pitchDeg < 0 || frame.pitchDeg > 85) throw new RecipeError(`${label}.pitchDeg must be in [0, 85]`);
    if (!finite(frame.zoom) || frame.zoom < 0 || frame.zoom > 20) throw new RecipeError(`${label}.zoom must be in [0, 20]`);
    if (frame.frame !== 'world' && frame.frame !== 'route') throw new RecipeError(`${label}.frame must be "world" or "route"`);
    if (!['smooth', 'linear', 'hold'].includes(frame.easing)) throw new RecipeError(`${label}.easing must be "smooth", "linear" or "hold"`);
    if (frame.terrain !== undefined && (!frame.terrain || typeof frame.terrain !== 'object' || Array.isArray(frame.terrain))) {
      throw new RecipeError(`${label}.terrain must be an object`);
    }
    if (frame.terrain && (frame.terrain.confidence !== undefined
      && (!finite(frame.terrain.confidence) || frame.terrain.confidence < 0 || frame.terrain.confidence > 1))) {
      throw new RecipeError(`${label}.terrain.confidence must be in [0, 1]`);
    }
    if (frame.terrain?.rationale !== undefined && typeof frame.terrain.rationale !== 'string') throw new RecipeError(`${label}.terrain.rationale must be a string`);
    if (frame.terrain?.estimatedMinClearanceMeters !== undefined && frame.terrain.estimatedMinClearanceMeters !== null && !finite(frame.terrain.estimatedMinClearanceMeters)) throw new RecipeError(`${label}.terrain.estimatedMinClearanceMeters must be finite or null`);
    if (frame.terrain?.warnings !== undefined && (!Array.isArray(frame.terrain.warnings) || frame.terrain.warnings.some((warning) => typeof warning !== 'string'))) {
      throw new RecipeError(`${label}.terrain.warnings must be an array of strings`);
    }
    return {
      id: frame.id,
      ...(frame.title !== undefined ? { title: frame.title } : {}),
      anchor: { routeSegmentId: segment.id, routeSegmentDistance: anchor.distanceMeters },
      bearingDeg: frame.bearingDeg,
      pitchDeg: frame.pitchDeg,
      zoom: frame.zoom,
      frame: frame.frame,
      easing: frame.easing,
      ...(frame.terrain ? { terrain: frame.terrain } : {}),
    };
  });
}

/** Save the current camera plan into the source recipe, retaining its other authored content. */
export function serializeCameraRecipe(state: AppState, routeFiles?: Map<string, string>): Recipe {
  const source = state.sourceRecipe ?? {};
  const currentFiles = new Map(routeFiles ?? []);
  const serializeTrack = (track: GPXTrack, index: number, specs: Recipe['tracks']) => {
    const sourceSpecs = Array.isArray(specs) ? specs : [];
    const prior = sourceSpecs.find((entry) => entry.id === track.id || entry.file === track.name) ?? sourceSpecs[index];
    const fallbackFile = /\.(gpx|kml)$/i.test(track.name) ? track.name : `${track.name}.gpx`;
    const fields = prior ?? { file: fallbackFile };
    return {
      ...fields,
      id: track.id,
      file: currentFiles.get(track.id) ?? prior?.file ?? fallbackFile,
      name: track.name,
      color: track.color,
      activityIcon: track.activityIcon,
      visible: track.visible,
    };
  };
  const tracks = state.tracks.map((track, index) => serializeTrack(track, index, source.tracks));
  const comparisonTracks = state.comparisonTracks.map((entry, index) => ({
    ...serializeTrack(entry.track, index, source.comparisonTracks),
    name: entry.name,
    color: entry.color,
    visible: entry.visible,
    offset: entry.offset,
  }));
  const trackById = new Map(state.tracks.map((track) => [track.id, track]));
  const routeAnchor = (routeDistance: number | undefined): { segmentId: string; trackId: string; distanceMeters: number } | null => {
    if (!finite(routeDistance) || routeDistance < 0) return null;
    let start = 0;
    for (const segment of state.journeySegments) {
      const distance = segment.type === 'track'
        ? trackById.get(segment.trackId)?.totalDistance ?? 0
        : calculateDistance(segment.from.lat, segment.from.lon, segment.to.lat, segment.to.lon);
      if (routeDistance >= start && routeDistance <= start + distance && segment.type === 'track') {
        return { segmentId: segment.id, trackId: segment.trackId, distanceMeters: Math.max(0, routeDistance - start) };
      }
      if (routeDistance >= start && routeDistance <= start + distance && segment.type === 'transport') {
        return null;
      }
      start += distance;
    }
    return null;
  };
  const landmarks = state.userLandmarks.filter((item) => item.source === 'user').map((item) => {
    const anchor = routeAnchor(item.routeDistanceMeters);
    return {
      id: item.id, title: item.title, type: item.type, subtitle: item.subtitle, icon: item.icon,
      color: item.color, importance: item.importance, display: item.display,
      ...(anchor ? anchor : { lat: item.lat, lon: item.lon, ...(item.progress !== null ? { progress: item.progress } : {}) }),
    };
  });
  const annotations = state.textAnnotations.map((item) => {
    const anchor = routeAnchor(item.routeDistance);
    return {
      id: item.id, title: item.title, subtitle: item.subtitle, code: item.code, eyebrow: item.eyebrow,
      meta: item.meta, description: item.description, color: item.color, displayDuration: item.displayDuration,
      presentation: item.presentation, logo: item.logo, holdDuration: item.holdDuration, translations: item.translations,
      ...(anchor ? anchor : { lat: item.lat, lon: item.lon, progress: item.progress }),
    };
  });
  const iconChanges = state.iconChanges.map((item) => {
    const anchor = routeAnchor(item.routeDistance);
    return { id: item.id, icon: item.icon, label: item.label, ...(anchor ?? { progress: item.progress }) };
  });
  const frames: RecipeCameraFrame[] = state.cinematicCameraKeyframes.flatMap((keyframe) => {
    const segment = state.journeySegments.find((entry) => entry.type === 'track' && entry.id === keyframe.anchor.routeSegmentId);
    if (segment?.type !== 'track') return [];
    const track = state.tracks.find((entry) => entry.id === segment.trackId);
    if (!track || !finite(keyframe.anchor.routeSegmentDistance)
      || keyframe.anchor.routeSegmentDistance < 0 || keyframe.anchor.routeSegmentDistance > track.totalDistance) return [];
    return [{
      id: keyframe.id,
      ...(keyframe.title !== undefined ? { title: keyframe.title } : {}),
      anchor: { trackId: segment.trackId, segmentId: segment.id, distanceMeters: keyframe.anchor.routeSegmentDistance },
      bearingDeg: keyframe.bearingDeg,
      pitchDeg: keyframe.pitchDeg,
      zoom: keyframe.zoom,
      frame: keyframe.frame,
      easing: keyframe.easing,
      ...(keyframe.terrain ? { terrain: keyframe.terrain } : {}),
    }];
  });
  const cameraKeyframes: RecipeCameraKeyframes = {
    version: 1,
    contextFingerprint: terrainContextFingerprint(state.tracks, state.journeySegments, state.playback.routeTimingMode),
    frames,
  };
  return {
    ...source,
    name: state.journey?.name ?? source.name,
    tracks,
    comparisonTracks,
    segments: state.journeySegments.map((segment) => segment.type === 'track' ? ({
      id: segment.id, type: 'track' as const, trackId: segment.trackId, duration: segment.duration,
    }) : ({ ...segment })),
    mode: state.journeySegments.filter((segment) => segment.type === 'track').length > 1 ? 'stitch' : 'alternatives',
    activeTrack: state.activeTrackId ?? undefined,
    landmarks,
    annotations,
    iconChanges,
    routeTimingMode: state.playback.routeTimingMode,
    showAutomaticLandmarks: state.showAutomaticLandmarks,
    nearbyPlaceTypes: state.nearbyPlaceTypes,
    settings: state.settings,
    cameraSettings: state.cameraSettings,
    videoExportSettings: state.videoExportSettings,
    socialShareSettings: {
      ...state.socialShareSettings,
      photoSlots: state.socialShareSettings.photoSlots?.map((slot, index) => {
        const prior = source.socialShareSettings?.photoSlots?.find((entry) => entry.id === slot.id)
          ?? source.socialShareSettings?.photoSlots?.[index];
        return {
          ...prior,
          ...slot,
          // Object URLs only exist in this browser session. Keep any authored
          // portable media reference for an agent editing the source recipe.
          imageUrl: slot.imageUrl?.startsWith('blob:') ? prior?.imageUrl ?? null : slot.imageUrl,
        };
      }),
    },
    cameraKeyframes,
  };
}
