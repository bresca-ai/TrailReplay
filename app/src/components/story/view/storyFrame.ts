import { METERS_PER_PIXEL_AT_ZOOM_0 } from '@/utils/followBehindCamera';
import { findDistanceIndex, type JourneyDistanceProfile } from '@/utils/journeyUtils';
import { longitudeStep, pathBounds, routeAt, type CompiledStory, type StoryRoute } from '@/utils/story/compileStory';
import type { StoryZoom } from '@/utils/story/storyDocument';

export type LngLat = [number, number];
export type MapSide = 'left' | 'right' | 'top' | 'bottom';
export interface Box { top: number; bottom: number; left: number; right: number }

/** Boxes and left/right are viewport px; every other top or bottom is a content y, rect.top + scrollTop. */
export interface TrackMeasure {
  scroller: Box; map: Box;
  contentHeight: number;
  blocks: { key: string; top: number; height: number; left: number; right: number }[];
  media: { key: string; top: number; height: number; left: number; right: number }[];
  sections: { headTop: number; headBottom: number }[];
  finishTop: number;
}

export interface ScrollTrack {
  line: number;
  band: { top: number; height: number };
  map: Box; mapSide: MapSide;
  knots: { y: number; travel: number }[];
  steps: { y: number; travel: number }[];
  sectionTops: number[];
  legs: { from: number; to: number; fitZoom: number }[];
  media: {
    key: string; top: number; bottom: number; left: number; right: number; point: LngLat | null;
    elevation: number | null; isClip: boolean;
  }[];
  blocks: { key: string; top: number; height: number }[];
  zNear: number; routeFitZoom: number; maxScroll: number;
}

export interface CameraPose { center: LngLat; zoom: number; pitch: 0 | 55; bearing: 0 }

/** A pure function of (story, track, scrollTop, reducedMotion): same inputs, deep-equal frame, in any order. */
export interface StoryFrame {
  scrollTop: number; travel: number; camera: CameraPose; section: number;
  head: { lngLat: LngLat; coordIndex: number; visible: boolean };
  media: { key: string; strength: number; inBand: boolean }[];
  place: { key: string; fraction: number };
}

const SPAN_METERS: Record<StoryZoom, number> = { near: 2_000, medium: 6_000, far: 18_000 };
const WORLD_PX = 512; // MapLibre tiles: the world is 512 * 2^zoom px wide
const FIT_PADDING = 32;
const CONTAIN_INSET = 32;
const MAX_ZOOM = 18;
const PITCH_3D = 55;
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6_371_008.8; // MapLibre's metres-to-pixels, at the centre latitude

export function buildScrollTrack(story: CompiledStory, measure: TrackMeasure): ScrollTrack {
  const { scroller, map } = measure;
  const mapSide = mapSideOf(scroller, map);
  const band = mapSide === 'top' ? { top: map.bottom, height: scroller.bottom - map.bottom }
    : mapSide === 'bottom' ? { top: scroller.top, height: map.top - scroller.top }
      : { top: scroller.top, height: heightOf(scroller) };
  const line = band.top + band.height / 2;
  const total = story.route.travel.totalDistance;
  const heads = story.sections.map((section, index) => ({ ...measure.sections[index], travel: section.travelMeters }));
  const stops = [0, ...heads.map((head) => head.travel), total].filter((stop, index, all) => index === 0 || stop > all[index - 1]);
  const [[, south], [, north]] = story.route.bounds;
  const mediaBoxes = new Map(measure.media.map((box) => [box.key, box]));

  return {
    line,
    band,
    map,
    mapSide,
    knots: [
      { y: line, travel: 0 },
      ...heads.flatMap((head) => [{ y: head.headTop, travel: head.travel }, { y: head.headBottom, travel: head.travel }]),
      { y: measure.finishTop, travel: total },
    ],
    steps: [
      { y: -Infinity, travel: 0 },
      ...heads.map((head) => ({ y: head.headTop, travel: head.travel })),
      { y: measure.finishTop, travel: total },
    ],
    sectionTops: heads.map((head) => head.headTop),
    legs: stops.slice(1).map((to, index) => ({
      from: stops[index],
      to,
      fitZoom: fitZoom(pathBounds(legLngLats(story.route, stops[index], to)), map),
    })),
    media: story.sections.flatMap((section) => section.blocks).flatMap((block) => {
      const box = mediaBoxes.get(block.key);
      return block.kind === 'media' && box ? [{
        key: block.key,
        top: box.top,
        bottom: box.top + box.height,
        left: box.left,
        right: box.right,
        point: block.media.point,
        elevation: block.media.elevation,
        isClip: block.media.kind === 'video',
      }] : [];
    }),
    blocks: [...measure.blocks].sort((a, b) => a.top - b.top).map(({ key, top, height }) => ({ key, top, height })),
    zNear: Math.log2(
      Math.min(widthOf(map), heightOf(map)) * METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos(toRadians((south + north) / 2))
        / SPAN_METERS[story.layout.zoom],
    ),
    routeFitZoom: fitZoom(story.route.bounds, map),
    maxScroll: Math.max(0, measure.contentHeight - heightOf(scroller)),
  };
}

