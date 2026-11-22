import { CUSTOM_MODEL_PREFIX } from '@/utils/customMarker';

/** Load only the selected model; the map and character picker share the same model. */
export async function create3DMarker(canvas: HTMLCanvasElement, icon: string) {
  if (icon.startsWith(CUSTOM_MODEL_PREFIX)) {
    const { createCustomModelRenderer } = await import('./customModel3d');
    return createCustomModelRenderer(canvas, icon);
  }
  const module = await load3DModelModule(icon);
  return module.createRunnerRenderer(canvas);
}

const loadedModules = new Map<string, Awaited<ReturnType<typeof importModelModule>>>();

/** A model module that has already been loaded, so a renderer can be built synchronously. */
export function getLoaded3DModelModule(icon: string) {
  return loadedModules.get(icon) ?? null;
}

export async function load3DModelModule(icon: string) {
  const cached = loadedModules.get(icon);
  if (cached) return cached;
  const module = await importModelModule(icon);
  loadedModules.set(icon, module);
  return module;
}

function importModelModule(icon: string) {
  return (icon === '3d-road-runner' ? import('./road-runner3d')
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
              : icon === '3d-bus' ? import('./bus3d')
              : icon === '3d-plane' ? import('./plane3d')
              : icon === '3d-train' ? import('./train3d')
              : icon === '3d-boat' ? import('./boat3d')
              : icon === '3d-sailboat' ? import('./sailboat3d')
    : icon === '3d-race-car' ? import('./race-car3d')
      : icon === '3d-rally' ? import('./rally3d') : import('./runner3d'));
}
