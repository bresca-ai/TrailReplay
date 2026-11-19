import { CUSTOM_MODEL_PREFIX } from '@/utils/customMarker';

/** Load only the selected model; the map and character picker share the same model. */
export async function create3DMarker(canvas: HTMLCanvasElement, icon: string) {
  if (icon.startsWith(CUSTOM_MODEL_PREFIX)) {
    const { createCustomModelRenderer } = await import('./customModel3d');
    return createCustomModelRenderer(canvas, icon);
  }
  const module = await (icon === '3d-road-runner' ? import('./road-runner3d')
    : icon === '3d-trail-runner' ? import('./trail-runner3d')
      : icon === '3d-hiker' ? import('./hiker3d')
      : icon === '3d-swimmer' ? import('./swimmer3d')
        : icon === '3d-road-bike' ? import('./road-bike3d')
          : icon === '3d-gravel-bike' ? import('./gravel-bike3d')
            : icon === '3d-mountain-bike' ? import('./mountain-bike3d')
              : icon === '3d-motorbike' ? import('./motorbike3d')
              : icon === '3d-motocross' ? import('./motocross3d')
              : icon === '3d-race-motorbike' ? import('./race-motorbike3d')
              : icon === '3d-paraglider' ? import('./paraglider3d')
    : icon === '3d-race-car' ? import('./race-car3d')
      : icon === '3d-rally' ? import('./rally3d') : import('./runner3d'));
  return module.createRunnerRenderer(canvas);
}
