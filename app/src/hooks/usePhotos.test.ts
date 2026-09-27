import { describe, expect, it } from 'vitest';
import type { PictureAnnotation } from '@/types';
import { findPictureByFileName } from './usePhotos';

function picture(overrides: Partial<PictureAnnotation>): PictureAnnotation {
  return {
    id: 'picture',
    file: null,
    url: '',
    isPlaceholder: false,
    progress: 0.5,
    position: 0.5,
    displayDuration: 3000,
    ...overrides,
  };
}

describe('findPictureByFileName', () => {
  it('matches file names case-insensitively', () => {
    const existing = picture({ isPlaceholder: true, originalFileName: 'Summit.JPG' });

    expect(findPictureByFileName([existing], 'summit.jpg')).toBe(existing);
  });

  it('prefers a placeholder when duplicate names exist', () => {
    const loaded = picture({ id: 'loaded', file: new File(['a'], 'summit.jpg') });
    const placeholder = picture({
      id: 'placeholder',
      isPlaceholder: true,
      originalFileName: 'summit.jpg',
    });

    expect(findPictureByFileName([loaded, placeholder], 'summit.jpg')).toBe(placeholder);
  });

  it('does not replace an already loaded picture with the same basename', () => {
    const loaded = picture({ file: new File(['a'], 'summit.jpg') });

    expect(findPictureByFileName([loaded], 'summit.jpg')).toBeUndefined();
  });

  it('does not match a different file name', () => {
    const existing = picture({ originalFileName: 'summit.jpg' });

    expect(findPictureByFileName([existing], 'valley.jpg')).toBeUndefined();
  });
});