export function storyFrameAt(story: CompiledStory, track: ScrollTrack, scrollTop: number, reducedMotion: boolean): StoryFrame {
  const s = clamp(scrollTop, 0, track.maxScroll);
  const y = s + track.line;
  const travel = reducedMotion
    ? track.steps[lastAtOrBefore(track.steps, y, (step) => step.y)].travel
    : travelOnKnots(track.knots, y);
  const at = routeAt(story.route, travel);
  const head = { lngLat: at.lngLat, coordIndex: at.lower, visible: isOnRoute(story.route.travel, at.upper, travel) };
  const bandTop = s + track.band.top;
  const media = track.media.map((item) => ({
    key: item.key,
    strength: 1 - smoothstep(0, 0.6, Math.abs((item.top + item.bottom) / 2 - y) / track.band.height),
    inBand: item.top < bandTop + track.band.height && item.bottom > bandTop,
  }));
  const pitch = story.layout.view === '3d' ? PITCH_3D : 0;
  const minZoom = Math.min(track.routeFitZoom - 0.5, MAX_ZOOM);
  // 3D terrain lifts each point by its height over the head, which sits on the ground (centerClampedToGround).
  const relief = pitch ? { head: at.elevation, exaggeration: story.look.terrainExaggeration } : null;
  const zoom = framedZoom(track, travel, head.lngLat, media, pitch, relief, minZoom, reducedMotion);

  return {
    scrollTop: s,
    travel,
    camera: { center: head.lngLat, zoom: clamp(zoom, minZoom, MAX_ZOOM), pitch, bearing: 0 },
    section: lastAtOrBefore(track.sectionTops, y, (top) => top),
    head,
    media,
    place: placeAt(track.blocks, y),
  };
}

/** The scrollTop that puts `place` back on the reading line. */
export function scrollTopForPlace(track: ScrollTrack, place: StoryFrame['place']): number {
  const block = track.blocks.find((candidate) => candidate.key === place.key);
  return block ? clamp(block.top + place.fraction * block.height - track.line, 0, track.maxScroll) : 0;
}

function mapSideOf(scroller: Box, map: Box): MapSide {
  if (widthOf(map) >= 0.9 * widthOf(scroller)) {
    return map.top + map.bottom < scroller.top + scroller.bottom ? 'top' : 'bottom';
  }
  return map.left + map.right < scroller.left + scroller.right ? 'left' : 'right';
}

function travelOnKnots(knots: ScrollTrack['knots'], y: number): number {
  const index = Math.max(0, lastAtOrBefore(knots, y, (knot) => knot.y));
  const from = knots[index];
  const to = knots[index + 1];
  return to ? from.travel + (to.travel - from.travel) * smoothstep(from.y, to.y, y) : from.travel;
}

function isOnRoute({ coordinates: points, cumulativeDistances: along }: JourneyDistanceProfile, upper: number, travel: number): boolean {
  const onRoute = (index: number) => points[index].transportMode !== 'camera';
  if (along[upper] !== travel) return onRoute(upper - 1) || onRoute(upper);
  for (let index = upper; along[index] === travel; index += 1) {
    if (onRoute(index)) return true;
  }
  return false;
}

