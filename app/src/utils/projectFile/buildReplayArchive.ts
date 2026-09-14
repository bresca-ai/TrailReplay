import { zip, type Zippable } from 'fflate';
import type { AppState } from '@/store/storeTypes';
import { serializeTrackToGpx } from '@/utils/gpxParser';
import type { GPXTrack } from '@/types';
import {
  APP_VERSION,
  CURRENT_FORMAT_VERSION,
  type ReplayComparisonTrackMeta,
  type ReplayManifest,
  type ReplayProjectFile,
  type ReplayTrackMeta,
  type SerializedPicture,
  type SerializedVideo,
} from './types';

function slugifyRouteFileName(name: string, id: string, usedNames: Set<string>): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'route';
  let fileName = `${base}.gpx`;
  if (usedNames.has(fileName)) {
    fileName = `${base}-${id.slice(-8)}.gpx`;
  }
  usedNames.add(fileName);
  return fileName;
}

function buildRouteFiles(
  tracks: GPXTrack[],
  usedNames: Set<string>,
): { metas: ReplayTrackMeta[]; files: Record<string, Uint8Array> } {
  const files: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  const metas = tracks.map((track): ReplayTrackMeta => {
    const fileName = slugifyRouteFileName(track.name, track.id, usedNames);
    const routeFile = `routes/${fileName}`;
    files[routeFile] = encoder.encode(serializeTrackToGpx(track));

    return {
      id: track.id,
      name: track.name,
      activityIcon: track.activityIcon,
      color: track.color,
      visible: track.visible,
      routeFile,
    };
  });

  return { metas, files };
}

function serializePicture(picture: AppState['pictures'][number]): SerializedPicture {
  return {
    id: picture.id,
    originalFileName: picture.file?.name ?? picture.originalFileName ?? 'unknown',
    lat: picture.lat,
    lon: picture.lon,
    timestamp: picture.timestamp?.toISOString(),
    progress: picture.progress,
    position: picture.position,
    routeDistance: picture.routeDistance,
    routeSegmentId: picture.routeSegmentId,
    routeSegmentDistance: picture.routeSegmentDistance,
    placementSource: picture.placementSource,
    title: picture.title,
    description: picture.description,
    displayDuration: picture.displayDuration,
  };
}

function serializeVideo(video: AppState['videos'][number]): SerializedVideo {
  return {
    id: video.id,
    originalFileName: video.file?.name ?? video.originalFileName ?? 'unknown',
    lat: video.lat,
    lon: video.lon,
    timestamp: video.timestamp?.toISOString(),
    progress: video.progress,
    title: video.title,
    description: video.description,
    durationSeconds: video.durationSeconds,
    placementSource: video.placementSource,
    routeDistance: video.routeDistance,
    routeSegmentId: video.routeSegmentId,
    routeSegmentDistance: video.routeSegmentDistance,
  };
}

export async function buildReplayArchive(state: AppState): Promise<Blob> {
  const usedRouteNames = new Set<string>();
  const { metas: trackMetas, files: trackFiles } = buildRouteFiles(state.tracks, usedRouteNames);
  const { metas: comparisonMetas, files: comparisonFiles } = buildRouteFiles(
    state.comparisonTracks.map((entry) => entry.track),
    usedRouteNames,
  );

  const comparisonTrackMetas: ReplayComparisonTrackMeta[] = comparisonMetas.map((meta, index) => ({
    id: state.comparisonTracks[index].id,
    name: state.comparisonTracks[index].name,
    color: state.comparisonTracks[index].color,
    visible: state.comparisonTracks[index].visible,
    offset: state.comparisonTracks[index].offset,
    routeFile: meta.routeFile,
  }));

  const project: ReplayProjectFile = {
    formatVersion: CURRENT_FORMAT_VERSION,
    tracks: trackMetas,
    activeTrackId: state.activeTrackId,
    comparisonTracks: comparisonTrackMetas,
    journey: state.journey,
    journeySegments: state.journeySegments,
    pictures: state.pictures.map(serializePicture),
    videos: state.videos.map(serializeVideo),
    iconChanges: state.iconChanges,
    textAnnotations: state.textAnnotations,
    cinematicCameraKeyframes: state.cinematicCameraKeyframes,
    userLandmarks: state.userLandmarks,
    hiddenLandmarkIds: state.hiddenLandmarkIds,
    enabledLandmarkGroups: state.enabledLandmarkGroups,
    nearbyPlaceTypes: state.nearbyPlaceTypes,
    showAutomaticLandmarks: state.showAutomaticLandmarks,
    routeTimingMode: state.playback.routeTimingMode,
    cameraPosition: state.cameraPosition,
    settings: state.settings,
    cameraSettings: state.cameraSettings,
    videoExportSettings: state.videoExportSettings,
    socialShareSettings: state.socialShareSettings,
  };

  const savedAt = new Date().toISOString();
  const manifest: ReplayManifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    projectName: state.journey?.name ?? 'Untitled Journey',
    createdAt: savedAt,
    savedAt,
    trackCount: state.tracks.length,
    pictureCount: state.pictures.length,
    videoCount: state.videos.length,
  };

  const encoder = new TextEncoder();
  const files: Zippable = {
    ...trackFiles,
    ...comparisonFiles,
    'manifest.json': encoder.encode(JSON.stringify(manifest, null, 2)),
    'project.json': encoder.encode(JSON.stringify(project, null, 2)),
    // The source, when there was one. A project saved from a recipe can then be
    // reopened, edited as a recipe, and rebuilt, rather than being a dead end.
    ...(state.sourceRecipe
      ? { 'recipe.json': encoder.encode(JSON.stringify(state.sourceRecipe, null, 2)) }
      : {}),
  };

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });

  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}
