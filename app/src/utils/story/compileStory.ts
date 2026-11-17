import type { AppSettings, GPXTrack, JourneySegment, PictureAnnotation, TextAnnotation, VideoAnnotation } from '@/types';
import {
  buildComputedJourney,
  buildJourneyDistanceProfile,
  calculateDistance,
  findDistanceIndex,
  profileDistanceForSegmentAnchor,
  segmentAnchorForProfileDistance,
  segmentAnchorForRouteDistance,
  type ComputedJourney,
  type JourneyDistanceProfile,
  type JourneyPoint,
  type SegmentTiming,
} from '@/utils/journeyUtils';
import { GPS_ROUTE_MATCH_THRESHOLD_METERS } from '@/utils/photoPlacement';
import { projectCoordinateToJourney } from '@/utils/routeProjection';
import { clampTerrainExaggeration } from '@/utils/terrainExaggeration';
import type { RoutePlace, StoryAnchor, StoryDocument, StoryLayout, StoryRef, StorySection } from './storyDocument';

type MediaFields = 'id' | 'url' | 'isPlaceholder' | 'originalFileName' | 'lat' | 'lon' | 'title'
  | 'routeDistance' | 'routeSegmentId' | 'routeSegmentDistance';
type LookFields = 'mapStyle' | 'waybackItemURL' | 'terrainExaggeration';
type StoryMedia = Pick<PictureAnnotation, MediaFields> | Pick<VideoAnnotation, MediaFields>;

export interface StoryCompileInput {
  document: StoryDocument; tracks: GPXTrack[]; journeySegments: JourneySegment[]; textAnnotations: TextAnnotation[];
  pictures: Pick<PictureAnnotation, MediaFields>[]; videos: Pick<VideoAnnotation, MediaFields>[];
  journeyName: string;
  settings: Pick<AppSettings, LookFields | 'unitSystem' | 'trailStyle'>;
}

/**
 * The route on two scales over the same coordinates. `route`: the distance profile, where places live and
 * km labels come from. `travel`: the scroll scale, where each `camera` connector counts as its straight
 * line (each capped at 10% of the route total) instead of 0, so the head glides across and the camera
 * follows instead of cutting.
 */
export interface StoryRoute {
  coordinates: JourneyPoint[]; segmentTimings: SegmentTiming[];
  route: JourneyDistanceProfile; travel: JourneyDistanceProfile;
  bounds: [[number, number], [number, number]]; // [[west, south], [east, north]]; east passes 180 for a route across it
  heights: number[]; // ground metres per coordinate; transport points and tracks without heights (recorded as 0) take the track points around them
}

export interface CompiledMedia {
  kind: 'picture' | 'video'; fileName: string; caption: string;
  src: string | null; // null: placeholder or no url, a neutral box with the file name (wedge still drawn)
  point: [number, number] | null; // [lon, lat]: lat/lon, else the route point at its place; null: no wedge
  elevation: number | null; // ground metres at its route place; null off the route (3D framing takes the head's)
}
/**
 * `key` = `section-${i}-${j}` by position in the document: measuring and place restore use it. Positions,
 * not ids, so no id a file can carry ('cover', 'finish', one with '/', a repeat) makes two elements share a key.
 */
export type CompiledBlock =
  | { kind: 'text'; key: string; paragraphs: string[] } | { kind: 'media'; key: string; media: CompiledMedia };
export interface CompiledSection {
  id: string; key: string; // key: `section-${i}`; the cover and finish are 'cover' and 'finish'
  heading: string; // the creator's, else the anchored note title or media caption, else '' (the reader shows the km)
  blocks: CompiledBlock[];
  routeMeters: number; // the km label: profile scale only
  travelMeters: number; // travel scale, a running max so the head never runs back
  legMeters: number; // travel metres to the next stop (next section or the finish), >= 0: section min-height
}
export interface StoryIssue {
  sectionId: string; blockId?: string;
  kind: 'anchor-missing' | 'anchor-segment-missing' | 'media-missing' | 'media-unplaced' | 'media-placeholder'
    | 'out-of-route-order';
}

export interface CompiledStory {
  title: string; intro: string[]; unitSystem: AppSettings['unitSystem'];
  stats: { distanceMeters: number; elevationGainMeters: number };
  layout: StoryLayout; look: Pick<AppSettings, LookFields> & { trailColor: string };
  route: StoryRoute; sections: CompiledSection[];
  issues: StoryIssue[];
}

const CONNECTOR_TRAVEL_SHARE = 0.1;

/**
 * Null without a route (no segments or no points): the Story tab disables Preview. Never throws on a dangling
 * reference; it falls back and reports an issue. Pure; caches the two profiles privately by the identity of
 * `tracks` and `journeySegments`, so a keystroke never rebuilds a 13,689-point profile.
 */
