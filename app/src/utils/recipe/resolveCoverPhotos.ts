import { compressCoverPhoto } from '@/components/sidebar/export/socialShareMedia';
import type { Recipe } from './types';
import { RecipeError } from './types';

function basename(path: string): string {
  return path.replaceAll('\\', '/').split('/').pop()!.toLowerCase();
}

function imageType(name: string): string | null {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  return null;
}

/** Resolve only named cover files; the recipe itself stays small and editable. */
export async function resolveCoverPhotos(recipe: Recipe, files: File[]): Promise<(string | null)[]> {
  return Promise.all((recipe.socialShareSettings?.photoSlots ?? []).map(async (slot) => {
    if (!slot.file) return null;
    const requested = basename(slot.file);
    const matches = files.filter((file) => basename(file.name) === requested);
    if (matches.length === 0) throw new RecipeError(`Cover photo "${slot.file}" was not included with the recipe`);
    if (matches.length > 1) throw new RecipeError(`More than one cover photo matches "${slot.file}"`);
    const type = imageType(matches[0].name);
    if (!type) throw new RecipeError(`Cover photo "${slot.file}" must be a JPEG, PNG, WebP or AVIF image`);
    try {
      const file = new File([matches[0]], matches[0].name, { type });
      return await compressCoverPhoto(file);
    } catch {
      throw new RecipeError(`Cover photo "${slot.file}" could not be opened as an image`);
    }
  }));
}
