import { zip, type Zippable } from 'fflate';
import type { AppState } from '@/store/storeTypes';
import { serializeTrackToGpx } from '@/utils/gpx/serializeTrackToGpx';
import { serializeCameraRecipe } from '@/utils/recipe/cameraRecipe';
import type { TerrainCameraBrief } from './types';

/** A local handoff: route geometry/timing and authored intent, without media or sensor readings. */
export async function buildCameraPlanningBundle(state: AppState, intent: string, brief?: TerrainCameraBrief): Promise<Blob> {
  const encoder = new TextEncoder();
  const files: Zippable = {};
  const routeFiles = new Map<string, string>();
  [...state.tracks, ...state.comparisonTracks.map((entry) => entry.track)].forEach((track, index) => {
    const filename = `routes/route-${index + 1}.gpx`;
    routeFiles.set(track.id, filename);
    files[filename] = encoder.encode(serializeTrackToGpx({
      ...track,
      points: track.points.map((point) => ({ ...point, heartRate: null, cadence: null, power: null, temperature: null })),
    }));
  });
  const recipe = serializeCameraRecipe(state, routeFiles);
  files['recipe.json'] = encoder.encode(JSON.stringify(recipe, null, 2));
  files['request.json'] = encoder.encode(JSON.stringify({
    version: 1,
    intent,
    cameraContext: { cameraStability: state.cameraSettings.cameraStability, show3DTerrain: state.settings.show3DTerrain, exportAspectRatio: state.videoExportSettings.aspectRatio },
    contextFingerprint: recipe.cameraKeyframes?.contextFingerprint,
    recipe: 'recipe.json',
    terrainBrief: brief ? 'terrain-brief.json' : null,
    instructions: 'Keep the active course start and as much of its painted trail visible as possible. Use a gentle, visible camera move around a stable low course target, facing the mountain. Keep the start in frame while bearing and distance change; avoid chasing the marker uphill or flying over peaks. Check route sample framing and terrain occlusion across transitions. Return the complete recipe with cameraKeyframes version 1. Preserve route IDs, segment occurrences, contextFingerprint, and other recipe content. distanceMeters is local to the named segment. Report unknown terrain and inspect transitions. Numeric assessment does not establish rendered visibility.',
  }, null, 2));
  if (brief) files['terrain-brief.json'] = encoder.encode(JSON.stringify(brief, null, 2));
  files['README.txt'] = encoder.encode(`TrailReplay camera planning bundle\n\nGuide: https://trailreplay.com/camera-authoring.md\nTool: https://trailreplay.com/agent-tools.mjs\n\nThis bundle contains route locations and timestamps. Media files and sensor readings are excluded. Existing recipe media references may require the original project.\n\nUnzip, then run:\nnode agent-tools.mjs inspect --recipe recipe.json --routes routes/*.gpx --out context.json\nnode agent-tools.mjs terrain --recipe recipe.json --routes routes/*.gpx --out terrain-brief.json\n\nReturn a complete recipe, preserving its contextFingerprint, for Review camera recipe in the cinematic editor.\n`);
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, data) => error ? reject(error) : resolve(data)));
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

export function downloadCameraFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
