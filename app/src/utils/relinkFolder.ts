import { createRenderableImageAsset } from '@/utils/imagePreview';
import type { RenderableImageAsset } from '@/utils/imagePreview';

type MissingMedia = { id: string; originalFileName?: string | null };

/** Only relink when the selected folder contains exactly one matching name. */
export async function relinkFolder(
  files: File[], media: MissingMedia[], kind: 'pictures' | 'videos',
  relink: (id: string, file: File, asset?: RenderableImageAsset) => void,
) {
  const byName = new Map<string, File[]>();
  for (const file of files) {
    const matches = byName.get(file.name) ?? [];
    matches.push(file);
    byName.set(file.name, matches);
  }
  for (const item of media) {
    const matches = item.originalFileName ? byName.get(item.originalFileName) : undefined;
    if (matches?.length !== 1) continue;
    const file = matches[0];
    const asset = kind === 'pictures' ? await createRenderableImageAsset(file) : undefined;
    relink(item.id, file, asset);
  }
}
