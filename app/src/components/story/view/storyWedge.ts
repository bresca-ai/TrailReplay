import type { MapStyle } from '@/types';
import type { Box, LngLat, MapSide, ScrollTrack, StoryFrame } from './storyFrame';

export const WEDGE_MAX_ALPHA = 0.22;
export const WEDGE_VEIL_ALPHA = 0.34;
export const WEDGE_COLOR: readonly [number, number, number] = [27, 42, 32];
export const WEDGE_LIGHT = '#F8F6F0';

const DARK = `rgb(${WEDGE_COLOR.join(' ')})`;
const IMAGERY: ReadonlySet<MapStyle> = new Set(['satellite', 'esri-clarity', 'wayback']);

export function wedgeVeil(mapStyle: MapStyle): string {
  return IMAGERY.has(mapStyle) ? WEDGE_LIGHT : DARK;
}

type Point = [number, number];

/** Viewport px; null until the map has loaded. */
export type ProjectPoint = (point: LngLat) => { x: number; y: number; occluded: boolean } | null;

export interface Wedge {
  key: string; polygon: [Point, Point, Point];
  apex: Point; baseMid: Point;
  alpha: number;
  veilAlpha: number;
  dotAlpha: number; hollow: boolean;
}

const APEX_INSET = 8;
const EDGE_FADE = 24;
export const MAX_WEDGES = 3;

const BASE: Record<MapSide, (box: Box) => [Point, Point]> = {
  right: (box) => [[box.right, box.top], [box.right, box.bottom]],
  left: (box) => [[box.left, box.top], [box.left, box.bottom]],
  top: (box) => [[box.left, box.top], [box.right, box.top]],
  bottom: (box) => [[box.left, box.bottom], [box.right, box.bottom]],
};

export function wedgeGeometry({ key, media, band, map, side, point, strength }: {
  key: string; media: Box; band: { top: number; height: number }; map: Box; side: MapSide;
  point: { x: number; y: number; occluded: boolean } | null; strength: number;
}): Wedge | null {
  if (!point || strength <= 0) return null;
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
    dotAlpha: strength * edgeFade,
    hollow: point.occluded,
  };
}

/** At most 3 drawable wedges, strongest first. */
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
