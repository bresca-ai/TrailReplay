import { Unzip, UnzipInflate } from 'fflate';
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

// A `.replay` already has a 200 MB compressed input limit. Keep the expanded
// payload within that same budget so a highly-compressible archive cannot make
// the browser allocate an unbounded amount of memory.
const MAX_ARCHIVE_ENTRY_COUNT = 1_000;
const MAX_UNCOMPRESSED_ARCHIVE_BYTES = MAX_ARCHIVE_SIZE_BYTES;
const MAX_UNCOMPRESSED_ENTRY_BYTES = MAX_UNCOMPRESSED_ARCHIVE_BYTES;
// DEFLATE can expand a tiny compressed input substantially. Limiting each push
// bounds transient inflater output before its ondata callback can reject it.
const COMPRESSED_INPUT_CHUNK_BYTES = 1_024;
const YIELD_AFTER_COMPRESSED_BYTES = 256 * 1_024;

function isArchiveContentFile(path: string) {
  return path === 'manifest.json'
    || path === 'project.json'
    || path === 'recipe.json'
    || /\.(gpx|kml)$/i.test(path);
}

function isTrustworthyEntrySize(size: number | undefined): size is number {
  return typeof size === 'number' && Number.isSafeInteger(size) && size >= 0;
}

function joinChunks(chunks: Uint8Array[], length: number) {
  const content = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.length;
  }
  return content;
}

/**
 * Extract only archive content the project can consume. `Unzip` exposes each
 * entry's declared uncompressed size before its stream starts, which lets us
 * reject invalid or oversized entries before retaining their output. Archives
 * written with ZIP data descriptors omit that size, so their output is instead
 * bounded incrementally while it is streamed.
 */
async function extractArchive(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = Object.create(null);
  let entryCount = 0;
  let declaredBytes = 0;
  let emittedBytes = 0;
  let failure: ReplayArchiveError | null = null;
  const openEntries = new Set<object>();

  const fail = (code: 'corrupt' | 'too-large', message: string) => {
    failure ??= new ReplayArchiveError(code, message);
  };

  const unzipper = new Unzip((entry) => {
    entryCount += 1;
    if (entryCount > MAX_ARCHIVE_ENTRY_COUNT) {
      fail('too-large', `This .replay file has too many entries (limit ${MAX_ARCHIVE_ENTRY_COUNT})`);
      return;
    }

    // Images and other unknown payloads are not part of the replay format, so
    // never start their decompression stream.
    if (!isArchiveContentFile(entry.name) || failure) return;

    const originalSize = entry.originalSize;
    if (originalSize !== undefined && !isTrustworthyEntrySize(originalSize)) {
      fail('corrupt', `Archive entry has no trustworthy uncompressed size: ${entry.name}`);
      return;
    }
    if (originalSize !== undefined && originalSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
      fail('too-large', `Archive entry is too large: ${entry.name}`);
      return;
    }
    if (originalSize !== undefined && declaredBytes + originalSize > MAX_UNCOMPRESSED_ARCHIVE_BYTES) {
      fail('too-large', 'The extracted .replay contents exceed the 200 MB limit');
      return;
    }
    if (originalSize !== undefined) declaredBytes += originalSize;

    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    openEntries.add(entry);
    entry.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error || !chunk) {
        fail('corrupt', `Could not extract archive entry: ${entry.name}`);
        entry.terminate();
        return;
      }

      entryBytes += chunk.length;
      emittedBytes += chunk.length;
      if (entryBytes > MAX_UNCOMPRESSED_ENTRY_BYTES) {
        fail('too-large', `Archive entry is too large: ${entry.name}`);
        entry.terminate();
        return;
      }
      if (originalSize !== undefined && entryBytes > originalSize) {
        fail('corrupt', `Archive entry exceeds its declared size: ${entry.name}`);
        entry.terminate();
        return;
      }
      if (emittedBytes > MAX_UNCOMPRESSED_ARCHIVE_BYTES) {
        fail('too-large', 'The extracted .replay contents exceed the 200 MB limit');
        entry.terminate();
        return;
      }
      chunks.push(chunk);

      if (final) {
        if (originalSize !== undefined && entryBytes !== originalSize) {
          fail('corrupt', `Archive entry size does not match its header: ${entry.name}`);
          return;
        }
        // The allocation is bounded by the checks before start() and above.
        files[entry.name] = joinChunks(chunks, entryBytes);
        openEntries.delete(entry);
      }
    };
    entry.start();
  });
  unzipper.register(UnzipInflate);

  for (let offset = 0; offset < bytes.length && !failure; offset += COMPRESSED_INPUT_CHUNK_BYTES) {
    const end = Math.min(offset + COMPRESSED_INPUT_CHUNK_BYTES, bytes.length);
    try {
      unzipper.push(bytes.subarray(offset, end), end === bytes.length);
    } catch {
      fail('corrupt', 'Could not open this .replay file — the archive is corrupt');
      break;
    }

    if (end < bytes.length && end % YIELD_AFTER_COMPRESSED_BYTES === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (bytes.length === 0) {
    try {
      unzipper.push(bytes, true);
    } catch {
      fail('corrupt', 'Could not open this .replay file — the archive is corrupt');
    }
  }

  if (failure) throw failure;
  if (openEntries.size > 0) {
    throw new ReplayArchiveError('corrupt', 'Archive ended before all entries were extracted');
  }
  return files;
}

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

  const files = await extractArchive(bytes);

  const decoder = new TextDecoder();

  // Every route in the archive, whether or not a project names it: a recipe
  // refers to its routes by file name, so it needs the whole set.
  const routes = Object.entries(files)
    .filter(([path]) => /\.(gpx|kml)$/i.test(path))
    .map(([path, content]) => ({ fileName: path, gpxText: decoder.decode(content) }));

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

  return { manifest, project, recipe, routes, tracks, comparisonTracks };
}
