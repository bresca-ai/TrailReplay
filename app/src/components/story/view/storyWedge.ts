// Pure wedge geometry in viewport px: a shape from a photo's edge to its place on the map, drawn as one SVG.
import type { MapStyle } from '@/types';
import type { Box, LngLat, MapSide, ScrollTrack, StoryFrame } from './storyFrame';

/** Bounded by a test: body text (--evergreen-80 on --canvas) under a full-strength wedge keeps 4.5:1 contrast. */
export const WEDGE_MAX_ALPHA = 0.22;
/** The veil inside the map box, where no text sits: strong enough to read over imagery and light maps alike. */
export const WEDGE_VEIL_ALPHA = 0.34;
/** --evergreen. */
export const WEDGE_COLOR: readonly [number, number, number] = [27, 42, 32];
/** --canvas. */
export const WEDGE_LIGHT = '#F8F6F0';

const DARK = `rgb(${WEDGE_COLOR.join(' ')})`;
const IMAGERY: ReadonlySet<MapStyle> = new Set(['satellite', 'esri-clarity', 'wayback']);

/** Inside the map box: a veil and edge lines that contrast with the basemap, each edge on a halo of the other tone. */
export interface WedgeTone { veil: string; edge: string; halo: string }

export function wedgeTone(mapStyle: MapStyle): WedgeTone {
  return IMAGERY.has(mapStyle)
    ? { veil: WEDGE_LIGHT, edge: WEDGE_LIGHT, halo: DARK }
    : { veil: DARK, edge: DARK, halo: WEDGE_LIGHT };
}

type Point = [number, number];

/** StoryMap.project: viewport px; null until the map has loaded. */
export type ProjectPoint = (point: LngLat) => { x: number; y: number; occluded: boolean } | null;

export interface Wedge {
  key: string; polygon: [Point, Point, Point]; // base0, base1, apex
  apex: Point; baseMid: Point; // gradient axis
  alpha: number; // outside the map box, at the apex end of the gradient (half at the base): <= WEDGE_MAX_ALPHA
  veilAlpha: number; edgeAlpha: number; // inside the map box
  dotAlpha: number; hollow: boolean; // hollow: 3D terrain hides the apex
}

const APEX_INSET = 8;
const EDGE_FADE = 24;
const MAX_WEDGES = 3;

/** The media box edge facing the map. */
const BASE: Record<MapSide, (box: Box) => [Point, Point]> = {
  right: (box) => [[box.right, box.top], [box.right, box.bottom]],
  left: (box) => [[box.left, box.top], [box.left, box.bottom]],
  top: (box) => [[box.left, box.top], [box.right, box.top]],
  bottom: (box) => [[box.left, box.bottom], [box.right, box.bottom]],
};

/** Null draws nothing: no point, no strength, a box outside the band, or an apex outside the map box inset 8 px. */
export function wedgeGeometry({ key, media, band, map, side, point, strength }: {
  key: string; media: Box; band: { top: number; height: number }; map: Box; side: MapSide;
  point: { x: number; y: number; occluded: boolean } | null; strength: number;
}): Wedge | null {
  if (!point || strength <= 0) return null;
  // Clamped to the band, so the base is cut where a phone map box covers the photo.
  const top = Math.max(media.top, band.top);
  const bottom = Math.min(media.bottom, band.top + band.height);
  if (bottom <= top) return null;
  const inside = Math.min(point.x - map.left, map.right - point.x, point.y - map.top, map.bottom - point.y) - APEX_INSET;
  const edgeFade = Math.min(1, inside / EDGE_FADE);
  if (edgeFade <= 0) return null;

  const [base0, base1] = BASE[side]({ ...media, top, bottom });
  const apex: Point = [point.x, point.y];
  const weight = strength * edgeFade * (point.occluded ? 0.4 : 1);
  return {
    key,
    polygon: [base0, base1, apex],
    apex,
    baseMid: [(base0[0] + base1[0]) / 2, (base0[1] + base1[1]) / 2],
    alpha: WEDGE_MAX_ALPHA * weight,
    veilAlpha: WEDGE_VEIL_ALPHA * weight,
    edgeAlpha: weight,
    dotAlpha: strength * edgeFade,
    hollow: point.occluded,
  };
}

/** The 3 strongest drawable wedges of media with a point; content boxes moved to viewport px by frame.scrollTop. */
export function wedgesFor(track: ScrollTrack, frame: StoryFrame, project: ProjectPoint): Wedge[] {
  return track.media
    .flatMap((item, index) => {
      const { strength } = frame.media[index];
      return item.point && strength > 0 ? [{ item, point: item.point, strength }] : [];
    })
    .sort((a, b) => b.strength - a.strength)
    .flatMap(({ item, point, strength }) => {
      const wedge = wedgeGeometry({
        key: item.key,
        media: { top: item.top - frame.scrollTop, bottom: item.bottom - frame.scrollTop, left: item.left, right: item.right },
        band: track.band,
        map: track.map,
        side: track.mapSide,
        point: project(point),
        strength,
      });
      return wedge ? [wedge] : [];
    })
    .slice(0, MAX_WEDGES);
}
