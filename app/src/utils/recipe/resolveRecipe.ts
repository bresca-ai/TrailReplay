import type { GPXTrack, IconChange, JourneySegment, RouteTimingMode, TextAnnotation } from '@/types';
import {
  buildComputedJourney,
  buildJourneyDistanceProfile,
  getJourneyPointAtDistance,
  getJourneyPointAtProgress,
  progressForRouteDistance,
} from '@/utils/journeyUtils';
import type { RouteLandmark } from '@/types/landmarks';
import { createId } from '@/utils/id';
import { anchorOnRoute, buildLegs, type RouteAnchor, type RouteLeg } from './anchorOnRoute';
import { matchTrackFiles } from './matchTrackFiles';
import { deriveOvernightStops, describeStop } from './overnightStops';
import { calculateDistance } from '@/utils/gpx/trackStats';
import {
  RecipeError,
  type Recipe,
  type RecipeAnnotation,
  type RecipeLandmark,
  type RecipeReport,
  type RecipeResolvedEntry,
} from './types';

/** Total replay length when legs are stitched and the recipe says nothing. */
const DEFAULT_TOTAL_DURATION_MS = 60_000;
const DEFAULT_ANNOTATION_MS = 5_000;

export interface ResolvedRecipe {
  tracks: GPXTrack[];
  activeTrackId: string;
  journeySegments: JourneySegment[];
  userLandmarks: RouteLandmark[];
  textAnnotations: TextAnnotation[];
  iconChanges: IconChange[];
  report: RecipeReport;
}

function entry(
  title: string,
  at: RouteAnchor,
  progress: number,
  measure: (at: RouteAnchor, progress: number) => number,
  totalMs: number,
  displayMs: number | undefined,
  derived?: boolean,
): RecipeResolvedEntry {
  const atSeconds = (progress * totalMs) / 1000;
  return {
    title,
    trackName: at.leg.name,
    km: at.trackMeters / 1000,
    progress,
    atSeconds,
    ...(displayMs !== undefined
      ? { onScreenFromSeconds: Math.max(0, atSeconds - displayMs / 1000) }
      : {}),
    markerOffMeters: Math.round(measure(at, progress)),
    ...(at.offRouteMeters !== undefined ? { offRouteMeters: Math.round(at.offRouteMeters) } : {}),
    ...(derived ? { derived: true } : {}),
  };
}

function landmarkFrom(
  spec: RecipeLandmark,
  at: RouteAnchor,
  id: string,
  title: string,
  derived: boolean,
  progress: number,
): RouteLandmark {
  return {
    id,
    type: spec.type ?? 'custom',
    source: 'user',
    display: spec.display ?? 'highlight',
    lat: at.lat,
    lon: at.lon,
    progress,
    ...(at.elevation !== undefined ? { elevation: Math.round(at.elevation) } : {}),
    title,
    ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
    // Top importance keeps an authored pin through the replay's visibility
    // budget and its 250 m corridor rule, which only prunes below 5.
    importance: spec.importance ?? 5,
    ...(spec.icon ? { icon: spec.icon } : {}),
    routeDistanceMeters: Math.round(at.routeDistanceMeters),
    ...(spec.color ? { color: spec.color } : {}),
    ...(derived ? { metadata: { tags: { recipe: 'derived' } } } : {}),
  };
}

function annotationFrom(
  spec: RecipeAnnotation,
  at: RouteAnchor,
  id: string,
  title: string,
  progress: number,
): TextAnnotation {
  // Route annotations are authored for the finished replay. A field note is
  // the readable, timed treatment; map captions remain available when the
  // recipe explicitly asks for the lighter-weight option.
  const presentation = spec.presentation ?? 'side-panel';
  const holdDuration = spec.holdDuration ?? (presentation === 'side-panel' ? 6000 : undefined);

  return {
    id,
    progress,
    routeDistance: at.routeDistanceMeters,
    lat: at.lat,
    lon: at.lon,
    title,
    ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
    ...(spec.code ? { code: spec.code } : {}),
    ...(spec.eyebrow ? { eyebrow: spec.eyebrow } : {}),
    ...(spec.meta ? { meta: spec.meta } : {}),
    ...(spec.description ? { description: spec.description } : {}),
    color: spec.color ?? '#C1652F',
    ...(at.elevation !== undefined ? { elevation: Math.round(at.elevation) } : {}),
    displayDuration: spec.displayDuration ?? DEFAULT_ANNOTATION_MS,
    presentation,
    ...(spec.logo ? { logo: spec.logo } : {}),
    ...(holdDuration !== undefined ? { holdDuration } : {}),
    ...(spec.translations ? { translations: spec.translations } : {}),
  };
}

