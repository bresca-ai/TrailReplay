#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';
import { parseGpxDocument } from '../src/utils/gpx/parseGpxDocument';
import { parseKmlDocument } from '../src/utils/gpx/parseKmlDocument';
import { buildTrackFromRawPoints } from '../src/utils/gpx/trackStats';
import { resolveRecipe } from '../src/utils/recipe/resolveRecipe';
import { resolveRecipeCameraKeyframes } from '../src/utils/recipe/cameraRecipe';
import { matchTrackFiles } from '../src/utils/recipe/matchTrackFiles';
import type { Recipe } from '../src/utils/recipe/types';
import { buildTerrainCameraBrief, evaluateTerrainCameraPlan, createTerrariumSampler, terrainContextFingerprint } from '../src/utils/terrainCamera';
import type { TerrainCameraPlanFrame, TerrainTile } from '../src/utils/terrainCamera/types';
import { terrainTileUrl, TERRAIN_PROVIDER } from '../src/utils/terrainCamera/provider';

declare const __TRAILREPLAY_ENGINE_VERSION__: string;

const ENGINE_VERSION = __TRAILREPLAY_ENGINE_VERSION__;
type Command = 'inspect' | 'terrain' | 'evaluate';
type InputRoute = { fileName: string; bytes: Uint8Array };

function usage(): never {
  throw new Error([
    'Usage:',
    '  node agent-tools.mjs inspect --recipe recipe.json --routes route.gpx [more.gpx ...] --out context.json',
    '  node agent-tools.mjs terrain --recipe recipe.json --routes route.gpx [more.gpx ...] --out terrain-brief.json [--intent "camera intent"]',
    '  node agent-tools.mjs evaluate --recipe recipe.json --routes route.gpx [more.gpx ...] --out evaluation.json',
    'Route sources may be GPX, KML, or .replay (extracts GPX/KML only; pass --recipe separately). FIT is not supported.',
  ].join('\n'));
}

function parseArgs(argv: string[]) {
  const command = argv[0] as Command;
  if (!['inspect', 'terrain', 'evaluate'].includes(command)) return usage();
  let recipePath = '';
  let outPath = '';
  let intent = '';
  const routePaths: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--recipe') recipePath = argv[++index] ?? '';
    else if (arg === '--out') outPath = argv[++index] ?? '';
    else if (arg === '--intent') intent = argv[++index] ?? '';
    else if (arg === '--routes') {
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) routePaths.push(argv[++index]);
    } else return usage();
  }
  if (!recipePath || !routePaths.length || !outPath) return usage();
  return { command, recipePath, routePaths, outPath, intent };
}

function decodePng(buffer: Uint8Array): TerrainTile {
  if (buffer.length > 8_000_000) throw new Error('Terrarium tile PNG was too large');
  const decoded = PNG.sync.read(Buffer.from(buffer));
  if (!decoded.width || !decoded.height || decoded.width > 2048 || decoded.height > 2048) throw new Error('Terrarium tile PNG dimensions were invalid');
  return { width: decoded.width, height: decoded.height, rgba: new Uint8Array(decoded.data) };
}

async function readRouteInputs(paths: string[]): Promise<InputRoute[]> {
  const routes: InputRoute[] = [];
  for (const routePath of paths) {
    const bytes = new Uint8Array(await readFile(resolve(routePath)));
    if (extname(routePath).toLowerCase() === '.replay') {
      let entries: Record<string, Uint8Array>;
      try { entries = unzipSync(bytes); } catch { throw new Error(`${routePath} is not a valid .replay ZIP archive`); }
      for (const [fileName, content] of Object.entries(entries)) {
        if (/\.(gpx|kml)$/i.test(fileName)) routes.push({ fileName: basename(fileName), bytes: content });
      }
      continue;
    }
    routes.push({ fileName: basename(routePath), bytes });
  }
  if (!routes.length) throw new Error('No GPX or KML routes were found');
  for (const route of routes) {
    if (/\.fit$/i.test(route.fileName)) throw new Error(`FIT route "${route.fileName}" is not supported by the CLI; export it as GPX first`);
    if (!/\.(gpx|kml)$/i.test(route.fileName)) throw new Error(`Unsupported route file "${route.fileName}"; use GPX, KML, or a .replay archive`);
  }
  return routes;
}

