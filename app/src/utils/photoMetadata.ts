import exifr from 'exifr';

export type PhotoTimestampSource =
  | 'DateTimeOriginal'
  | 'CreateDate'
  | 'MediaCreateDate'
  | 'DateTimeDigitized'
  | 'ModifyDate'
  | 'GPSDateTime'
  | 'fileLastModified';

export type PhotoCoordinateSource =
  | 'latitudeLongitude'
  | 'gpsLatitudeLongitude'
  | 'yandexGps';

export interface NormalizedPhotoMetadata {
  latitude?: number;
  longitude?: number;
  coordinateSource?: PhotoCoordinateSource;
  timestamp?: Date;
  timestampSource?: PhotoTimestampSource;
}

type MetadataRecord = Record<string, unknown>;

interface ExifReaderTagLike {
  value?: unknown;
  description?: unknown;
}

const DIRECT_LATITUDE_KEYS = ['latitude', 'Latitude'] as const;
const DIRECT_LONGITUDE_KEYS = ['longitude', 'Longitude'] as const;
const GPS_LATITUDE_KEYS = ['GPSLatitude'] as const;
const GPS_LONGITUDE_KEYS = ['GPSLongitude'] as const;
const GPS_LATITUDE_REF_KEYS = ['GPSLatitudeRef', 'LatitudeRef'] as const;
const GPS_LONGITUDE_REF_KEYS = ['GPSLongitudeRef', 'LongitudeRef'] as const;
const GPS_DEST_LATITUDE_KEYS = ['GPSDestLatitude'] as const;
const GPS_DEST_LONGITUDE_KEYS = ['GPSDestLongitude'] as const;
const GPS_PAIR_KEYS = ['GPSPosition', 'GPSCoordinates', 'Coordinates', 'coordinate', 'coordinates'] as const;
const LOCATION_SHOWN_LATITUDE_KEYS = ['LocationShownGPSLatitude', 'LocationCreatedGPSLatitude'] as const;
const LOCATION_SHOWN_LONGITUDE_KEYS = ['LocationShownGPSLongitude', 'LocationCreatedGPSLongitude'] as const;
const QUICKTIME_LOCATION_KEYS = [
  '@xyz',
  'location',
  'location-eng',
  'location.ISO6709',
  'com.apple.quicktime.location.ISO6709',
  'com.apple.quicktime.location',
] as const;
const QUICKTIME_LOCATION_PATHS = [
  ['QuickTime', '@xyz'],
  ['QuickTime', 'location'],
  ['QuickTime', 'location-eng'],
  ['QuickTime', 'location.ISO6709'],
  ['quicktime', '@xyz'],
  ['quicktime', 'location'],
  ['quicktime', 'location-eng'],
  ['quicktime', 'location.ISO6709'],
] as const;

function isMetadataRecord(value: unknown): value is MetadataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function getValueAtPath(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;

  for (const segment of path) {
    if (!isMetadataRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function findFirstDeepValue(source: unknown, keys: readonly string[]): unknown {
  const queue: unknown[] = [source];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!isMetadataRecord(current)) {
      continue;
    }

    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    for (const key of keys) {
      if (key in current) {
        return current[key];
      }
    }

    for (const value of Object.values(current)) {
      if (isMetadataRecord(value)) {
        queue.push(value);
      } else if (Array.isArray(value)) {
        queue.push(...value);
      }
    }
  }

  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value) && value.length === 2) {
    const numerator = toFiniteNumber(value[0]);
    const denominator = toFiniteNumber(value[1]);
    if (numerator !== undefined && denominator !== undefined && denominator !== 0) {
      return numerator / denominator;
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (typeof value === 'object' && value !== null) {
    const numerator = (value as { numerator?: unknown }).numerator;
    const denominator = (value as { denominator?: unknown }).denominator;
    const parsedNumerator = toFiniteNumber(numerator);
    const parsedDenominator = toFiniteNumber(denominator);
    if (parsedNumerator !== undefined && parsedDenominator !== undefined && parsedDenominator !== 0) {
      return parsedNumerator / parsedDenominator;
    }

    if ('value' in value) {
      return toFiniteNumber((value as { value?: unknown }).value);
    }
  }

  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    if (value.length === 1) {
      return toStringValue(value[0]);
    }

    const stringParts = value
      .map((entry) => toStringValue(entry))
      .filter((entry): entry is string => entry !== undefined);

    if (stringParts.length > 0) {
      return stringParts.join(' ');
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (isMetadataRecord(value)) {
    return (
      toStringValue((value as ExifReaderTagLike).value) ??
      toStringValue((value as ExifReaderTagLike).description)
    );
  }

  return undefined;
}

function parseCoordinateString(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^[-+]?\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return toFiniteNumber(trimmed);
  }

  const parts = Array.from(trimmed.matchAll(/-?\d+(?:[.,]\d+)?/g), (match) =>
    toFiniteNumber(match[0].replace(',', '.')),
  ).filter((entry): entry is number => entry !== undefined);

  if (parts.length === 0) {
    return undefined;
  }

  if (parts.length === 1) {
    return applyCoordinateRef(parts[0], trimmed);
  }

  const degrees = Math.abs(parts[0]) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  return applyCoordinateRef(degrees, trimmed);
}

function toDegrees(value: unknown, ref?: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = parseCoordinateString(value);
    if (parsed !== undefined) {
      return applyCoordinateRef(parsed, ref ?? value);
    }
  }

  const direct = toFiniteNumber(value);
  if (direct !== undefined && !Array.isArray(value)) {
    return applyCoordinateRef(direct, ref);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => toFiniteNumber(entry))
      .filter((entry): entry is number => entry !== undefined);

    if (parts.length > 0) {
      const degrees = parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
      return applyCoordinateRef(degrees, ref);
    }
  }

  if (isMetadataRecord(value) && 'value' in value) {
    return toDegrees(value.value, ref ?? value.ref ?? value.direction ?? value.hemisphere);
  }

  return undefined;
}

