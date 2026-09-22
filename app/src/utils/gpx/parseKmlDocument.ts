import type { RawTrackPoint } from './trackStats';

const GX_NS = 'http://www.google.com/kml/ext/2.2';

function isValidCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat >= -90
    && lat <= 90
    && lon >= -180
    && lon <= 180;
}

export function parseKmlDocument(kmlContent: string, fileName: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(kmlContent, 'text/xml');
  const parseError = document.querySelector('parsererror');

  if (parseError) {
    throw new Error('Invalid KML file format');
  }

  const name = document.querySelector('Placemark > name')?.textContent || getFileStem(fileName);
  const rawPoints = extractKmlTrackPoints(document);

  if (rawPoints.length < 2) {
    throw new Error('A KML route needs at least two valid coordinates');
  }

  return { name, rawPoints };
}

function getFileStem(fileName: string): string {
  return fileName.replace(/\.kml$/i, '');
}

function extractKmlTrackPoints(document: Document) {
  const gxTracks = Array.from(document.getElementsByTagNameNS(GX_NS, 'Track'));
  return gxTracks.length > 0
    ? extractGxTrackPoints(gxTracks)
    : extractLineStringPoints(document);
}

function extractGxTrackPoints(gxTracks: Element[]) {
  const rawPoints: RawTrackPoint[] = [];

  for (const gxTrack of gxTracks) {
    const whenDates = Array.from(gxTrack.getElementsByTagName('when')).map((element) => {
      const text = element.textContent?.trim();
      if (!text) return null;
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? null : date;
    });

    const coordinates = Array.from(gxTrack.getElementsByTagNameNS(GX_NS, 'coord')).map((element) => {
      const [lonText, latText, elevationText] = (element.textContent?.trim() || '').split(/\s+/);
      return {
        lon: Number.parseFloat(lonText ?? ''),
        lat: Number.parseFloat(latText ?? ''),
        elevation: Number.parseFloat(elevationText) || 0,
      };
    });

    const sensorData = getGxSensorData(gxTrack);
    const pointCount = Math.min(whenDates.length, coordinates.length);

    for (let index = 0; index < pointCount; index++) {
      const coordinate = coordinates[index];
      if (!isValidCoordinate(coordinate.lat, coordinate.lon)) continue;

      rawPoints.push({
        lat: coordinate.lat,
        lon: coordinate.lon,
        elevation: coordinate.elevation,
        time: whenDates[index],
        heartRate: sensorData.heartRate[index] || null,
        cadence: sensorData.cadence[index] || null,
        power: sensorData.power[index] || null,
        temperature: sensorData.temperature[index] || null,
      });
    }
  }

  return rawPoints;
}

function getGxSensorData(gxTrack: Element) {
  const sensorData = {
    heartRate: [] as Array<number | null>,
    cadence: [] as Array<number | null>,
    power: [] as Array<number | null>,
    temperature: [] as Array<number | null>,
  };

  const schemaData = gxTrack.querySelector('ExtendedData > SchemaData');
  if (!schemaData) return sensorData;

  const arrays = Array.from(schemaData.getElementsByTagNameNS(GX_NS, 'SimpleArrayData'));
  for (const arrayData of arrays) {
    const name = arrayData.getAttribute('name')?.toLowerCase();
    const values = Array.from(arrayData.getElementsByTagNameNS(GX_NS, 'value')).map((element) =>
      Number.parseFloat(element.textContent || '0') || null
    );

    if (name === 'heartrate' || name === 'heart_rate' || name === 'hr') {
      sensorData.heartRate = values;
    } else if (name === 'cadence' || name === 'cad') {
      sensorData.cadence = values;
    } else if (name === 'power' || name === 'watts' || name === 'pwr') {
      sensorData.power = values;
    } else if (name === 'temperature' || name === 'temp') {
      sensorData.temperature = values;
    }
  }

  return sensorData;
}

function extractLineStringPoints(document: Document) {
  const rawPoints: RawTrackPoint[] = [];
  const coordinateElements = Array.from(
    document.querySelectorAll('LineString > coordinates, MultiGeometry > LineString > coordinates')
  );

  for (const coordinateElement of coordinateElements) {
    const tokens = (coordinateElement.textContent || '').trim().split(/\s+/);

    for (const token of tokens) {
      if (!token.trim()) continue;
      const [lonText, latText, elevationText] = token.split(',');
      const lon = Number.parseFloat(lonText?.trim() ?? '');
      const lat = Number.parseFloat(latText?.trim() ?? '');
      const elevation = Number.parseFloat(elevationText?.trim() || '0') || 0;

      if (!isValidCoordinate(lat, lon)) continue;

      rawPoints.push({
        lat,
        lon,
        elevation,
        time: null,
        heartRate: null,
        cadence: null,
        power: null,
        temperature: null,
      });
    }
  }

  return rawPoints;
}