export function compileStory(input: StoryCompileInput): CompiledStory | null {
  const route = storyRouteFor(input)?.route;
  if (!route) return null;
  const { document, settings } = input;
  const issues: StoryIssue[] = [];

  let headTravel = 0;
  const placed = document.sections.map((section, index) => {
    const report = (kind: StoryIssue['kind'], blockId?: string) => {
      issues.push({ sectionId: section.id, blockId, kind });
    };
    const place = resolveAnchor(input, route, section.anchor, report);
    const travel = travelMetersAt(route, place);
    if (travel < headTravel) report('out-of-route-order');
    headTravel = Math.max(headTravel, travel);
    return {
      id: section.id,
      key: `section-${index}`,
      heading: section.heading.trim() === '' ? refLabel(input, section.anchor.ref) : section.heading,
      blocks: compileBlocks(input, route, section, `section-${index}`, report),
      routeMeters: place.routeMeters,
      travelMeters: headTravel,
    };
  });

  return {
    title: document.title || input.journeyName,
    intro: paragraphs(document.intro),
    unitSystem: settings.unitSystem,
    stats: {
      distanceMeters: route.route.totalDistance,
      elevationGainMeters: input.journeySegments.reduce((sum, segment) => (
        sum + (segment.type === 'track' ? input.tracks.find((t) => t.id === segment.trackId)?.elevationGain ?? 0 : 0)
      ), 0),
    },
    layout: document.layout,
    look: {
      mapStyle: settings.mapStyle,
      waybackItemURL: settings.waybackItemURL,
      terrainExaggeration: clampTerrainExaggeration(settings.terrainExaggeration),
      trailColor: settings.trailStyle.trailColor,
    },
    route,
    sections: placed.map((section, index) => ({
      ...section,
      legMeters: (placed[index + 1]?.travelMeters ?? route.travel.totalDistance) - section.travelMeters,
    })),
    issues,
  };
}

export function resolveRoutePlace(input: StoryCompileInput, target: StoryRef | { routeMeters: number }): RoutePlace | null {
  const built = storyRouteFor(input);
  if (!built) return null;
  const { journey, route } = built;

  if ('routeMeters' in target) {
    if (!Number.isFinite(target.routeMeters)) return null;
    const routeMeters = clamp(target.routeMeters, 0, route.route.totalDistance);
    return { routeMeters, ...segmentAnchorForProfileDistance(route.route, route.segmentTimings, routeMeters) };
  }

  if (target.kind === 'annotation') {
    const note = input.textAnnotations.find((candidate) => candidate.id === target.id);
    if (!note) return null;
    return placeAtRouteDistance(route, note.routeDistance) ?? projectedPlace(journey, route, note.lat, note.lon)?.place ?? null;
  }

  const item: StoryMedia | undefined = (target.kind === 'picture' ? input.pictures : input.videos)
    .find((candidate) => candidate.id === target.id);
  if (!item) return null;
  const live = item.routeSegmentId !== undefined && isFiniteNumber(item.routeSegmentDistance)
    ? placeOnSegment(route, item.routeSegmentId, item.routeSegmentDistance)
    : null;
  if (live) return live;

  const fromDistance = placeAtRouteDistance(route, item.routeDistance);
  const lonLat = mediaLonLat(item);
  if (!lonLat) return fromDistance;
  const reached = fromDistance && routeAt(route, travelMetersAt(route, fromDistance)).lngLat;
  if (reached && metersBetween(reached, lonLat) <= GPS_ROUTE_MATCH_THRESHOLD_METERS) return fromDistance;
  const projected = projectedPlace(journey, route, lonLat[1], lonLat[0]);
  return projected && projected.meters <= GPS_ROUTE_MATCH_THRESHOLD_METERS ? projected.place : null;
}

let routeCache: {
  tracks: GPXTrack[];
  journeySegments: JourneySegment[];
  built: { journey: ComputedJourney; route: StoryRoute } | null;
} | undefined;

function storyRouteFor({ tracks, journeySegments }: StoryCompileInput) {
  if (routeCache?.tracks !== tracks || routeCache.journeySegments !== journeySegments) {
    routeCache = { tracks, journeySegments, built: buildStoryRoute(journeySegments, tracks) };
  }
  return routeCache.built;
}

function buildStoryRoute(journeySegments: JourneySegment[], tracks: GPXTrack[]) {
  const journey = buildComputedJourney(journeySegments, tracks);
  const route = journey && buildJourneyDistanceProfile(journey.coordinates);
  if (!journey || !route) return null;

  const { coordinates, segmentTimings } = journey;
  return {
    journey,
    route: {
      coordinates,
      segmentTimings,
      route,
      travel: travelProfile(route),
      bounds: pathBounds(coordinates.map((point): [number, number] => [point.lon, point.lat])),
      heights: groundHeights(coordinates),
    },
  };
}