async function loadContext(recipePath: string, routePaths: string[]) {
  const inputRecipe = JSON.parse(await readFile(resolve(recipePath), 'utf8')) as Recipe;
  const inputRoutes = await readRouteInputs(routePaths);
  const tracks = inputRoutes.map(({ fileName, bytes }) => {
    const source = new TextDecoder().decode(bytes);
    const parsed = /\.kml$/i.test(fileName)
      ? parseKmlDocument(source, fileName)
      : parseGpxDocument(source, fileName);
    return buildTrackFromRawPoints({ idPrefix: /\.kml$/i.test(fileName) ? 'kml' : 'track', ...parsed });
  });
  const matched = matchTrackFiles(inputRecipe.tracks, tracks, inputRoutes.map((route) => route.fileName));
  const reservedTrackIds = new Set(matched.map(({ spec }) => spec.id).filter((id): id is string => Boolean(id)));
  const usedTrackIds = new Set<string>();
  const canonicalTracks = matched.map(({ track, spec }, index) => {
    const fileIndex = tracks.indexOf(track);
    let id = spec.id;
    if (!id) {
      let candidate = `track-${index + 1}`;
      let suffix = 2;
      while (reservedTrackIds.has(candidate) || usedTrackIds.has(candidate)) candidate = `track-${index + 1}-${suffix++}`;
      id = candidate;
    }
    usedTrackIds.add(id);
    return { ...spec, id, file: spec.file || inputRoutes[fileIndex]?.fileName || `${track.name}.gpx` };
  });
  let recipe: Recipe = { ...inputRecipe, tracks: canonicalTracks };
  if (!inputRecipe.segments) {
    // Resolve the ordinary recipe once to inherit the app's active-track,
    // stitching, ordering, and duration rules. Then replace ephemeral default
    // segment IDs with deterministic IDs before computing terrain fingerprints.
    const previewRecipe = { ...recipe };
    delete previewRecipe.cameraKeyframes;
    const preview = resolveRecipe(previewRecipe, tracks, inputRoutes.map((route) => route.fileName));
    const reservedSegmentIds = new Set<string>();
    recipe = {
      ...recipe,
      segments: preview.journeySegments.map((segment, index) => {
        let id = `segment-${index + 1}`;
        let suffix = 2;
        while (reservedSegmentIds.has(id)) id = `segment-${index + 1}-${suffix++}`;
        reservedSegmentIds.add(id);
        return segment.type === 'track'
          ? { id, trackId: segment.trackId, duration: segment.duration }
          : { ...segment, id };
      }),
    };
  }
  const resolved = resolveRecipe(recipe, tracks, inputRoutes.map((route) => route.fileName));
  const cameraKeyframes = resolveRecipeCameraKeyframes(recipe, resolved.tracks, resolved.journeySegments);
  return { recipe, inputRoutes, resolved, cameraKeyframes };
}

