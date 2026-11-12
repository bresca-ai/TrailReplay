import { describe, expect, it, vi } from 'vitest';
import { relinkFolder } from './relinkFolder';
import { createRenderableImageAsset } from './imagePreview';

vi.mock('./imagePreview', () => ({ createRenderableImageAsset: vi.fn() }));

describe('relinkFolder', () => {
  it.each(['pictures', 'videos'] as const)('requires a filename match for a one-file %s folder', async (kind) => {
    const relink = vi.fn();
    await relinkFolder([new File([''], 'other.jpg')], [{ id: '1', originalFileName: 'missing.jpg' }], kind, relink);
    expect(relink).not.toHaveBeenCalled();
  });

  it.each(['pictures', 'videos'] as const)('leaves ambiguous %s filenames unlinked', async (kind) => {
    const relink = vi.fn();
    await relinkFolder([new File(['a'], 'same.jpg'), new File(['b'], 'same.jpg')], [{ id: '1', originalFileName: 'same.jpg' }], kind, relink);
    expect(relink).not.toHaveBeenCalled();
  });

  it('converts matched HEIC photos and passes the original and renderable asset to relinking', async () => {
    const file = new File(['heic'], 'summit.heic', { type: 'image/heic' });
    const asset = { url: 'blob:converted', displayFile: new File(['jpeg'], 'summit.jpg', { type: 'image/jpeg' }) };
    vi.mocked(createRenderableImageAsset).mockResolvedValueOnce(asset);
    const relink = vi.fn();
    await relinkFolder([file], [{ id: '1', originalFileName: file.name }], 'pictures', relink);
    expect(createRenderableImageAsset).toHaveBeenCalledWith(file);
    expect(relink).toHaveBeenCalledWith('1', file, asset);
  });

  it('relinks a unique video match without image conversion', async () => {
    const file = new File(['video'], 'clip.mp4');
    const relink = vi.fn();
    await relinkFolder([file], [{ id: '1', originalFileName: file.name }], 'videos', relink);
    expect(relink).toHaveBeenCalledWith('1', file, undefined);
  });
});
