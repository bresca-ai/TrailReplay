import { recolorMarkerPixels } from '@/utils/markerImageColor';
export { recolorMarkerPixels } from '@/utils/markerImageColor';
import { getCustomAnimation } from '@/utils/customMarker';
import { getActivityIconOption } from '@/utils/activityIcons';

export const MARKER_FRAME_SIZE = 128;
export const MARKER_FRAME_COLUMNS = 12;
export const MARKER_FRAME_COUNT = 120;
export function markerAnimationDuration(value: string): number {
  if (value.endsWith('-tired')) return 8000;
  if (value.endsWith('-finish') || value.endsWith('-summit')) return 5000;
  return ({ 'animated-runner-steady': 3840, 'animated-hiker-steady': 4400,
    'animated-swimmer-steady': 3900, 'animated-skier-steady': 4400,
    'animated-snowboarder-steady': 4800 } as Record<string, number>)[value] ?? 4000;
}

export function animatedMarkerFramesUrl(value: string): string | undefined {
  const custom = getCustomAnimation(value);
  if (custom) return custom.sprite;
  const icon = getActivityIconOption(value);
  if (icon?.kind !== 'animated') return undefined;
  const name = icon.content.split('/').pop();
  return name ? `/media/images/animated-marker-frames/${name.replace(/\.svg$/, '.png')}` : undefined;
}

export function markerFramePosition(timeMs: number, durationMs: number): { x: number; y: number } {
  const frame = Math.floor(Math.max(0, timeMs) * MARKER_FRAME_COUNT / durationMs) % MARKER_FRAME_COUNT;
  return { x: (frame % MARKER_FRAME_COLUMNS) * MARKER_FRAME_SIZE, y: Math.floor(frame / MARKER_FRAME_COLUMNS) * MARKER_FRAME_SIZE };
}


const spriteColors = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
export function coloredMarkerSprite(image: HTMLImageElement, color: string): CanvasImageSource {
  if (!/^#[0-9a-f]{6}$/i.test(color) || color.toLowerCase() === '#c1652f') return image;
  let colors = spriteColors.get(image);
  if (!colors) { colors = new Map(); spriteColors.set(image, colors); }
  const key = color.toLowerCase();
  const cached = colors.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return image;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  recolorMarkerPixels(data.data, color);
  context.putImageData(data, 0, 0);
  // Limit memory if a user repeatedly changes a color while exporting.
  if (colors.size >= 3) colors.delete(colors.keys().next().value!);
  colors.set(key, canvas);
  return canvas;
}
