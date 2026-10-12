import { SaxesParser, type SaxesTagNS } from 'saxes';
import type { RawTrackPoint } from './trackStats';

type PointField = 'elevation' | 'time' | 'heartRate' | 'cadence' | 'power' | 'temperature';

interface PendingPoint {
  lat: number;
  lon: number;
  values: Partial<Record<PointField, string>>;
}

/**
 * Parse GPX without browser DOM APIs so the same code can run in a Web Worker.
 * A streaming parser also avoids building a second, full in-memory DOM for
 * large activity files.
 */
export function parseGpxDocument(gpxContent: string, fileName: string) {
  const parser = new SaxesParser({ xmlns: true });
  const elements: string[] = [];
  const rawPoints: RawTrackPoint[] = [];
  let pendingPoint: PendingPoint | null = null;
  let capture: { field: PointField | 'name'; text: string } | null = null;
  let name = '';
  let pointElementCount = 0;
  let parseError: Error | null = null;

  parser.on('error', (error) => {
    parseError = error;
  });

  parser.on('opentag', (tag) => {
    const local = tag.local.toLowerCase();
    elements.push(local);

    if (local === 'trkpt' || local === 'rtept') {
      pointElementCount += 1;
      pendingPoint = {
        lat: Number.parseFloat(attributeValue(tag, 'lat') || ''),
        lon: Number.parseFloat(attributeValue(tag, 'lon') || ''),
        values: {},
      };
      return;
    }

    if (!pendingPoint && local === 'name' && isTrackNamePath(elements) && !name) {
      capture = { field: 'name', text: '' };
      return;
    }

    if (!pendingPoint) return;
    const field = pointFieldForElement(local);
    if (field && pendingPoint.values[field] === undefined) {
      capture = { field, text: '' };
    }
  });

  const appendText = (text: string) => {
    if (capture) capture.text += text;
  };
  parser.on('text', appendText);
  parser.on('cdata', appendText);

  parser.on('closetag', (tag) => {
    const local = tag.local.toLowerCase();

    if (capture && (capture.field === 'name' ? local === 'name' : pointFieldForElement(local) === capture.field)) {
      const value = capture.text.trim();
      if (capture.field === 'name') name = value;
      else if (pendingPoint) pendingPoint.values[capture.field] = value;
      capture = null;
    }

    if ((local === 'trkpt' || local === 'rtept') && pendingPoint) {
      const { lat, lon, values } = pendingPoint;
      if (isValidCoordinate(lat, lon)) {
        rawPoints.push({
          lat,
          lon,
          elevation: parseFiniteNumber(values.elevation, 0),
          time: parseTimestamp(values.time),
          heartRate: parseSensorNumber(values.heartRate, 'int'),
          cadence: parseSensorNumber(values.cadence, 'int'),
          power: parseSensorNumber(values.power, 'float'),
          temperature: parseSensorNumber(values.temperature, 'float'),
        });
      }
      pendingPoint = null;
      capture = null;
    }

    elements.pop();
  });

  try {
    parser.write(gpxContent).close();
  } catch (error) {
    parseError = error instanceof Error ? error : new Error(String(error));
  }

  if (parseError) throw new Error('Invalid GPX file format');
  if (rawPoints.length < 2) {
    throw new Error(pointElementCount === 0
      ? 'No track points found in GPX file'
      : 'A GPX route needs at least two valid track points');
  }

  return { name: name || getFileStem(fileName), rawPoints };
}

function attributeValue(tag: SaxesTagNS, localName: string): string | undefined {
  return Object.values(tag.attributes).find((attribute) =>
    attribute.local.toLowerCase() === localName
  )?.value;
}

function isTrackNamePath(elements: string[]) {
  const parent = elements[elements.length - 2];
  return parent === 'trk' || parent === 'gpx';
}

function pointFieldForElement(local: string): PointField | null {
  if (local === 'ele') return 'elevation';
  if (local === 'time') return 'time';
  if (local === 'hr') return 'heartRate';
  if (local === 'cad') return 'cadence';
  if (local === 'power') return 'power';
  if (local === 'atemp') return 'temperature';
  return null;
}

function getFileStem(fileName: string): string {
  return fileName.replace(/\.gpx$/i, '');
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function parseFiniteNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTimestamp(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseSensorNumber(value: string | undefined, parser: 'int' | 'float') {
  if (!value) return null;
  const parsed = parser === 'int'
    ? Number.parseInt(value, 10)
    : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
