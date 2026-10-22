import { unzip } from 'fflate';
import {
  APP_VERSION,
  MAX_ARCHIVE_SIZE_BYTES,
  SUPPORTED_FORMAT_VERSIONS,
  CURRENT_FORMAT_VERSION,
  type ParsedProject,
  type ReplayManifest,
  type ReplayProjectFile,
} from './types';
import { ReplayArchiveError } from './validation';
import type { Recipe } from '@/utils/recipe/types';

function decodeJson<T>(files: Record<string, Uint8Array>, path: string): T | null {
  const bytes = files[path];
  if (!bytes) return null;

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ReplayArchiveError('corrupt', `${path} is not valid JSON — this is not a valid .replay file`);
  }
}

/**
 * manifest.json is diagnostic metadata the app derives from the project it just
 * wrote, so a project written by hand or by a script can leave it out entirely
 * (see docs/AGENT_REPLAY_FILE.md) and get the same one back.
 */
function synthesizeManifest(project: ReplayProjectFile | null, routeCount: number): ReplayManifest {
  const now = new Date().toISOString();
  return {
    formatVersion: project?.formatVersion ?? CURRENT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    projectName: project?.journey?.name ?? 'Untitled Journey',
    createdAt: now,
    savedAt: now,
    trackCount: project?.tracks.length ?? routeCount,
    pictureCount: project?.pictures?.length ?? 0,
    videoCount: project?.videos?.length ?? 0,
  };
}

export async function parseReplayArchive(file: File): Promise<ParsedProject> {
  if (file.size > MAX_ARCHIVE_SIZE_BYTES) {
    throw new ReplayArchiveError(
      'too-large',
      `This .replay file is too large (${Math.round(file.size / 1024 / 1024)} MB, limit ${MAX_ARCHIVE_SIZE_BYTES / 1024 / 1024} MB)`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) reject(new ReplayArchiveError('corrupt', 'Could not open this .replay file — the archive is corrupt'));
      else resolve(data);
    });
  });

  const decoder = new TextDecoder();

  // Every route in the archive, whether or not a project names it: a recipe
  // refers to its routes by file name, so it needs the whole set.
  const routes = Object.entries(files)
    .filter(([path]) => /\.(gpx|kml)$/i.test(path))
    .map(([path, content]) => ({ fileName: path, gpxText: decoder.decode(content) }));
  const coverPhotos = Object.entries(files)
    .filter(([path]) => /\.(jpe?g|png|webp|avif)$/i.test(path))
    .map(([fileName, bytes]) => ({ fileName, bytes }));

  const recipe = decodeJson<Recipe>(files, 'recipe.json');
  const project = decodeJson<ReplayProjectFile>(files, 'project.json');

  if (!project && !recipe) {
    throw new ReplayArchiveError(
      'corrupt',
      'This archive has neither project.json nor recipe.json — it is not a valid .replay file',
    );
  }
  if (project && !Array.isArray(project.tracks)) {
    throw new ReplayArchiveError('corrupt', 'project.json has no tracks — this is not a valid .replay file');
  }
  if (!project && routes.length === 0) {
    throw new ReplayArchiveError(
      'missing-asset',
      'This archive holds a recipe but none of the routes it names',
    );
  }

  // A hand-written project may leave the version off; it means "current".
  if (project) project.formatVersion ??= CURRENT_FORMAT_VERSION;

  const manifest = decodeJson<ReplayManifest>(files, 'manifest.json')
    ?? synthesizeManifest(project, routes.length);

  if (!SUPPORTED_FORMAT_VERSIONS.includes(manifest.formatVersion)) {
    const message = manifest.formatVersion > CURRENT_FORMAT_VERSION
      ? 'This project was saved with a newer version of TrailReplay — please update the app to open it'
      : `Unrecognized project format version (${manifest.formatVersion})`;
    throw new ReplayArchiveError('unsupported-version', message);
  }

  if (project && project.formatVersion !== manifest.formatVersion) {
    throw new ReplayArchiveError('corrupt', 'manifest.json and project.json disagree on format version');
  }

  const tracks = (project?.tracks ?? []).map((meta) => {
    const bytes = files[meta.routeFile];
    if (!bytes) {
      throw new ReplayArchiveError('missing-asset', `Missing route file: ${meta.routeFile}`);
    }
    return { meta, gpxText: decoder.decode(bytes) };
  });

  const comparisonTracks = (project?.comparisonTracks ?? []).map((meta) => {
    const bytes = files[meta.routeFile];
    if (!bytes) {
      throw new ReplayArchiveError('missing-asset', `Missing route file: ${meta.routeFile}`);
    }
    return { meta, gpxText: decoder.decode(bytes) };
  });

  return { manifest, project, recipe, routes, coverPhotos, tracks, comparisonTracks };
}