/** Where the head stands `travel` metres along the travel scale, and the ground height there. */
export function routeAt(route: StoryRoute, travel: number): { lngLat: [number, number]; elevation: number; lower: number; upper: number } {
  const { coordinates: points, cumulativeDistances: along } = route.travel;
  const upper = findDistanceIndex(route.travel, travel);
  const lower = Math.max(0, upper - 1);
  const span = along[upper] - along[lower];
  const ratio = span > 0 ? clamp((travel - along[lower]) / span, 0, 1) : 1;
  const [from, to] = [points[lower], points[upper]];
  return {
    lngLat: [wrapLongitude(lerp(from.lon, from.lon + longitudeStep(from.lon, to.lon), ratio)), lerp(from.lat, to.lat, ratio)],
    elevation: lerp(route.heights[lower], route.heights[upper], ratio),
    lower,
    upper,
  };
}

/** Degrees east from `from` to `to` the short way, so a step across 180 degrees stays small. */
export function longitudeStep(from: number, to: number): number {
  const step = to - from;
  return step > 180 ? step - 360 : step < -180 ? step + 360 : step;
}

/** `path` with each longitude moved by whole turns to within 180 degrees of the one before, so lines never wrap the world. */
export function unwrapPath(path: readonly (readonly [number, number])[]): [number, number][] {
  let lon = path[0]?.[0] ?? 0;
  return path.map(([next, lat], index) => {
    if (index > 0) lon += longitudeStep(path[index - 1][0], next);
    return [lon, lat];
  });
}

/** [[west, south], [east, north]] of a path unwrapped step by step: west in [-180, 180), east past 180 across it. */
export function pathBounds(path: readonly (readonly [number, number])[]): [[number, number], [number, number]] {
  const [[west, south], [east, north]] = unwrapPath(path).reduce<StoryRoute['bounds']>(([[w, s], [e, n]], [lon, lat]) => [
    [Math.min(w, lon), Math.min(s, lat)],
    [Math.max(e, lon), Math.max(n, lat)],
  ], [[Infinity, Infinity], [-Infinity, -Infinity]]);
  const turn = Number.isFinite(west) ? wrapLongitude(west) - west : 0;
  return [[west + turn, south], [east + turn, north]];
}

function wrapLongitude(lon: number): number {
  return lon >= 180 ? lon - 360 : lon < -180 ? lon + 360 : lon;
}

function groundHeights(points: JourneyPoint[]): number[] {
  const measured = new Set(points.flatMap((point) => (point.segmentType === 'track' && point.elevation !== 0 ? [point.segmentIndex] : [])));
  const known = points.flatMap((point, index) => (measured.has(point.segmentIndex) ? [index] : []));
  if (known.length === 0) return points.map(() => 0);
  let next = 0;
  return points.map((_, index) => {
    while (next < known.length && known[next] < index) next += 1;
    if (next === known.length) return points[known[known.length - 1]].elevation;
    const after = known[next];
    if (after === index || next === 0) return points[after].elevation;
    const before = known[next - 1];
    return lerp(points[before].elevation, points[after].elevation, (index - before) / (after - before));
  });
}

function travelProfile(route: JourneyDistanceProfile): JourneyDistanceProfile {
  const { coordinates: points, cumulativeDistances: routeMeters } = route;
  const steps = points.map((point, index) => {
    const previous = points[index - 1];
    if (!previous) return { connector: undefined, meters: 0 };
    const connector = [point, previous].find((p) => p.transportMode === 'camera')?.segmentIndex;
    return connector === undefined
      ? { connector, meters: routeMeters[index] - routeMeters[index - 1] }
      : { connector, meters: calculateDistance(previous.lat, previous.lon, point.lat, point.lon) * 1000 };
  });

  const connectorMeters = new Map<number, number>();
  for (const { connector, meters } of steps) {
    if (connector !== undefined) connectorMeters.set(connector, (connectorMeters.get(connector) ?? 0) + meters);
  }

  const cap = CONNECTOR_TRAVEL_SHARE * route.totalDistance;
  let total = 0;
  const cumulativeDistances = steps.map(({ connector, meters }) => {
    const length = connector === undefined ? 0 : connectorMeters.get(connector) ?? 0;
    total += length > cap ? meters * (cap / length) : meters;
    return total;
  });
  return { coordinates: points, cumulativeDistances, totalDistance: total };
}