function normalizeCoordinateRef(ref: unknown): string | undefined {
  const direct = toStringValue(ref);
  if (!direct) {
    return undefined;
  }

  const normalized = direct.trim().toUpperCase();
  if (normalized === 'N' || normalized.startsWith('NORTH')) {
    return 'N';
  }
  if (normalized === 'S' || normalized.startsWith('SOUTH')) {
    return 'S';
  }
  if (normalized === 'E' || normalized.startsWith('EAST')) {
    return 'E';
  }
  if (normalized === 'W' || normalized.startsWith('WEST')) {
    return 'W';
  }

  return normalized;
}

function applyCoordinateRef(value: number, ref: unknown): number {
  const normalized = normalizeCoordinateRef(ref);
  if (!normalized) {
    return value;
  }

  if (normalized === 'S' || normalized === 'W') {
    return -Math.abs(value);
  }
  if (normalized === 'N' || normalized === 'E') {
    return Math.abs(value);
  }

  return value;
}

function parseDateCandidate(value: unknown, offset?: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }
    return parseDateCandidate(value[0], offset);
  }

  if (isMetadataRecord(value) && 'value' in value) {
    return parseDateCandidate(
      value.value,
      offset ?? (value as MetadataRecord).offsetTime ?? (value as MetadataRecord).timezone,
    );
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const exifNormalized = trimmed.replace(
    /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.\d+)?$/,
    '$1-$2-$3T$4',
  );
  const offsetSuffix = toStringValue(offset);
  const exifWithOffset = offsetSuffix ? new Date(`${exifNormalized}${offsetSuffix}`) : null;
  if (exifWithOffset && !Number.isNaN(exifWithOffset.getTime())) {
    return exifWithOffset;
  }
  const exifParsed = new Date(exifNormalized);
  if (!Number.isNaN(exifParsed.getTime())) {
    return exifParsed;
  }

  return undefined;
}

