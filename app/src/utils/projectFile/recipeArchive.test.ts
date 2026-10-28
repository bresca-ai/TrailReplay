import { describe, expect, it } from 'vitest';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { createAppStore } from '@/store/createAppStore';
import { parseGPX } from '@/utils/gpxParser';
import { parseReplayArchive } from './parseReplayArchive';
import { hydrateProject } from './hydrateProject';
import { buildReplayArchive } from './buildReplayArchive';
import { resolveRecipe } from '@/utils/recipe/resolveRecipe';
import { applyRecipe } from '@/utils/recipe/applyRecipe';
import type { Recipe } from '@/utils/recipe/types';

const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Ridge</name><trkseg>${
  Array.from({ length: 101 }, (_, i) =>
    `<trkpt lat="${(42 + i * 0.0008983).toFixed(6)}" lon="2.000000"><ele>${1000 + i}</ele></trkpt>`).join('')
}</trkseg></trk></gpx>`;

const recipe: Recipe = {
  name: 'Packed race',
  tracks: [{ file: 'ridge.gpx', name: 'Ridge Loop', color: '#E86F51' }],
  annotations: [{ km: 5, title: 'Halfway feed' }],
};

/** What make-replay.mjs produces: a recipe and its routes, nothing resolved. */
function packRecipeArchive(): File {
  const zipped = zipSync({
    'recipe.json': strToU8(JSON.stringify(recipe)),
    'routes/ridge.gpx': strToU8(gpx),
  });
  return new File([new Uint8Array(zipped) as BlobPart], 'packed.replay');
}

describe('a .replay holding only a recipe', () => {
  it('parses without a project and hands back its routes', async () => {
    const parsed = await parseReplayArchive(packRecipeArchive());

    expect(parsed.project).toBeNull();
    expect(parsed.recipe?.name).toBe('Packed race');
    expect(parsed.routes).toHaveLength(1);
    expect(parsed.routes[0].fileName).toBe('routes/ridge.gpx');
    // A synthesized manifest still reports something sane.
    expect(parsed.manifest.trackCount).toBe(1);
  });

  it('resolves to the same project as dropping the folder would', async () => {
    const parsed = await parseReplayArchive(packRecipeArchive());
    const tracks = parsed.routes.map((route) => parseGPX(route.gpxText, route.fileName));
    const fromArchive = resolveRecipe(parsed.recipe!, tracks, parsed.routes.map((r) => r.fileName));

    // The folder drop: same recipe, same routes, bare file names.
    const fromFolder = resolveRecipe(recipe, [parseGPX(gpx, 'ridge.gpx')], ['ridge.gpx']);

    expect(fromArchive.textAnnotations[0].progress)
      .toBeCloseTo(fromFolder.textAnnotations[0].progress, 10);
    expect(fromArchive.tracks[0].name).toBe('Ridge Loop');
    expect(fromArchive.report.warnings).toEqual([]);
  });

  it('rejects an archive whose routes are missing', async () => {
    const zipped = zipSync({ 'recipe.json': strToU8(JSON.stringify(recipe)) });
    const file = new File([new Uint8Array(zipped) as BlobPart], 'empty.replay');

    await expect(parseReplayArchive(file)).rejects.toMatchObject({ code: 'missing-asset' });
  });
});

describe('round trip', () => {
  it('applies the authored comparison distance from a recipe', () => {
    const authored = { ...recipe, comparisonThresholdMeters: 80 };
    const resolved = resolveRecipe(authored, [parseGPX(gpx, 'ridge.gpx')], ['ridge.gpx']);
    const store = createAppStore();
    applyRecipe(authored, resolved, store.getState());
    expect(store.getState().comparisonThresholdMeters).toBe(80);
  });
  it('keeps the recipe through a save, so the source is not lost', async () => {
    const parsed = await parseReplayArchive(packRecipeArchive());
    const tracks = parsed.routes.map((route) => parseGPX(route.gpxText, route.fileName));
    const resolved = resolveRecipe(parsed.recipe!, tracks, parsed.routes.map((r) => r.fileName));

    const store = createAppStore();
    applyRecipe(parsed.recipe!, resolved, store.getState());
    expect(store.getState().sourceRecipe?.name).toBe('Packed race');

    // Saving now writes both halves: what it resolved to, and where it came from.
    const blob = await buildReplayArchive(store.getState());
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries)).toContain('project.json');
    expect(Object.keys(entries)).toContain('recipe.json');
    expect(JSON.parse(strFromU8(entries['recipe.json'])).name).toBe('Packed race');

    // And reopening that save restores the project and still knows its recipe.
    const reopened = await parseReplayArchive(new File([blob], 'saved.replay'));
    expect(reopened.project).not.toBeNull();
    expect(reopened.recipe?.name).toBe('Packed race');

    const target = createAppStore();
    hydrateProject({ ...reopened, project: reopened.project! }, target.getState());
    expect(target.getState().textAnnotations).toHaveLength(1);
    expect(target.getState().tracks[0].name).toBe('Ridge Loop');
  });

  it('saves without a recipe when the project never had one', async () => {
    const store = createAppStore();
    store.getState().addTrack(parseGPX(gpx, 'ridge.gpx'));

    const blob = await buildReplayArchive(store.getState());
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries)).not.toContain('recipe.json');
  });

  it('keeps recipe camera distance on the same discrete ladder as the UI', () => {
    const authored: Recipe = {
      ...recipe,
      cameraSettings: {
        mode: 'follow-behind',
        followBehindPreset: 'very-close',
      },
    };
    const tracks = [parseGPX(gpx, 'ridge.gpx')];
    const resolved = resolveRecipe(authored, tracks, ['ridge.gpx']);
    const store = createAppStore();

    applyRecipe(authored, resolved, store.getState());

    expect(store.getState().cameraSettings.followBehindZoomLevel).toBe(100);
  });

  it('snaps an arbitrary recipe distance to a real UI stop', () => {
    const authored: Recipe = {
      ...recipe,
      cameraSettings: {
        mode: 'follow-behind',
        followBehindZoomLevel: 125,
      },
    };
    const tracks = [parseGPX(gpx, 'ridge.gpx')];
    const resolved = resolveRecipe(authored, tracks, ['ridge.gpx']);
    const store = createAppStore();

    applyRecipe(authored, resolved, store.getState());

    expect(store.getState().cameraSettings.followBehindZoomLevel).toBe(120);
  });
});
