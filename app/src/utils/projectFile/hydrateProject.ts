import type { AppState } from '@/store/storeTypes';
import { parseGPX } from '@/utils/gpxParser';
import {
  createDefaultCameraSettings,
  createDefaultPlayback,
  createDefaultSettings,
  createDefaultSocialShareSettings,
  createDefaultVideoExportSettings,
} from '@/store/defaults';
import type { AppSettings, ComparisonTrack, PictureAnnotation, VideoAnnotation } from '@/types';
import type { ParsedProject, ReplayProjectFile, SerializedPicture, SerializedVideo } from './types';

/** Hydration is only reachable once a resolved project is known to be present. */
export type ResolvedParsedProject = ParsedProject & { project: ReplayProjectFile };

function hydratePicture(serialized: SerializedPicture): PictureAnnotation {
  return {
    id: serialized.id,
    file: null,
    url: '',
    isPlaceholder: true,
    originalFileName: serialized.originalFileName,
    lat: serialized.lat,
    lon: serialized.lon,
    timestamp: serialized.timestamp ? new Date(serialized.timestamp) : undefined,
    progress: serialized.progress,
    position: serialized.position,
    routeDistance: serialized.routeDistance,
    routeSegmentId: serialized.routeSegmentId,
    routeSegmentDistance: serialized.routeSegmentDistance,
    placementSource: serialized.placementSource,
    title: serialized.title,
    description: serialized.description,
    displayDuration: serialized.displayDuration,
  };
}

function hydrateVideo(serialized: SerializedVideo): VideoAnnotation {
  return {
    id: serialized.id,
    file: null,
    url: '',
    isPlaceholder: true,
    originalFileName: serialized.originalFileName,
    lat: serialized.lat,
    lon: serialized.lon,
    timestamp: serialized.timestamp ? new Date(serialized.timestamp) : undefined,
    progress: serialized.progress,
    title: serialized.title,
    description: serialized.description,
    durationSeconds: serialized.durationSeconds,
    placementSource: serialized.placementSource,
    routeDistance: serialized.routeDistance,
    routeSegmentId: serialized.routeSegmentId,
    routeSegmentDistance: serialized.routeSegmentDistance,
  };
}

/** `routes/collada-de-toses.gpx` -> `collada-de-toses`, for a track meta with no name. */
function nameFromRouteFile(routeFile: string): string {
  return routeFile.split('/').pop()?.replace(/\.(gpx|kml)$/i, '') || 'Route';
}

function mergeSettings(saved: ReplayProjectFile['settings']): AppSettings {
  const defaults = createDefaultSettings();
  return {
    ...defaults,
    ...saved,
    trailStyle: { ...defaults.trailStyle, ...saved?.trailStyle },
    mapOverlays: { ...defaults.mapOverlays, ...saved?.mapOverlays },
  };
}

export function hydrateProject(parsed: ResolvedParsedProject, store: AppState): void {
  // Prepare everything that can fail before replacing the current session.
  // An archive can be valid ZIP/JSON while containing a broken route file.
  const tracks = parsed.tracks.map(({ meta, gpxText }) => {
    const track = parseGPX(gpxText, nameFromRouteFile(meta.routeFile));
    // Every field but the route file is optional, so a hand-authored project
    // can omit it: an absent id keeps the one parseGPX generated, and an absent
    // colour or icon lets addTrack assign the palette default.
    if (meta.id) track.id = meta.id;
    // The saved name wins over the GPX's own <name>, so a renamed track and an
    // authored title both survive a round trip.
    if (meta.name) track.name = meta.name;
    if (meta.color) track.color = meta.color;
    if (meta.activityIcon) track.activityIcon = meta.activityIcon;
    track.visible = meta.visible ?? true;
    return track;
  });

  const comparisonTracks = parsed.comparisonTracks.map(({ meta, gpxText }) => {
    const track = parseGPX(gpxText, nameFromRouteFile(meta.routeFile));
    if (meta.id) track.id = meta.id;
    if (meta.name) track.name = meta.name;
    if (meta.color) track.color = meta.color;
    track.visible = meta.visible ?? true;

    const comparisonTrack: ComparisonTrack = {
      id: track.id,
      name: track.name,
      color: track.color,
      track,
      visible: track.visible,
      offset: meta.offset ?? 0,
    };
    return comparisonTrack;
  });

  const { project } = parsed;

  const restoredState: Partial<AppState> = {
    // An absent activeTrackId means "whatever a plain GPX upload would pick",
    // which is the first track.
    activeTrackId: project.activeTrackId ?? tracks[0]?.id ?? null,
    // addTrack already built a journey and one segment per track, which is
    // exactly what dropping those GPX files on the page produces. Only
    // overwrite that when the project actually says otherwise — an omitted
    // field means "same as a plain upload", not "no journey at all".
    ...(project.journey ? { journey: project.journey } : {}),
    ...(project.journeySegments ? { journeySegments: project.journeySegments } : {}),
    pictures: (project.pictures ?? []).map(hydratePicture),
    videos: (project.videos ?? []).map(hydrateVideo),
    iconChanges: project.iconChanges ?? [],
    textAnnotations: project.textAnnotations ?? [],
    // Predates cinematic mode in older projects.
    cinematicCameraKeyframes: project.cinematicCameraKeyframes ?? [],
    userLandmarks: project.userLandmarks ?? [],
    hiddenLandmarkIds: project.hiddenLandmarkIds ?? [],
    selectedLandmarkId: null,
    isPlacingLandmark: false,
    enabledLandmarkGroups: project.enabledLandmarkGroups ?? [],
    nearbyPlaceTypes: project.nearbyPlaceTypes ?? null,
    showAutomaticLandmarks: project.showAutomaticLandmarks ?? false,
    // Older saved projects predate routeTimingMode; fall back to 'recorded'
    // (the app default) rather than leaving it undefined. Built from the
    // defaults rather than the playback state of the project being replaced.
    playback: { ...createDefaultPlayback(), routeTimingMode: project.routeTimingMode ?? 'recorded' },
    cameraPosition: project.cameraPosition ?? null,
    // Merge defaults so projects saved before newer presentation controls
    // (such as statsScale) retain the original 1x appearance. trailStyle and
    // mapOverlays are merged a level deeper too, so a hand-authored project
    // that sets one of their keys does not blank out the rest.
    settings: mergeSettings(project.settings),
    // Older saved projects predate cameraStability; backfill it so an
    // undefined value doesn't turn the camera smoothing math into NaN.
    cameraSettings: { ...createDefaultCameraSettings(), ...project.cameraSettings },
    videoExportSettings: { ...createDefaultVideoExportSettings(), ...project.videoExportSettings },
    socialShareSettings: { ...createDefaultSocialShareSettings(), ...project.socialShareSettings },
    activePanel: 'tracks',
  };

  store.reset();
  tracks.forEach((track) => store.addTrack(track));
  comparisonTracks.forEach((track) => store.addComparisonTrack(track));
  store.hydrateState(restoredState);
}