/** Anchors for a derived set, as `{ anchor, title }` pairs ready to place. */
function expandAuto(
  auto: string,
  legs: RouteLeg[],
  warnings: string[],
  requestedTrack: RecipeLandmark['track'] | undefined,
  label: string,
): Array<{ track: number; km: number; title: string }> {
  const requestedIndex = requestedTrack === undefined
    ? undefined
    : typeof requestedTrack === 'number'
      ? requestedTrack
      : legs.findIndex((leg) => leg.name.toLowerCase() === requestedTrack.toLowerCase());

  if (requestedIndex !== undefined && !legs[requestedIndex]) {
    throw new RecipeError(`${label}: no track matches "${requestedTrack}"`);
  }

  if (auto === 'start') {
    return [{ track: requestedIndex ?? 0, km: 0, title: 'Start' }];
  }

  if (auto === 'finish' || auto === 'start-finish') {
    const firstIndex = requestedIndex ?? 0;
    const lastIndex = requestedIndex ?? (legs.length - 1);
    const first = legs[firstIndex];
    const last = legs[lastIndex];
    const finish = {
      track: lastIndex,
      km: last.track.totalDistance / 1000,
      title: 'Finish',
    };
    if (auto === 'finish') return [finish];

    // On a loop the two coincide and the app collapses pins within 80 m, so one
    // pin saying both is what the author actually wants.
    const start = first.track.points[0];
    const end = last.track.points[last.track.points.length - 1];
    const sameSpot = start && end
      && Math.abs(start.lat - end.lat) < 0.001 && Math.abs(start.lon - end.lon) < 0.001;
    return sameSpot
      ? [{ track: firstIndex, km: 0, title: 'Start / Finish' }]
      : [{ track: firstIndex, km: 0, title: 'Start' }, finish];
  }

  if (auto === 'overnight-stops') {
    const { stops, warnings: stopWarnings } = deriveOvernightStops(legs);
    warnings.push(...stopWarnings);
    return stops.map((stop, index) => ({
      track: stop.legIndex,
      km: legs[stop.legIndex].track.totalDistance / 1000,
      title: describeStop(stop, index),
    }));
  }

  throw new RecipeError(`Unknown "auto" value: ${auto}`);
}