function parseGpsTimestamp(dateStamp: unknown, timeStamp: unknown): Date | undefined {
  let normalizedDate: string | undefined;

  if (typeof dateStamp === 'string' && dateStamp.trim()) {
    normalizedDate = dateStamp.trim().replace(/^(\d{4}):(\d{2}):(\d{2})$/, '$1-$2-$3');
  }

  if (!normalizedDate) {
    return undefined;
  }

  let normalizedTime: string | undefined;
  if (typeof timeStamp === 'string' && timeStamp.trim()) {
    normalizedTime = timeStamp.trim().replace(',', '.');
  } else if (Array.isArray(timeStamp)) {
    const parts = timeStamp
      .map((entry) => toFiniteNumber(entry))
      .filter((entry): entry is number => entry !== undefined);
    if (parts.length >= 2) {
      const [hours, minutes, seconds = 0] = parts;
      const wholeSeconds = Math.floor(seconds);
      const milliseconds = Math.round((seconds - wholeSeconds) * 1000);
      const fractionalSuffix = milliseconds > 0 ? `.${String(milliseconds).padStart(3, '0')}` : '';
      normalizedTime = [
        String(Math.max(0, Math.floor(hours))).padStart(2, '0'),
        String(Math.max(0, Math.floor(minutes))).padStart(2, '0'),
        `${String(Math.max(0, wholeSeconds)).padStart(2, '0')}${fractionalSuffix}`,
      ].join(':');
    }
  }

  if (!normalizedTime) {
    return undefined;
  }

  const parsed = new Date(`${normalizedDate}T${normalizedTime}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isLatitude(value: number | undefined): value is number {
  return value !== undefined && Math.abs(value) <= 90;
}

function isLongitude(value: number | undefined): value is number {
  return value !== undefined && Math.abs(value) <= 180;
}

function parseCoordinatePair(value: unknown): { latitude: number; longitude: number } | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parts = trimmed
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    const latitude = toDegrees(parts[0], parts[0]);
    const longitude = toDegrees(parts[1], parts[1]);
    if (isLatitude(latitude) && isLongitude(longitude)) {
      return { latitude, longitude };
    }
  }

  const matches = Array.from(trimmed.matchAll(/[-+]?\d+(?:[.,]\d+)?/g), (match) =>
    toFiniteNumber(match[0].replace(',', '.')),
  ).filter((entry): entry is number => entry !== undefined);

  if (matches.length === 2) {
    const [latitude, longitude] = matches;
    if (isLatitude(latitude) && isLongitude(longitude)) {
      return { latitude, longitude };
    }
  }

  return undefined;
}

function parseIso6709CoordinatePair(value: unknown): { latitude: number; longitude: number } | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^([+-]\d{2}(?:\.\d+)?)([+-]\d{3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\/?$/);
  if (!match) {
    return undefined;
  }

  const latitude = toFiniteNumber(match[1]);
  const longitude = toFiniteNumber(match[2]);

  if (isLatitude(latitude) && isLongitude(longitude)) {
    return { latitude, longitude };
  }

  return undefined;
}

export function extractCoordinatesFromText(text: string): { latitude: number; longitude: number } | undefined {
  const sanitized = text.replace(/\0+/g, ' ');
  const taggedIso6709Match = sanitized.match(
    /(?:location\.ISO6709|com\.apple\.quicktime\.location(?:\.ISO6709)?|location-eng|location|GPSCoordinates|@xyz)[^+-]{0,80}([+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?\/?)/i,
  );
  const taggedIso6709 = parseIso6709CoordinatePair(taggedIso6709Match?.[1]);
  if (taggedIso6709) {
    return taggedIso6709;
  }

  const iso6709Match = sanitized.match(/[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?\/?/);
  const iso6709 = parseIso6709CoordinatePair(iso6709Match?.[0]);
  if (iso6709) {
    return iso6709;
  }

  const latitudeMatch = sanitized.match(/(?:LocationShownGPSLatitude|LocationCreatedGPSLatitude)[^+-\d]{0,40}([+-]?\d+(?:\.\d+)?)/i);
  const longitudeMatch = sanitized.match(/(?:LocationShownGPSLongitude|LocationCreatedGPSLongitude)[^+-\d]{0,40}([+-]?\d+(?:\.\d+)?)/i);
  const latitude = toDegrees(latitudeMatch?.[1]);
  const longitude = toDegrees(longitudeMatch?.[1]);
  if (isLatitude(latitude) && isLongitude(longitude)) {
    return { latitude, longitude };
  }

  const gpsLatitudeMatch = sanitized.match(/(?:GPSLatitude|Latitude)[^+\dNSWE-]{0,40}([NS]?\s*[+-]?\d+(?:\.\d+)?(?:[^\d]{1,6}\d+(?:\.\d+)?(?:[^\d]{1,6}\d+(?:\.\d+)?)?)?)/i);
  const gpsLongitudeMatch = sanitized.match(/(?:GPSLongitude|Longitude)[^+\dNSWE-]{0,40}([EW]?\s*[+-]?\d+(?:\.\d+)?(?:[^\d]{1,6}\d+(?:\.\d+)?(?:[^\d]{1,6}\d+(?:\.\d+)?)?)?)/i);
  const gpsLatitudeRefMatch = sanitized.match(/GPSLatitudeRef[^A-Z]{0,20}([NS])/i);
  const gpsLongitudeRefMatch = sanitized.match(/GPSLongitudeRef[^A-Z]{0,20}([EW])/i);
  const textLatitude = toDegrees(gpsLatitudeMatch?.[1], gpsLatitudeRefMatch?.[1] ?? gpsLatitudeMatch?.[1]);
  const textLongitude = toDegrees(gpsLongitudeMatch?.[1], gpsLongitudeRefMatch?.[1] ?? gpsLongitudeMatch?.[1]);
  if (isLatitude(textLatitude) && isLongitude(textLongitude)) {
    return { latitude: textLatitude, longitude: textLongitude };
  }

  return undefined;
}

async function readMetadataText(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer();
    return new TextDecoder('latin1').decode(buffer);
  } catch (error) {
    console.warn('Failed to read binary metadata text:', error);
    return null;
  }
}

function extractCoordinates(metadata: MetadataRecord): Pick<NormalizedPhotoMetadata, 'latitude' | 'longitude' | 'coordinateSource'> {
  const directLatitude =
    toDegrees(getValueAtPath(metadata, ['gps', 'latitude'])) ??
    toDegrees(findFirstDeepValue(metadata, DIRECT_LATITUDE_KEYS), findFirstDeepValue(metadata, GPS_LATITUDE_REF_KEYS));
  const directLongitude =
    toDegrees(getValueAtPath(metadata, ['gps', 'longitude'])) ??
    toDegrees(findFirstDeepValue(metadata, DIRECT_LONGITUDE_KEYS), findFirstDeepValue(metadata, GPS_LONGITUDE_REF_KEYS));
  if (isLatitude(directLatitude) && isLongitude(directLongitude)) {
    return {
      latitude: directLatitude,
      longitude: directLongitude,
      coordinateSource: 'latitudeLongitude',
    };
  }

  const gpsLatitude = toDegrees(
    getValueAtPath(metadata, ['gps', 'GPSLatitude']) ?? findFirstDeepValue(metadata, GPS_LATITUDE_KEYS),
    getValueAtPath(metadata, ['gps', 'GPSLatitudeRef']) ?? findFirstDeepValue(metadata, GPS_LATITUDE_REF_KEYS),
  );
  const gpsLongitude = toDegrees(
    getValueAtPath(metadata, ['gps', 'GPSLongitude']) ?? findFirstDeepValue(metadata, GPS_LONGITUDE_KEYS),
    getValueAtPath(metadata, ['gps', 'GPSLongitudeRef']) ?? findFirstDeepValue(metadata, GPS_LONGITUDE_REF_KEYS),
  );
  if (isLatitude(gpsLatitude) && isLongitude(gpsLongitude)) {
    return {
      latitude: gpsLatitude,
      longitude: gpsLongitude,
      coordinateSource: 'gpsLatitudeLongitude',
    };
  }

  const yandexLatitude = toDegrees(findFirstDeepValue(metadata, GPS_DEST_LATITUDE_KEYS));
  const yandexLongitude = toDegrees(findFirstDeepValue(metadata, GPS_DEST_LONGITUDE_KEYS));
  if (isLatitude(yandexLatitude) && isLongitude(yandexLongitude)) {
    return {
      latitude: yandexLatitude,
      longitude: yandexLongitude,
      coordinateSource: 'yandexGps',
    };
  }

  const shownLatitude = toDegrees(findFirstDeepValue(metadata, LOCATION_SHOWN_LATITUDE_KEYS));
  const shownLongitude = toDegrees(findFirstDeepValue(metadata, LOCATION_SHOWN_LONGITUDE_KEYS));
  if (isLatitude(shownLatitude) && isLongitude(shownLongitude)) {
    return {
      latitude: shownLatitude,
      longitude: shownLongitude,
      coordinateSource: 'gpsLatitudeLongitude',
    };
  }

  const pair = parseCoordinatePair(findFirstDeepValue(metadata, GPS_PAIR_KEYS));
  if (pair) {
    return {
      latitude: pair.latitude,
      longitude: pair.longitude,
      coordinateSource: 'gpsLatitudeLongitude',
    };
  }

  const quickTimeLocation =
    findFirstDeepValue(metadata, QUICKTIME_LOCATION_KEYS) ??
    QUICKTIME_LOCATION_PATHS
      .map((path) => getValueAtPath(metadata, path))
      .find((value) => value !== undefined);
  const iso6709Pair = parseIso6709CoordinatePair(quickTimeLocation);
  if (iso6709Pair) {
    return {
      latitude: iso6709Pair.latitude,
      longitude: iso6709Pair.longitude,
      coordinateSource: 'gpsLatitudeLongitude',
    };
  }

  return {};
}

function extractTimestamp(
  file: File,
  metadata: MetadataRecord,
): Pick<NormalizedPhotoMetadata, 'timestamp' | 'timestampSource'> {
  const candidates: Array<{ source: PhotoTimestampSource; value: unknown; offset?: unknown }> = [
    { source: 'DateTimeOriginal', value: metadata.DateTimeOriginal, offset: metadata.OffsetTimeOriginal ?? metadata.OffsetTime },
    { source: 'CreateDate', value: metadata.CreateDate, offset: metadata.OffsetTime },
    { source: 'MediaCreateDate', value: metadata.MediaCreateDate, offset: metadata.OffsetTime },
    { source: 'DateTimeDigitized', value: metadata.DateTimeDigitized, offset: metadata.OffsetTimeDigitized ?? metadata.OffsetTime },
    { source: 'ModifyDate', value: metadata.ModifyDate, offset: metadata.OffsetTime },
  ];

  for (const candidate of candidates) {
    const parsed = parseDateCandidate(candidate.value, candidate.offset);
    if (parsed) {
      return {
        timestamp: parsed,
        timestampSource: candidate.source,
      };
    }
  }

  const gpsDateTime = parseGpsTimestamp(metadata.GPSDateStamp, metadata.GPSTimeStamp);
  if (gpsDateTime) {
    return {
      timestamp: gpsDateTime,
      timestampSource: 'GPSDateTime',
    };
  }

  if (file.lastModified > 0) {
    const lastModified = new Date(file.lastModified);
    if (!Number.isNaN(lastModified.getTime())) {
      return {
        timestamp: lastModified,
        timestampSource: 'fileLastModified',
      };
    }
  }

  return {};
}

export function normalizePhotoMetadata(file: File, rawMetadata: unknown): NormalizedPhotoMetadata {
  const metadata = isMetadataRecord(rawMetadata) ? rawMetadata : {};

  return {
    ...extractCoordinates(metadata),
    ...extractTimestamp(file, metadata),
  };
}

async function readExifReaderMetadata(file: File): Promise<MetadataRecord> {
  try {
    const exifReaderModule = await import('exifreader');
    const exifReader = exifReaderModule.default ?? exifReaderModule;
    const parsedMetadata = await exifReader.load(file);
    return isMetadataRecord(parsedMetadata) ? parsedMetadata : {};
  } catch (error) {
    console.warn('Failed to extract photo metadata with ExifReader:', error);
    return {};
  }
}

export async function readPhotoMetadata(file: File): Promise<NormalizedPhotoMetadata> {
  let metadata: MetadataRecord = {};
  let gpsMetadata: MetadataRecord = {};

  try {
    const parsedMetadata = await exifr.parse(file, {
      gps: true,
      exif: true,
      ifd0: {},
      xmp: { multiSegment: true },
    });

    if (isMetadataRecord(parsedMetadata)) {
      metadata = parsedMetadata;
    }
  } catch (error) {
    console.warn('Failed to extract photo metadata:', error);
  }

  try {
    const parsedGps = await exifr.gps(file);
    if (isMetadataRecord(parsedGps)) {
      gpsMetadata = parsedGps;
    }
  } catch (error) {
    console.warn('Failed to extract photo GPS metadata:', error);
  }

  const normalized = normalizePhotoMetadata(file, {
    ...metadata,
    ...gpsMetadata,
  });

  if (normalized.latitude !== undefined && normalized.longitude !== undefined && normalized.timestamp !== undefined) {
    return normalized;
  }

  const exifReaderMetadata = await readExifReaderMetadata(file);
  const normalizedWithExifReader = Object.keys(exifReaderMetadata).length > 0
    ? normalizePhotoMetadata(file, {
        ...metadata,
        ...gpsMetadata,
        ...exifReaderMetadata,
      })
    : normalized;

  if (normalizedWithExifReader.latitude !== undefined && normalizedWithExifReader.longitude !== undefined) {
    return normalizedWithExifReader;
  }

  const metadataText = await readMetadataText(file);
  if (!metadataText) {
    return normalizedWithExifReader;
  }

  const textCoordinates = extractCoordinatesFromText(metadataText);
  if (!textCoordinates) {
    return normalizedWithExifReader;
  }

  return {
    ...normalizedWithExifReader,
    latitude: textCoordinates.latitude,
    longitude: textCoordinates.longitude,
    coordinateSource: normalizedWithExifReader.coordinateSource ?? 'gpsLatitudeLongitude',
  };
}
