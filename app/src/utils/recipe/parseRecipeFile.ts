import { RecipeError, type Recipe } from './types';

/**
 * A recipe is the only JSON the drop zone accepts, so any `.json` in the drop
 * is treated as one. Being permissive here means an agent can name the file
 * whatever it likes; being strict about the contents is what produces a useful
 * error when the JSON is something else entirely.
 */
export function isRecipeFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.json');
}

export async function parseRecipeFile(file: File): Promise<Recipe> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new RecipeError(`${file.name} is not valid JSON`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RecipeError(`${file.name} does not contain a recipe object`);
  }

  const recipe = parsed as Recipe;
  const hasRecipeShape = 'tracks' in recipe
    || 'landmarks' in recipe
    || 'annotations' in recipe
    || 'cameraKeyframes' in recipe
    || 'trailreplay' in recipe;

  if (!hasRecipeShape) {
    throw new RecipeError(
      `${file.name} has no "tracks", "landmarks", "annotations" or "cameraKeyframes" — `
      + 'see https://trailreplay.com/replay-file.md',
    );
  }

  return recipe;
}
