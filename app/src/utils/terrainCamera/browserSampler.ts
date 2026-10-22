import { createTerrariumSampler } from './terrariumSampler';
import type { TerrainSampler, TerrainTile } from './types';
import { terrainTileUrl } from './provider';

/** Browser-only adapter. The engine itself can also run in Node with an injected decoder. */
export function createBrowserTerrariumSampler(options: {
  signal?: AbortSignal; maxTiles?: number; maxConcurrency?: number; timeBudgetMs?: number; zoom?: number;
} = {}): TerrainSampler {
  return createTerrariumSampler({
    ...options,
    fetchTile: async (z, x, y, signal): Promise<TerrainTile> => {
      const response = await fetch(terrainTileUrl(z, x, y), { signal });
      if (!response.ok) throw new Error(`Terrarium tile request failed (${response.status})`);
      const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas pixel reader unavailable');
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
        return { width: bitmap.width, height: bitmap.height, rgba: new Uint8Array(pixels.data) };
      } finally { bitmap.close(); }
    },
  });
}