export function resolveRecipe(
  recipe: Recipe,
  tracks: GPXTrack[],
  fileNames: string[],
): ResolvedRecipe {
  const matched = matchTrackFiles(recipe.tracks, tracks, fileNames);

  const named = matched.map((match, index) => ({
    track: match.track,
    name: match.spec.name ?? match.track.name,
    duration: match.spec.duration,
    spec: match.spec,
    index,
  }));

  const stitched = (recipe.mode ?? 'stitch') === 'stitch' && named.length > 1;
  const { legs, durations } = buildLegs(named, {
    stitched,
    legDuration: recipe.legDuration ?? 'by-distance',
    totalDuration: recipe.totalDuration ?? DEFAULT_TOTAL_DURATION_MS,
  });

  // Presentation the recipe asked for, applied to the app's parsed tracks.
  const resolvedTracks = named.map((item) => {
    const track = item.track;
    track.name = item.name;
    if (item.spec.color) track.color = item.spec.color;
    const icon = item.spec.activityIcon ?? recipe.activityIcon;
    if (icon) track.activityIcon = icon;
    if (item.spec.visible === false) track.visible = false;
    return track;
  });

  const activeIndex = typeof recipe.activeTrack === 'number'
    ? recipe.activeTrack
    : recipe.activeTrack
      ? named.findIndex((item) => item.name.toLowerCase() === String(recipe.activeTrack).toLowerCase())
      : 0;
  const activeTrack = resolvedTracks[activeIndex] ?? resolvedTracks[0];

  const journeySegments: JourneySegment[] = (stitched ? resolvedTracks : [activeTrack])
    .map((track) => ({
      id: createId(`segment-${track.id}`),
      type: 'track' as const,
      trackId: track.id,
      duration: stitched
        ? durations[resolvedTracks.indexOf(track)]
        : (recipe.totalDuration ?? DEFAULT_TOTAL_DURATION_MS),
    }));

  const timingMode: RouteTimingMode = recipe.routeTimingMode ?? 'recorded';
  const computedJourney = buildComputedJourney(journeySegments, resolvedTracks);
  const journeyTrackIds = new Set(
    journeySegments
      .filter((segment): segment is Extract<JourneySegment, { type: 'track' }> => segment.type === 'track')
      .map((segment) => segment.trackId),
  );

  const warnings: string[] = [];

  if (!stitched && named.length > 1 && recipe.mode === 'alternatives') {
    warnings.push(
      `This recipe has ${named.length} alternative routes, but only "${activeTrack.name}" `
      + 'plays in the timeline. Use mode "stitch" for one multi-file journey, or make '
      + 'one recipe per course when each route should produce its own video.',
    );
  }

  /**
   * The progress the app itself would give this position.
   *
   * Under `recorded` the replay advances by measurement point, not by distance,
   * so a distance ratio only approximates it. Asking the app's own map keeps a
   * recipe exact rather than close.
   */
  const progressAt = (at: RouteAnchor, label: string): number => {
    if (!journeyTrackIds.has(at.leg.track.id)) {
      // Its route is loaded but not in the timeline, so this has no moment in
      // the replay at all and would fire wherever its number happens to land.
      warnings.push(
        `"${label}" is on "${at.leg.name}", which is not the route being played. `
        + 'It will appear at a meaningless point. Give each route its own recipe, '
        + 'or make this one the active route.',
      );
      return at.progress;
    }
    if (!computedJourney) return at.progress;
    return progressForRouteDistance(
      computedJourney.coordinates,
      computedJourney.segmentTimings,
      at.routeDistanceMeters,
      timingMode,
    ) ?? at.progress;
  };

  const totalMs = journeySegments.reduce((sum, segment) => sum + segment.duration, 0);

  /**
   * How far the marker is from this place when the replay reaches the entry.
   *
   * The whole class of "the card appears nowhere near the thing it names" —
   * bound to a route that is not playing, bound to one lap of a route the
   * journey walks several times, or simply mistimed — collapses to this one
   * number, so it is worth measuring rather than reasoning about.
   */
  const distanceProfile = computedJourney
    ? buildJourneyDistanceProfile(computedJourney.coordinates)
    : null;

  const markerOffAt = (at: RouteAnchor, progress: number): number => {
    if (!computedJourney) return 0;
    // Mirrors useComputedJourney's currentPosition, so this is the marker the
    // viewer will actually see rather than an approximation of it.
    const point = timingMode === 'uniform' && distanceProfile
      ? getJourneyPointAtDistance(distanceProfile, distanceProfile.totalDistance * progress)
      : getJourneyPointAtProgress(
        progress,
        computedJourney.coordinates,
        computedJourney.segmentTimings,
      );
    if (!point) return 0;
    return calculateDistance(point.lat, point.lon, at.routeLat, at.routeLon);
  };

  const landmarks: RouteLandmark[] = [];
  const landmarkEntries: RecipeResolvedEntry[] = [];
  (recipe.landmarks ?? []).forEach((spec, index) => {
    const label = `landmarks[${index}]${spec.title ? ` "${spec.title}"` : ''}`;
    if (spec.auto) {
      for (const [autoIndex, derived] of expandAuto(spec.auto, legs, warnings, spec.track, label).entries()) {
        const at = anchorOnRoute({ track: derived.track, km: derived.km }, legs, label);
        const title = spec.title ? `${spec.title} ${autoIndex + 1}` : derived.title;
        const progress = progressAt(at, title);
        landmarks.push(landmarkFrom(spec, at, spec.id ?? createId('recipe-landmark'), title, true, progress));
        landmarkEntries.push(entry(title, at, progress, markerOffAt, totalMs, undefined, true));
      }
      return;
    }
    const at = anchorOnRoute(spec, legs, label);
    const title = spec.title ?? `Landmark ${index + 1}`;
    const progress = progressAt(at, title);
    landmarks.push(landmarkFrom(spec, at, spec.id ?? createId('recipe-landmark'), title, false, progress));
    landmarkEntries.push(entry(title, at, progress, markerOffAt, totalMs, undefined));
  });

  const annotations: TextAnnotation[] = [];
  const annotationEntries: RecipeResolvedEntry[] = [];
  const annotationLegs: string[] = [];
  (recipe.annotations ?? []).forEach((spec, index) => {
    const label = `annotations[${index}]${spec.title ? ` "${spec.title}"` : ''}`;
    if (spec.auto) {
      for (const [autoIndex, derived] of expandAuto(spec.auto, legs, warnings, spec.track, label).entries()) {
        const at = anchorOnRoute({ track: derived.track, km: derived.km }, legs, label);
        const title = spec.title ? `${spec.title} ${autoIndex + 1}` : derived.title;
        const progress = progressAt(at, title);
        annotations.push(annotationFrom(spec, at, spec.id ?? createId('recipe-note'), title, progress));
        annotationEntries.push(entry(
          title, at, progress, markerOffAt, totalMs,
          spec.displayDuration ?? DEFAULT_ANNOTATION_MS, true,
        ));
        annotationLegs.push(at.leg.name);
      }
      return;
    }
    const at = anchorOnRoute(spec, legs, label);
    const title = spec.title ?? '';
    const progress = progressAt(at, title);
    annotations.push(annotationFrom(spec, at, spec.id ?? createId('recipe-note'), title, progress));
    annotationEntries.push(entry(
      title, at, progress, markerOffAt, totalMs, spec.displayDuration ?? DEFAULT_ANNOTATION_MS,
    ));
    annotationLegs.push(at.leg.name);
  });

  const iconChanges: IconChange[] = [];
  const iconEntries: RecipeResolvedEntry[] = [];
  (recipe.iconChanges ?? []).forEach((spec, index) => {
    const label = `iconChanges[${index}]`;
    if (!spec.icon) throw new RecipeError(`${label}: "icon" is required`);
    const at = anchorOnRoute(spec, legs, label);
    const progress = progressAt(at, spec.label ?? spec.icon);
    iconChanges.push({
      id: spec.id ?? createId('recipe-icon'),
      progress,
      routeDistance: at.routeDistanceMeters,
      icon: spec.icon,
      ...(spec.label ? { label: spec.label } : {}),
    });
    iconEntries.push(entry(spec.label ?? spec.icon, at, progress, markerOffAt, totalMs, undefined));
  });

  warnings.push(...markerNowhereNear([...landmarkEntries, ...annotationEntries, ...iconEntries]));
  if (stitched) warnings.push(...variantsStitchedAsLegs(legs));
  warnings.push(...collidingPins(landmarks));
  warnings.push(...overlappingCards(
    annotations.map((card, index) => ({ card, legName: annotationLegs[index] })),
    recipe.totalDuration ?? DEFAULT_TOTAL_DURATION_MS,
    stitched,
  ));

  return {
    tracks: resolvedTracks,
    activeTrackId: activeTrack.id,
    journeySegments,
    userLandmarks: landmarks,
    textAnnotations: annotations,
    iconChanges,
    report: {
      trackCount: resolvedTracks.length,
      totalDistanceMeters: resolvedTracks.reduce((sum, track) => sum + track.totalDistance, 0),
      stitched,
      landmarks: landmarkEntries,
      annotations: annotationEntries,
      iconChanges: iconEntries,
      warnings,
    },
  };
}

