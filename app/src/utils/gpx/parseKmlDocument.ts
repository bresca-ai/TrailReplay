import { SaxesParser, type SaxesTagNS } from 'saxes';
import type { RawTrackPoint } from './trackStats';

const GX_NS = 'http://www.google.com/kml/ext/2.2';

type SensorField = 'heartRate' | 'cadence' | 'power' | 'temperature';

interface GxTrackData {
  when: Array<Date | null>;
  coordinates: Array<{ lon: number; lat: number; elevation: number }>;
  sensors: Record<SensorField, Array<number | null>>;
}

type Capture =
  | { type: 'name' | 'when' | 'gx-coordinate' | 'line-coordinates'; text: string }
  | { type: 'sensor'; field: SensorField; text: string };

/** Streaming, worker-safe KML parser for LineString and gx:Track routes. */
export function parseKmlDocument(kmlContent: string, fileName: string) {
  const parser = new SaxesParser({ xmlns: true });
  const elements: Array<{ local: string; uri: string }> = [];
  const gxTrackPoints: RawTrackPoint[] = [];
  const lineStringPoints: RawTrackPoint[] = [];
  let gxTrack: GxTrackData | null = null;
  let sensorField: SensorField | null = null;
  let capture: Capture | null = null;
  let name = '';
  let parseError: Error | null = null;

  parser.on('error', (error) => {
    parseError = error;
  });

  parser.on('opentag', (tag) => {
    const local = tag.local.toLowerCase();
    elements.push({ local, uri: tag.uri });

    if (tag.uri === GX_NS && local === 'track') {
      gxTrack = createGxTrackData();
      return;
    }

    if (!name && local === 'name' && elements[elements.length - 2]?.local === 'placemark') {
      capture = { type: 'name', text: '' };
      return;
    }

    if (gxTrack) {
      if (local === 'when') capture = { type: 'when', text: '' };
      else if (tag.uri === GX_NS && local === 'coord') capture = { type: 'gx-coordinate', text: '' };
      else if (tag.uri === GX_NS && local === 'simplearraydata') {
        sensorField = sensorFieldForName(attributeValue(tag, 'name'));
      } else if (tag.uri === GX_NS && local === 'value' && sensorField) {
        capture = { type: 'sensor', field: sensorField, text: '' };
      }
      return;
    }

    if (local === 'coordinates' && elements.some((element) => element.local === 'linestring')) {
      capture = { type: 'line-coordinates', text: '' };
    }
  });

  const appendText = (text: string) => {
    if (capture) capture.text += text;
  };
  parser.on('text', appendText);
  parser.on('cdata', appendText);

  parser.on('closetag', (tag) => {
    const local = tag.local.toLowerCase();

    if (capture && captureClosesWith(capture, tag)) {
      const text = capture.text.trim();
      if (capture.type === 'name') name = text;
      else if (capture.type === 'when' && gxTrack) gxTrack.when.push(parseDate(text));
      else if (capture.type === 'gx-coordinate' && gxTrack) gxTrack.coordinates.push(parseGxCoordinate(text));
      else if (capture.type === 'line-coordinates') appendLineStringPoints(text, lineStringPoints);
      else if (capture.type === 'sensor' && gxTrack) {
        const value = Number.parseFloat(text);
        gxTrack.sensors[capture.field].push(Number.isFinite(value) && value !== 0 ? value : null);
      }
      capture = null;
    }

    if (tag.uri === GX_NS && local === 'simplearraydata') sensorField = null;
    if (tag.uri === GX_NS && local === 'track' && gxTrack) {
      appendGxTrackPoints(gxTrack, gxTrackPoints);
      gxTrack = null;
      sensorField = null;
      capture = null;
    }

    elements.pop();
  });

  try {
    parser.write(kmlContent).close();
  } catch (error) {
    parseError = error instanceof Error ? error : new Error(String(error));
  }

  if (parseError) throw new Error('Invalid KML file format');
  const rawPoints = gxTrackPoints.length > 0 ? gxTrackPoints : lineStringPoints;
  if (rawPoints.length < 2) {
    throw new Error('A KML route needs at least two valid coordinates');
  }

  return { name: name || getFileStem(fileName), rawPoints };
}

function createGxTrackData(): GxTrackData {
  return {
    when: [],
    coordinates: [],
    sensors: { heartRate: [], cadence: [], power: [], temperature: [] },
  };
}

function attributeValue(tag: SaxesTagNS, localName: string): string | undefined {
  return Object.values(tag.attributes).find((attribute) =>
    attribute.local.toLowerCase() === localName
  )?.value;
}

function sensorFieldForName(name: string | undefined): SensorField | null {
  const normalized = name?.toLowerCase();
  if (normalized === 'heartrate' || normalized === 'heart_rate' || normalized === 'hr') return 'heartRate';
  if (normalized === 'cadence' || normalized === 'cad') return 'cadence';
  if (normalized === 'power' || normalized === 'watts' || normalized === 'pwr') return 'power';
  if (normalized === 'temperature' || normalized === 'temp') return 'temperature';
  return null;
}

function captureClosesWith(capture: Capture, tag: SaxesTagNS) {
  const local = tag.local.toLowerCase();
  if (capture.type === 'name') return local === 'name';
  if (capture.type === 'when') return local === 'when';
  if (capture.type === 'gx-coordinate') return tag.uri === GX_NS && local === 'coord';
  if (capture.type === 'line-coordinates') return local === 'coordinates';
  return tag.uri === GX_NS && local === 'value';
}

function parseDate(text: string): Date | null {
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseGxCoordinate(text: string) {
  const [lonText, latText, elevationText] = text.split(/\s+/);
  return {
    lon: Number.parseFloat(lonText),
    lat: Number.parseFloat(latText),
    elevation: Number.parseFloat(elevationText) || 0,
  };
}

function appendGxTrackPoints(track: GxTrackData, points: RawTrackPoint[]) {
  const pointCount = Math.min(track.when.length, track.coordinates.length);
  for (let index = 0; index < pointCount; index += 1) {
    const coordinate = track.coordinates[index];
    if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lon)) continue;
    points.push({
      lat: coordinate.lat,
      lon: coordinate.lon,
      elevation: coordinate.elevation,
      time: track.when[index],
      heartRate: track.sensors.heartRate[index] ?? null,
      cadence: track.sensors.cadence[index] ?? null,
      power: track.sensors.power[index] ?? null,
      temperature: track.sensors.temperature[index] ?? null,
    });
  }
}

function appendLineStringPoints(text: string, points: RawTrackPoint[]) {
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const [lonText, latText, elevationText] = token.split(',');
    const lon = Number.parseFloat(lonText);
    const lat = Number.parseFloat(latText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    points.push({
      lat,
      lon,
      elevation: Number.parseFloat(elevationText || '0') || 0,
      time: null,
      heartRate: null,
      cadence: null,
      power: null,
      temperature: null,
    });
  }
}

function getFileStem(fileName: string): string {
  return fileName.replace(/\.kml$/i, '');
}
