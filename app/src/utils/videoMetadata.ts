import { extractCoordinatesFromText, type NormalizedPhotoMetadata } from '@/utils/photoMetadata';

/**
 * Where a clip was shot, and when.
 *
 * Photos go through `readPhotoMetadata`, which decodes the *whole* file to
 * latin1 as its last resort. A phone clip is routinely hundreds of megabytes,
 * so that fallback is not an option here. Videos instead get the box they
 * actually keep their metadata in: `moov` is located by walking the top-level
 * ISO base media boxes, and only those bytes are read.
 *
 * `mvhd` carries the creation time in seconds since 1904-01-01, and QuickTime
 * writes the shooting location into `moov/udta` as an ISO 6709 string, which
 * is the same shape `extractCoordinatesFromText` already recognises for
 * photos.
 */

/** Seconds between the QuickTime epoch (1904-01-01) and the Unix epoch. */
const QUICKTIME_EPOCH_OFFSET_SECONDS = 2_082_844_800;

/** A `moov` past this size is not worth reading into memory for two fields. */
const MAX_MOOV_BYTES = 32 * 1024 * 1024;

/** Top-level box headers are tiny; this is only a guard against a pathological file. */
const MAX_TOP_LEVEL_BOXES = 64;

interface BoxLocation {
  offset: number;
  size: number;
}

async function readSlice(file: File, start: number, end: number): Promise<DataView | null> {
  if (start < 0 || end <= start || start >= file.size) return null;
  try {
    const buffer = await file.slice(start, Math.min(end, file.size)).arrayBuffer();
    return new DataView(buffer);
  } catch {
    return null;
  }
}

function readBoxType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** Walks the top-level boxes and returns where `moov` lives, if anywhere. */
async function findMoovBox(file: File): Promise<BoxLocation | null> {
  let offset = 0;

  for (let box = 0; box < MAX_TOP_LEVEL_BOXES && offset < file.size; box += 1) {
    const header = await readSlice(file, offset, offset + 16);
    if (!header || header.byteLength < 8) return null;

    const type = readBoxType(header, 4);
    let size = header.getUint32(0);
    let headerSize = 8;

    if (size === 1) {
      if (header.byteLength < 16) return null;
      // 64-bit sizes only matter for the huge `mdat`, which we skip over.
      const high = header.getUint32(8);
      const low = header.getUint32(12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }

    if (size < headerSize) return null;
    if (type === 'moov') return { offset: offset + headerSize, size: size - headerSize };

    offset += size;
  }

  return null;
}

function findAtomOffset(view: DataView, type: string): number | null {
  const [a, b, c, d] = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
  for (let index = 0; index + 4 <= view.byteLength; index += 1) {
    if (
      view.getUint8(index) === a
      && view.getUint8(index + 1) === b
      && view.getUint8(index + 2) === c
      && view.getUint8(index + 3) === d
    ) {
      return index;
    }
  }
  return null;
}

function readCreationTime(moov: DataView): Date | undefined {
  const mvhdOffset = findAtomOffset(moov, 'mvhd');
  if (mvhdOffset === null) return undefined;

  // `mvhd` payload: version (1 byte), flags (3 bytes), then creation_time.
  const versionOffset = mvhdOffset + 4;
  if (versionOffset + 12 > moov.byteLength) return undefined;

  const version = moov.getUint8(versionOffset);
  let seconds: number;

  if (version === 1) {
    if (versionOffset + 12 > moov.byteLength) return undefined;
    const high = moov.getUint32(versionOffset + 4);
    const low = moov.getUint32(versionOffset + 8);
    seconds = high * 2 ** 32 + low;
  } else {
    seconds = moov.getUint32(versionOffset + 4);
  }

  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;

  const timestamp = (seconds - QUICKTIME_EPOCH_OFFSET_SECONDS) * 1000;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return undefined;

  // A file written with an unset clock reports 1904 or 1970; neither can be
  // matched against a route, and a bad match is worse than no match.
  const year = date.getUTCFullYear();
  if (year < 1990 || year > 2100) return undefined;

  return date;
}

export async function readVideoMetadata(file: File): Promise<NormalizedPhotoMetadata> {
  const fallback: NormalizedPhotoMetadata = file.lastModified > 0
    ? { timestamp: new Date(file.lastModified), timestampSource: 'fileLastModified' }
    : {};

  let moovLocation: BoxLocation | null = null;
  try {
    moovLocation = await findMoovBox(file);
  } catch {
    return fallback;
  }

  if (!moovLocation || moovLocation.size > MAX_MOOV_BYTES) return fallback;

  const moov = await readSlice(file, moovLocation.offset, moovLocation.offset + moovLocation.size);
  if (!moov) return fallback;

  const metadata: NormalizedPhotoMetadata = { ...fallback };

  const creationTime = readCreationTime(moov);
  if (creationTime) {
    metadata.timestamp = creationTime;
    metadata.timestampSource = 'MediaCreateDate';
  }

  const moovText = new TextDecoder('latin1').decode(
    new Uint8Array(moov.buffer, moov.byteOffset, moov.byteLength),
  );
  const coordinates = extractCoordinatesFromText(moovText);
  if (coordinates) {
    metadata.latitude = coordinates.latitude;
    metadata.longitude = coordinates.longitude;
    metadata.coordinateSource = 'gpsLatitudeLongitude';
  }

  return metadata;
}

/**
 * What the browser makes of the clip.
 *
 * `unsupported` is a real answer — the file cannot be decoded, and the Media
 * panel says so instead of dropping it silently. `unknown` is not: a hidden
 * tab makes Chrome defer media loading indefinitely, so a clip that simply has
 * not been looked at yet must not be mistaken for a broken one. Its length is
 * read again from the element that plays it.
 */
export type VideoProbeResult =
  | { status: 'ok'; durationSeconds: number }
  | { status: 'unsupported' }
  | { status: 'unknown' };

export function readVideoDuration(url: string, timeoutMs = 15_000): Promise<VideoProbeResult> {
  return new Promise((resolve) => {
    const element = document.createElement('video');
    let settled = false;

    const finish = (result: VideoProbeResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      element.removeAttribute('src');
      element.load();
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => finish({ status: 'unknown' }), timeoutMs);

    element.preload = 'metadata';
    element.muted = true;
    element.onloadedmetadata = () => {
      const duration = element.duration;
      finish(Number.isFinite(duration) && duration > 0
        ? { status: 'ok', durationSeconds: duration }
        : { status: 'unknown' });
    };
    element.onerror = () => finish({ status: 'unsupported' });
    element.src = url;
  });
}