function resolveAnchor(
  input: StoryCompileInput,
  route: StoryRoute,
  anchor: StoryAnchor,
  report: (kind: StoryIssue['kind']) => void,
): RoutePlace {
  const live = anchor.ref && resolveRoutePlace(input, anchor.ref);
  if (live) return live;
  if (anchor.ref) report('anchor-missing');

  const { place } = anchor;
  const onSegment = place.segmentId !== undefined && place.segmentMeters !== undefined
    ? placeOnSegment(route, place.segmentId, place.segmentMeters)
    : null;
  if (onSegment) return onSegment;
  if (place.segmentId !== undefined) report('anchor-segment-missing');
  return { routeMeters: clamp(place.routeMeters, 0, route.route.totalDistance) };
}

function compileBlocks(
  input: StoryCompileInput,
  route: StoryRoute,
  section: StorySection,
  sectionKey: string,
  report: (kind: StoryIssue['kind'], blockId: string) => void,
): CompiledBlock[] {
  return section.blocks.flatMap((block, index): CompiledBlock[] => {
    const key = `${sectionKey}-${index}`;
    if (block.kind === 'text') return [{ kind: 'text', key, paragraphs: paragraphs(block.text) }];

    const item: StoryMedia | undefined = (block.media.kind === 'picture' ? input.pictures : input.videos)
      .find((candidate) => candidate.id === block.media.id);
    if (!item) {
      report('media-missing', block.id);
      return [];
    }
    const src = item.isPlaceholder || !item.url ? null : item.url;
    if (src === null) report('media-placeholder', block.id);
    const place = resolveRoutePlace(input, block.media);
    const onRoute = place && routeAt(route, travelMetersAt(route, place));
    const point = mediaLonLat(item) ?? onRoute?.lngLat ?? null;
    if (!point) report('media-unplaced', block.id);
    return [{
      kind: 'media',
      key,
      media: {
        kind: block.media.kind, fileName: item.originalFileName ?? '', caption: item.title ?? '', src, point,
        elevation: onRoute?.elevation ?? null,
      },
    }];
  });
}

function travelMetersAt(route: StoryRoute, place: RoutePlace): number {
  const along = route.route.cumulativeDistances;
  const travel = route.travel.cumulativeDistances;
  const timing = route.segmentTimings.find((t) => t.segmentId === place.segmentId && t.endCoordIndex >= t.startCoordIndex);
  if (timing) {
    const start = timing.startCoordIndex;
    return travel[start] + clamp(place.routeMeters - along[start], 0, travel[timing.endCoordIndex] - travel[start]);
  }

  const meters = clamp(place.routeMeters, 0, route.route.totalDistance);
  const upper = findDistanceIndex(route.route, meters);
  if (upper === 0) return 0;
  const lower = upper - 1;
  return travel[lower] + (travel[upper] - travel[lower]) * ((meters - along[lower]) / (along[upper] - along[lower]));
}

function placeOnSegment(route: StoryRoute, segmentId: string, segmentMeters: number): RoutePlace | null {
  const routeMeters = profileDistanceForSegmentAnchor(route.route, route.segmentTimings, segmentId, segmentMeters);
  return routeMeters === null ? null : { routeMeters, segmentId, segmentMeters: Math.max(0, segmentMeters) };
}

function placeAtRouteDistance(route: StoryRoute, routeDistance: number | undefined): RoutePlace | null {
  const anchor = isFiniteNumber(routeDistance) ? segmentAnchorForRouteDistance(route.segmentTimings, routeDistance) : null;
  return anchor && placeOnSegment(route, anchor.segmentId, anchor.segmentDistance);
}

function projectedPlace(journey: ComputedJourney, route: StoryRoute, lat: number, lon: number) {
  const match = projectCoordinateToJourney(journey, lat, lon, 0);
  if (match?.routeSegmentId === undefined || match.routeSegmentDistance === undefined) return null;
  const place = placeOnSegment(route, match.routeSegmentId, match.routeSegmentDistance);
  return place && { place, meters: match.distanceMeters };
}

function refLabel(input: StoryCompileInput, ref: StoryRef | null): string {
  if (!ref) return '';
  if (ref.kind === 'annotation') return input.textAnnotations.find((note) => note.id === ref.id)?.title.trim() ?? '';
  return (ref.kind === 'picture' ? input.pictures : input.videos).find((item) => item.id === ref.id)?.title?.trim() ?? '';
}

function mediaLonLat(item: StoryMedia): [number, number] | null {
  return isFiniteNumber(item.lat) && isFiniteNumber(item.lon) ? [item.lon, item.lat] : null;
}

function metersBetween([lonA, latA]: [number, number], [lonB, latB]: [number, number]): number {
  return calculateDistance(latA, lonA, latB, lonB) * 1000;
}

function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph !== '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

function isFiniteNumber(value: number | undefined): value is number {
  return Number.isFinite(value);
}
