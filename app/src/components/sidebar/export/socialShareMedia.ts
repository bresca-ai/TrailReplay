import { getActivityIconOption } from '@/utils/activityIcons';
import type { SocialShareSettings } from '@/types';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadPosterImage(url: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(url);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        imageCache.delete(url);
        reject(new Error(`Cover image could not be loaded: ${url.slice(0, 80)}`));
      };
      image.src = url;
    });
    imageCache.set(url, pending);
  }
  return pending;
}

export async function loadPosterAssets(settings: SocialShareSettings) {
  const slotImages: Record<string, HTMLImageElement> = {};
  const statIconImages: Record<string, HTMLImageElement> = {};
  await Promise.all((settings.photoSlots ?? []).map(async (slot) => {
    if (slot.imageUrl) slotImages[slot.id] = await loadPosterImage(slot.imageUrl);
  }));
  await Promise.all((settings.stats ?? []).map(async (stat) => {
    const option = stat.icon ? getActivityIconOption(stat.icon) : undefined;
    if (option?.kind === 'svg') statIconImages[stat.icon!] = await loadPosterImage(option.content);
  }));
  return { slotImages, statIconImages };
}

/** Keep project files and video covers small even when a phone photo is dropped in. */
export async function compressCoverPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Only image files can be used in a cover');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadPosterImage(objectUrl);
    const maxEdge = 1800;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    imageCache.delete(objectUrl);
    URL.revokeObjectURL(objectUrl);
  }
}
