import type * as maplibregl from 'maplibre-gl';

let captureQueue: Promise<unknown> = Promise.resolve();

/** Capture all routes with their completed-replay styling, without advancing playback. */
export function captureSocialMap(
  map: maplibregl.Map,
  options: { waitForTiles?: boolean; showPlaces?: boolean } = {},
): Promise<HTMLCanvasElement | null> {
  const capture = async (): Promise<HTMLCanvasElement | null> => {
    const paints: Array<{ id: string; property: Parameters<maplibregl.Map['getPaintProperty']>[1]; value: ReturnType<maplibregl.Map['getPaintProperty']> }> = [];
    const visibility: Array<{ id: string; value: 'visible' | 'none' | undefined }> = [];

    try {
      for (const layer of map.getStyle().layers ?? []) {
        if (['route-landmarks-icon', 'route-landmarks-label', 'carto-labels'].includes(layer.id)) {
          visibility.push({ id: layer.id, value: map.getLayoutProperty(layer.id, 'visibility') as 'visible' | 'none' | undefined });
          map.setLayoutProperty(layer.id, 'visibility', options.showPlaces ? 'visible' : 'none');
        }
        if (layer.id !== 'trail-line' && !layer.id.startsWith('comparison-trail-line-')) continue;
        const completedId = layer.id.replace('trail-line', 'trail-completed');
        if (!map.getLayer(completedId)) continue;
        // Full-route geometry already carries each segment's original color.
        // Use the completed line's paint so a paused/empty ghost trail looks
        // exactly like a finished replay, including comparison routes.
        for (const property of ['line-color', 'line-width', 'line-opacity'] as const) {
          const transition = `${property}-transition` as const;
          paints.push({ id: layer.id, property: transition, value: map.getPaintProperty(layer.id, transition) });
          map.setPaintProperty(layer.id, transition, { duration: 0, delay: 0 });
          paints.push({ id: layer.id, property, value: map.getPaintProperty(layer.id, property) });
          map.setPaintProperty(layer.id, property, map.getPaintProperty(completedId, property));
        }
        // Avoid painting the already-completed portion twice at overlaps.
        visibility.push({ id: completedId, value: map.getLayoutProperty(completedId, 'visibility') as 'visible' | 'none' | undefined });
        map.setLayoutProperty(completedId, 'visibility', 'none');
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
        if (options.waitForTiles === false || map.areTilesLoaded()) triggerCapture();
        else map.once('idle', triggerCapture);
      });
    } finally {
      for (const { id, property, value } of paints.reverse()) {
        if (map.getLayer(id)) map.setPaintProperty(id, property, value);
      }
      for (const { id, value } of visibility) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value);
      }
      map.triggerRepaint();
    }
  };

  const result = captureQueue.then(capture, capture);
  captureQueue = result.then(() => undefined, () => undefined);
  return result;
}