function createSampler(signal: AbortSignal) {
  return createTerrariumSampler({
    signal,
    fetchTile: async (z, x, y, requestSignal) => {
      const boundedSignal = AbortSignal.any([requestSignal ?? signal, AbortSignal.timeout(6_000)]);
      const response = await fetch(terrainTileUrl(z, x, y), { signal: boundedSignal });
      if (!response.ok) throw new Error(`Terrarium tile request failed (${response.status})`);
      return decodePng(new Uint8Array(await response.arrayBuffer()));
    },
    maxTiles: 64,
    maxConcurrency: 4,
    timeBudgetMs: 12_000,
    zoom: 12,
  });
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write('TrailReplay Agent Tools\n\nUsage:\n  node agent-tools.mjs inspect --recipe recipe.json --routes route.gpx [more.gpx ...] --out context.json\n  node agent-tools.mjs terrain --recipe recipe.json --routes route.gpx [more.gpx ...] --out terrain-brief.json [--intent "camera intent"]\n  node agent-tools.mjs evaluate --recipe recipe.json --routes route.gpx [more.gpx ...] --out evaluation.json\n\nUse --out - to write JSON to stdout. .replay archives provide GPX/KML routes only; pass --recipe separately. FIT is unsupported.\n');
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const { recipe, inputRoutes, resolved, cameraKeyframes } = await loadContext(args.recipePath, args.routePaths);
  const trackSummary = resolved.tracks.map((track) => ({
    id: track.id,
    name: track.name,
    pointCount: track.points.length,
    distanceMeters: track.totalDistance,
    elevationGainMeters: track.elevationGain,
    elevationLossMeters: track.elevationLoss,
    elevationMinMeters: track.minElevation,
    elevationMaxMeters: track.maxElevation,
  }));
  const signal = AbortSignal.timeout(20_000);
  const contextFingerprint = terrainContextFingerprint(resolved.tracks, resolved.journeySegments, recipe.routeTimingMode);
  const canonicalRecipe: Recipe = {
    ...recipe,
    cameraKeyframes: recipe.cameraKeyframes
      ? { ...recipe.cameraKeyframes, contextFingerprint }
      : recipe.cameraKeyframes,
  };
  const terrainFrames: TerrainCameraPlanFrame[] = cameraKeyframes.map((frame) => {
    const segment = resolved.journeySegments.find((entry) => entry.type === 'track' && entry.id === frame.anchor.routeSegmentId);
    if (!segment || segment.type !== 'track') throw new Error(`Camera frame "${frame.id}" has no matching playback segment`);
    return {
      id: frame.id,
      ...(frame.title !== undefined ? { title: frame.title } : {}),
      anchor: { trackId: segment.trackId, segmentId: segment.id, distanceMeters: frame.anchor.routeSegmentDistance },
      bearingDeg: frame.bearingDeg,
      pitchDeg: frame.pitchDeg,
      zoom: frame.zoom,
      frame: frame.frame,
      easing: frame.easing,
      ...(frame.target ? { target: { ...frame.target } } : {}),
      ...(frame.terrain ? { terrain: { rationale: frame.terrain.rationale ?? '', confidence: frame.terrain.confidence ?? 0, warnings: frame.terrain.warnings ?? [] } } : {}),
    };
  });
  let output: unknown;
  if (args.command === 'inspect') {
    output = {
      version: 1, engineVersion: ENGINE_VERSION, command: 'inspect', name: canonicalRecipe.name ?? null,
      recipe: canonicalRecipe,
      routes: inputRoutes.map(({ fileName }) => fileName), tracks: trackSummary,
      journeySegments: resolved.journeySegments,
      cameraKeyframes: canonicalRecipe.cameraKeyframes?.frames ?? [],
      resolvedCameraKeyframes: cameraKeyframes,
      report: resolved.report,
      guidance: 'This is route and recipe context. It does not certify visual rendering or camera clearance.',
    };
  } else if (args.command === 'terrain') {
    const brief = await buildTerrainCameraBrief({ tracks: resolved.tracks, journeySegments: resolved.journeySegments, intent: args.intent, routeTimingMode: recipe.routeTimingMode, cameraStability: recipe.cameraSettings?.cameraStability, viewport: { terrainExaggeration: recipe.settings?.show3DTerrain === false ? 0 : TERRAIN_PROVIDER.exaggeration }, signal, sampler: createSampler(signal) });
    const priorFrames = canonicalRecipe.cameraKeyframes?.frames ?? [];
    const usedFrameIds = new Set(priorFrames.map((frame) => frame.id));
    const suggestedFrames = brief.cameraKeyframes.frames.filter((frame) => !priorFrames.some((prior) =>
      prior.anchor.segmentId === frame.anchor.segmentId && Math.abs(prior.anchor.distanceMeters - frame.anchor.distanceMeters) < 1,
    )).map((frame) => {
      let id = frame.id;
      let suffix = 2;
      while (usedFrameIds.has(id)) id = `${frame.id}-${suffix++}`;
      usedFrameIds.add(id);
      return { ...frame, id };
    });
    const recipeWithSuggestions: Recipe = {
      ...canonicalRecipe,
      cameraKeyframes: {
        version: 1,
        contextFingerprint: brief.contextFingerprint,
        frames: [...priorFrames, ...suggestedFrames].slice(0, 1000),
      },
    };
    output = { ...brief, engineVersion: ENGINE_VERSION, command: 'terrain', intent: args.intent, recipeName: recipe.name ?? null, recipe: recipeWithSuggestions, report: resolved.report,
      structuralStatus: 'valid', terrainStatus: brief.coverage.complete ? brief.warnings.some((warning) => warning.includes('intersect')) ? 'intersects-sampled-terrain' : 'clear-sampled' : 'partial', renderStatus: 'not-run' };
  } else {
    if (terrainFrames.length === 0) throw new Error('evaluate requires at least one cameraKeyframes.frames entry');
    const evaluations = await evaluateTerrainCameraPlan({ frames: terrainFrames, tracks: resolved.tracks, journeySegments: resolved.journeySegments, routeTimingMode: recipe.routeTimingMode, cameraStability: recipe.cameraSettings?.cameraStability, viewport: { terrainExaggeration: recipe.settings?.show3DTerrain === false ? 0 : TERRAIN_PROVIDER.exaggeration }, signal, sampler: createSampler(signal) });
    output = {
      version: 1, engineVersion: ENGINE_VERSION, command: 'evaluate', recipeName: recipe.name ?? null,
      contextFingerprint,
      recipe: canonicalRecipe,
      evaluations, report: resolved.report,
      structuralStatus: 'valid',
      terrainStatus: evaluations.some((entry) => entry.visibility === 'unknown') ? 'partial'
        : evaluations.some((entry) => entry.visibility === 'intersects-sampled-terrain') ? 'intersects-sampled-terrain' : 'clear-sampled',
      renderStatus: 'not-run',
      guidance: 'Numeric terrain evaluation only. Review the replay in TrailReplay to confirm visual framing and rendering.',
    };
  }
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (args.outPath === '-') process.stdout.write(serialized);
  else await writeFile(resolve(args.outPath), serialized, 'utf8');
}

main().catch((error: unknown) => {
  process.stderr.write(`agent-tools: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
