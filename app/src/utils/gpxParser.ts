import type { GPXTrack } from '@/types';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import { parseGpxDocument } from '@/utils/gpx/parseGpxDocument';
import { parseKmlDocument } from '@/utils/gpx/parseKmlDocument';
import { buildTrackFromRawPoints } from '@/utils/gpx/trackStats';
import { parseFitDocument } from '@/utils/fit/parseFitFile';
import { serializeTrackToGpx } from '@/utils/gpx/serializeTrackToGpx';
import { canParseRouteFilesInWorker, parseRouteFilesInWorker } from '@/utils/routeFileWorkerClient';

export { serializeTrackToGpx };

// Parse GPX XML content
export function parseGPX(gpxContent: string, fileName: string): GPXTrack {
  const { name, rawPoints } = parseGpxDocument(gpxContent, fileName);

  return buildTrackFromRawPoints({
    idPrefix: 'track',
    name,
    rawPoints,
  });
}

// Parse KML XML content
export function parseKML(kmlContent: string, fileName: string): GPXTrack {
  const { name, rawPoints } = parseKmlDocument(kmlContent, fileName);

  return buildTrackFromRawPoints({
    idPrefix: 'kml',
    name,
    rawPoints,
  });
}

// Parse a watch's original FIT recording
export function parseFIT(buffer: ArrayBuffer, fileName: string): GPXTrack {
  const { name, rawPoints } = parseFitDocument(buffer, fileName);

  return buildTrackFromRawPoints({
    idPrefix: 'fit',
    name,
    rawPoints,
  });
}

// Parse multiple GPX/KML/FIT files
/**
 * Parsed tracks paired with the file each came from. A recipe names its routes
 * by file name, so that pairing has to survive parsing — a file that fails to
 * parse must not shift the ones after it onto the wrong names.
 */
export async function parseRouteFiles(files: File[]): Promise<Array<{ track: GPXTrack; fileName: string }>> {
  const routeFiles = files.filter((file) => getSupportedRouteFileExtension(file.name));
  if (canParseRouteFilesInWorker() && routeFiles.length > 0) {
    try {
      const response = await parseRouteFilesInWorker(routeFiles);
      response.failures.forEach(({ fileName, message }) => {
        console.error(`Error parsing ${fileName}:`, new Error(message));
      });
      return response.parsed.map(({ track, fileName }) => {
        // Immer otherwise recursively freezes every point when this object enters
        // the store. The route geometry is immutable, so freezing its containers
        // once keeps that last handoff proportional to the number of files.
        Object.freeze(track.points);
        Object.freeze(track);
        return { track, fileName };
      });
    } catch (error) {
      // CSPs and older embedded browsers can block module workers. Preserve the
      // existing import path instead of turning that into a failed upload.
      console.warn('Route worker unavailable; parsing on the main thread.', error);
    }
  }

  return parseRouteFilesOnMainThread(routeFiles);
}

async function parseRouteFilesOnMainThread(files: File[]): Promise<Array<{ track: GPXTrack; fileName: string }>> {
  const parsed: Array<{ track: GPXTrack; fileName: string }> = [];

  for (const file of files) {
    const extension = getSupportedRouteFileExtension(file.name);
    if (!extension) continue;

    try {
      let track: GPXTrack;
      if (extension === 'fit') {
        track = parseFIT(await file.arrayBuffer(), file.name);
      } else if (extension === 'gpx') {
        track = parseGPX(await file.text(), file.name);
      } else {
        track = parseKML(await file.text(), file.name);
      }
      parsed.push({ track, fileName: file.name });
    } catch (error) {
      console.error(`Error parsing ${file.name}:`, error);
    }
  }

  return parsed;
}

export async function parseGPXFiles(files: File[]): Promise<GPXTrack[]> {
  return (await parseRouteFiles(files)).map((entry) => entry.track);
}

export const ROUTE_FILE_EXTENSIONS = ['gpx', 'kml', 'fit'] as const;

export type RouteFileExtension = (typeof ROUTE_FILE_EXTENSIONS)[number];

export function getSupportedRouteFileExtension(fileName: string): RouteFileExtension | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return ROUTE_FILE_EXTENSIONS.includes(extension as RouteFileExtension)
    ? (extension as RouteFileExtension)
    : null;
}

// Get point at a specific distance along the track
export function getPointAtDistance(track: GPXTrack, distance: number) {
  return interpolateTrackPoint(track, distance);
}

// Calculate heart rate zones
export function calculateHeartRateZones(maxHeartRate: number = 180): { [key: string]: { min: number; max: number; color: string } } {
  return {
    recovery: { min: 0, max: maxHeartRate * 0.6, color: '#4ade80' },
    aerobic: { min: maxHeartRate * 0.6, max: maxHeartRate * 0.7, color: '#60a5fa' },
    tempo: { min: maxHeartRate * 0.7, max: maxHeartRate * 0.8, color: '#fbbf24' },
    threshold: { min: maxHeartRate * 0.8, max: maxHeartRate * 0.9, color: '#f97316' },
    anaerobic: { min: maxHeartRate * 0.9, max: maxHeartRate, color: '#ef4444' },
  };
}

// Get color for heart rate
export function getHeartRateColor(heartRate: number, maxHeartRate: number = 180): string {
  const zones = calculateHeartRateZones(maxHeartRate);
  
  for (const [, zone] of Object.entries(zones)) {
    if (heartRate >= zone.min && heartRate < zone.max) {
      return zone.color;
    }
  }
  
  return zones.anaerobic.color;
}
