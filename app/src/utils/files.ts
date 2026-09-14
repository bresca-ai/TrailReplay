const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
]);

const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

/**
 * Extensions a browser may hand over with an empty or unhelpful `file.type`.
 * `.mov` in particular arrives as `video/quicktime` on some platforms and as
 * `''` on others, which is why the extension is checked as well.
 */
const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'mov',
  'webm',
  'ogv',
  'mkv',
  'avi',
  '3gp',
]);

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) {
    return true;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  return !!extension && IMAGE_EXTENSIONS.has(extension);
}

export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) {
    return true;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  return !!extension && VIDEO_EXTENSIONS.has(extension);
}

export function isHeicFile(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    return true;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  return !!extension && HEIC_EXTENSIONS.has(extension);
}