function legLngLats(route: StoryRoute, from: number, to: number): LngLat[] {
  const { coordinates: points, cumulativeDistances: along } = route.travel;
  const lngLats = [routeAt(route, from).lngLat];
  for (let index = findDistanceIndex(route.travel, from); along[index] < to; index += 1) {
    lngLats.push([points[index].lon, points[index].lat]);
  }
  lngLats.push(routeAt(route, to).lngLat);
  return lngLats;
}

function fitZoom([[west, south], [east, north]]: [LngLat, LngLat], map: Box): number {
  const fit = (px: number, world: number) => Math.max(1, px - 2 * FIT_PADDING) / (world * WORLD_PX);
  return Math.log2(Math.min(fit(widthOf(map), (east - west) / 360), fit(heightOf(map), mercatorY(south) - mercatorY(north))));
}

function framedZoom(
  track: ScrollTrack,
  travel: number,
  head: LngLat,
  media: StoryFrame['media'],
  pitch: number,
  relief: { head: number; exaggeration: number } | null,
  minZoom: number,
  reducedMotion: boolean,
): number {
  const near = track.zNear;
  const leg = track.legs[lastAtOrBefore(track.legs, travel, (candidate) => candidate.from)];
  const zoom = leg && !reducedMotion
    ? near - (near - Math.min(near, leg.fitZoom)) * Math.sin(Math.PI * (travel - leg.from) / (leg.to - leg.from)) ** 2
    : near;
  const pull = track.media.reduce((most, item, index) => {
    const { strength } = media[index];
    const weight = reducedMotion ? (strength >= 0.5 ? 1 : 0) : smoothstep(0, 0.5, strength);
    if (!item.point || weight === 0) return most;
    const rise = relief && item.elevation !== null ? (item.elevation - relief.head) * relief.exaggeration : 0;
    return Math.max(most, weight * Math.max(0, zoom - zContain(head, item.point, rise, track.map, pitch, minZoom)));
  }, 0);
  return zoom - pull;
}

function zContain(head: LngLat, point: LngLat, rise: number, map: Box, pitch: number, minZoom: number): number {
  const halfWidth = widthOf(map) / 2 - CONTAIN_INSET;
  const halfHeight = heightOf(map) / 2 - CONTAIN_INSET;
  // MapLibre's default fov, 0.6435 rad, puts the camera 1.5 map heights from the centre.
  const distance = 1.5 * heightOf(map);
  const sin = Math.sin(toRadians(pitch));
  const cos = Math.cos(toRadians(pitch));
  const east = longitudeStep(head[0], point[0]) / 360;
  const north = mercatorY(head[1]) - mercatorY(point[1]);
  const up = rise / (EARTH_CIRCUMFERENCE * Math.cos(toRadians(head[1])));
  const fits = (zoom: number) => {
    const scale = WORLD_PX * 2 ** zoom;
    const [dx, dy, dz] = [east * scale, north * scale, up * scale];
    const depth = distance + dy * sin - dz * cos;
    return depth > 0
      && Math.abs(distance * dx / depth) <= halfWidth
      && Math.abs(distance * (dy * cos + dz * sin) / depth) <= halfHeight;
  };

  let low = minZoom;
  let high = MAX_ZOOM;
  if (fits(high)) return high;
  if (!fits(low)) return low;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

function placeAt(blocks: ScrollTrack['blocks'], y: number): StoryFrame['place'] {
  const block = blocks[Math.max(0, lastAtOrBefore(blocks, y, (candidate) => candidate.top))];
  if (!block) return { key: '', fraction: 0 };
  return { key: block.key, fraction: block.height > 0 ? (y - block.top) / block.height : 0 };
}

function lastAtOrBefore<T>(items: readonly T[], value: number, at: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (at(items[middle]) <= value) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function mercatorY(lat: number): number {
  return (1 - Math.log(Math.tan(Math.PI / 4 + toRadians(lat) / 2)) / Math.PI) / 2;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function widthOf(box: Box): number {
  return box.right - box.left;
}

function heightOf(box: Box): number {
  return box.bottom - box.top;
}

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
