import type * as maplibregl from 'maplibre-gl';

let captureQueue: Promise<unknown> = Promise.resolve();
const CASING_LAYER = 'social-cover-route-casing';

/** Capture a clean poster frame while leaving the live map's styling intact. */
export function captureSocialMap(
  map: maplibregl.Map,
  options: { routeGlow: boolean; routeOpacity: number },
): Promise<HTMLCanvasElement | null> {
  const capture = async (): Promise<HTMLCanvasElement | null> => {
    const hiddenLayers: string[] = [];
    const trail = map.getLayer('trail-line');
    const trailOpacity = trail ? map.getPaintProperty('trail-line', 'line-opacity') : undefined;
    const trailWidth = trail ? map.getPaintProperty('trail-line', 'line-width') : undefined;
    let casingAdded = false;

    try {
      // Carto's place names are a raster overlay; other map styles may have
      // symbol labels. Neither should sit behind the cover's title and stats.
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.id !== 'carto-labels' && layer.type !== 'symbol') continue;
        const visibility = map.getLayoutProperty(layer.id, 'visibility') as string | undefined;
        if (visibility === 'none') continue;
        hiddenLayers.push(layer.id);
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }

      // The plain route should use MapLibre's native line rendering, including
      // its projection at pitch, instead of a second flat canvas stroke.
      if (!options.routeGlow && trail) {
        map.addLayer({
          id: CASING_LAYER,
          type: 'line',
          source: 'trail-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#171c19',
            'line-width': 11,
            'line-opacity': options.routeOpacity * 0.72,
          },
        }, 'trail-line');
        casingAdded = true;
        map.setPaintProperty('trail-line', 'line-width', 7);
        map.setPaintProperty('trail-line', 'line-opacity', options.routeOpacity);
      }

      return await new Promise<HTMLCanvasElement | null>((resolve) => {
        let settled = false;
        const finish = (canvas: HTMLCanvasElement | null) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          map.off('idle', triggerCapture);
          map.off('render', copyCanvas);
          resolve(canvas);
        };
        const copyCanvas = () => {
          try {
            const source = map.getCanvas();
            const canvas = document.createElement('canvas');
            canvas.width = source.width;
            canvas.height = source.height;
            canvas.getContext('2d')?.drawImage(source, 0, 0);
            finish(canvas);
          } catch (error) {
            console.warn('[social] map capture failed:', error);
            finish(null);
          }
        };
        const triggerCapture = () => {
          map.once('render', copyCanvas);
          map.triggerRepaint();
        };
        const timeout = window.setTimeout(() => finish(null), 3000);
        if (map.areTilesLoaded()) triggerCapture();
        else map.once('idle', triggerCapture);
      });
    } finally {
      for (const id of hiddenLayers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      }
      if (casingAdded && map.getLayer(CASING_LAYER)) map.removeLayer(CASING_LAYER);
      if (trail && map.getLayer('trail-line')) {
        if (!options.routeGlow) {
          map.setPaintProperty('trail-line', 'line-width', trailWidth);
          map.setPaintProperty('trail-line', 'line-opacity', trailOpacity);
        }
      }
      map.triggerRepaint();
    }
  };

  const result = captureQueue.then(capture, capture);
  captureQueue = result.then(() => undefined, () => undefined);
  return result;
}