/**
 * Beyond this, the marker is visibly somewhere else when the entry appears.
 * Generous, because recorded pace and a coarse track both move it a little.
 */
const MARKER_TOLERANCE_METERS = 150;

/**
 * The catch-all. Whatever the cause, if the marker is not near the place when
 * its card appears, the replay is wrong in the way people actually notice.
 */
function markerNowhereNear(entries: RecipeResolvedEntry[]): string[] {
  return entries
    .filter((item) => item.markerOffMeters > MARKER_TOLERANCE_METERS)
    .map((item) => (
      `"${item.title}" appears at ${item.atSeconds.toFixed(1)}s, but the marker is `
      + `${item.markerOffMeters >= 1000
        ? `${(item.markerOffMeters / 1000).toFixed(1)} km`
        : `${item.markerOffMeters} m`} away from it then.`
    ));
}

/** Legs whose starts coincide are the same route again, not the next one. */
const SAME_START_METERS = 500;

/**
 * Stitching variants of one route makes a journey that visits every place
 * several times. A card can only be bound to one of those visits, so it fires
 * while the marker is somewhere else entirely — the marker passes the spot
 * early on one lap and the card appears on another, which reads as a card
 * arriving long after the place it names.
 */
function variantsStitchedAsLegs(legs: RouteLeg[]): string[] {
  const warnings: string[] = [];
  for (let index = 1; index < legs.length; index += 1) {
    const first = legs[0].track.points[0];
    const current = legs[index].track.points[0];
    if (!first || !current) continue;
    if (calculateDistance(first.lat, first.lon, current.lat, current.lon) < SAME_START_METERS) {
      warnings.push(
        `"${legs[index].name}" starts where "${legs[0].name}" does, so these look like variants `
        + 'of one route rather than consecutive legs. Stitched, the replay visits every place '
        + 'once per variant and a card can only mark one of them, so cards appear far from where '
        + 'the marker is. Give each variant its own recipe.',
      );
    }
  }
  return warnings;
}

