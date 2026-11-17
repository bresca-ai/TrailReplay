/**
 * scripts/story-metrics.mjs is plain Node, like replay-metrics: the story probe
 * runs outside the app. These are its shapes, so its verdicts can still be
 * type-checked and tested from here.
 */
declare module '*/scripts/story-metrics.mjs' {
  type Rgb = [number, number, number];
  type Rgba = [number, number, number, number];
  type LngLat = [number, number];
  interface Box { top: number; bottom: number; left: number; right: number }
  interface ScreenPoint { x: number; y: number }

  export interface StorySample {
    frame: {
      scrollTop: number; travel: number;
      camera: { zoom: number };
      head: { lngLat: LngLat; visible: boolean };
      media: { key: string; strength: number }[];
    };
    map: Box;
    band: { top: number; bottom: number };
    side: 'left' | 'right' | 'top' | 'bottom';
    head: ScreenPoint | null;
    media: { key: string; point: LngLat | null; strength: number; projected: ScreenPoint | null; rect: Box | null }[];
    painted: (PaintedWedge | null)[];
  }

  /** One wedge slot as painted: the text polygon's points (base0, base1, apex) and every copy it is drawn as. */
  export interface PaintedWedge {
    points: [number, number][]; cx: number; cy: number; hollow: boolean; alpha: number;
    veil: [number, number][]; edges: [number, number][][]; axes: number[][];
    clip: WedgeClip;
  }
  /** The text part's clip (clip-rule and path d) and the map part's clip rect, as the slot references them. */
  export interface WedgeClip { rule: string | null; text: string | null; map: Box | null }

  export function firstDifference(a: unknown, b: unknown, path?: string): string | null;
  export function framePurity(visits: { frame: { scrollTop: number } }[]): {
    scrollTops: number; visits: number; singles: number; mismatches: { scrollTop: number; path: string }[];
  };
  export function percentiles(values: number[]): { p50: number; p95: number; max: number };
  export function metersBetween(a: LngLat, b: LngLat): number;
  export function marginInside(point: ScreenPoint, box: Box): number;
  export function expectedBase(media: Box, band: { top: number; bottom: number }, side: StorySample['side']): [[number, number], [number, number]] | null;
  export function matchPaintedWedges(sample: StorySample): { key: string | null; error: number; hollow: boolean }[];
  export function wedgeSummary(samples: StorySample[], tolerance?: number): {
    frames: number; framesWithWedge: number; painted: number; hollow: number; mismatched: number; missing: number;
    torn: number; unclipped: number; worstError: number;
  };
  export function wedgeCopiesAgree(painted: Pick<PaintedWedge, 'points' | 'veil' | 'edges' | 'axes'>, tolerance?: number): boolean;
  export function clipBoxes(d: string | null): Box[];
  export function clipMatchesMap(clip: WedgeClip, map: Box, tolerance?: number): boolean;
  export function writesInPlace(timeline: string[]): string[];
  export function framingSummary(samples: StorySample[], inset: number): Record<'head' | 'media', { checked: number; outside: number; minMargin: number }>;
  export function reducedMotionSummary(
    samples: StorySample[],
    track: { rests: number[]; zNear: number; routeFitZoom: number },
  ): { frames: number; offRest: number; offNear: number; cuts: number; glides: number };
  export function relativeLuminance(rgb: Rgb): number;
  export function contrastRatio(a: Rgb, b: Rgb): number;
  export function over(top: Rgba, bottom: Rgb): Rgb;
  export function textContrastUnderWedge(colours: { text: Rgba; canvas: Rgb; wedge: Rgb; alpha: number }): number;
}