/**
 * The map collapses pins within 80 m of each other, so a colliding pair is a
 * pin the author will not find and will not be told about at render time.
 */
function collidingPins(landmarks: RouteLandmark[]): string[] {
  const warnings: string[] = [];
  for (let i = 0; i < landmarks.length; i += 1) {
    for (let j = i + 1; j < landmarks.length; j += 1) {
      const metres = Math.hypot(
        (landmarks[i].lat - landmarks[j].lat) * 111_320,
        (landmarks[i].lon - landmarks[j].lon) * 111_320 * Math.cos(landmarks[i].lat * Math.PI / 180),
      );
      if (metres < 80) {
        warnings.push(
          `"${landmarks[i].title}" and "${landmarks[j].title}" are ${Math.round(metres)} m apart; `
          + 'the map keeps only one pin below 80 m. Merge them into one.',
        );
      }
    }
  }
  return warnings;
}

/**
 * Two cards whose on-screen windows overlap fight for the same corner.
 *
 * Only cards that can actually be on screen together are compared: when the
 * routes are alternatives rather than legs, a card on one course never shares a
 * timeline with a card on another, however close their progress values look.
 */
function overlappingCards(
  cards: Array<{ card: TextAnnotation; legName: string }>,
  totalDuration: number,
  stitched: boolean,
): string[] {
  const groups = stitched
    ? [cards]
    : [...new Map(cards.map((entry) => [entry.legName, entry.legName])).keys()]
      .map((legName) => cards.filter((entry) => entry.legName === legName));

  const warnings: string[] = [];
  for (const group of groups) {
    const sorted = [...group].sort((left, right) => left.card.progress - right.card.progress);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1].card;
      const current = sorted[index].card;
      const gapMs = (current.progress - previous.progress) * totalDuration;
      if (gapMs < current.displayDuration) {
        warnings.push(
          `"${previous.title}" and "${current.title}" are ${Math.round(gapMs / 1000)} s apart but `
          + `the second shows for ${Math.round(current.displayDuration / 1000)} s, so they overlap. `
          + 'Shorten displayDuration or lengthen the replay.',
        );
      }
    }
  }
  return warnings;
}
