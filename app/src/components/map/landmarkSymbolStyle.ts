import type { ExpressionSpecification } from 'maplibre-gl';

export const MIN_LANDMARK_SCALE = 0.7;
export const MAX_LANDMARK_SCALE = 1.8;

/** Zoom/size stops the labels used before the size control existed. */
const BASE_TEXT_SIZE_STOPS: [number, number][] = [
  [7, 9],
  [9, 10],
  [11, 12],
  [15, 13],
];

/** Zoom/size stops the icons used before the size control existed. */
const BASE_ICON_SIZE_STOPS: [number, number][] = [
  [7, 0.52],
  [9, 0.62],
  [15, 0.92],
];

/** How much larger the landmark being edited draws than the rest. */
const SELECTED_ICON_FACTOR = 1.35;

const isSelected: ExpressionSpecification = ['boolean', ['get', 'selected'], false];

const round = (value: number) => Math.round(value * 1000) / 1000;

export function clampLandmarkScale(scale: number | undefined) {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_LANDMARK_SCALE, Math.max(MIN_LANDMARK_SCALE, scale as number));
}

/** Text size ramp, with every stop scaled by the user's landmark size setting. */
export function landmarkTextSizeExpression(scale: number | undefined): ExpressionSpecification {
  const factor = clampLandmarkScale(scale);
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...BASE_TEXT_SIZE_STOPS.flatMap(([zoom, size]) => [zoom, round(size * factor)]),
  ] as ExpressionSpecification;
}

/** Canvas-rendered landmark labels use a 12 px source font at icon-size 1. */
export function landmarkLabelIconSizeExpression(scale: number | undefined): ExpressionSpecification {
  const factor = clampLandmarkScale(scale);
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...BASE_TEXT_SIZE_STOPS.flatMap(([zoom, size]) => [zoom, round(size * factor / 12)]),
  ] as ExpressionSpecification;
}

/**
 * Icon size ramp. The same setting drives the pins as the labels, so a landmark
 * grows as one piece rather than sprouting an oversized name over a tiny pin.
 *
 * The zoom interpolation has to stay the outermost expression — MapLibre
 * rejects a layer whose zoom curve is nested inside another expression — so the
 * selected/unselected choice sits inside each stop.
 */
export function landmarkIconSizeExpression(scale: number | undefined): ExpressionSpecification {
  const factor = clampLandmarkScale(scale);
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...BASE_ICON_SIZE_STOPS.flatMap(([zoom, size]) => [
      zoom,
      ['case', isSelected, round(size * factor * SELECTED_ICON_FACTOR), round(size * factor)],
    ]),
  ] as ExpressionSpecification;
}

/** Halo grows with the text so large labels keep their contrast over imagery. */
export function landmarkTextHaloWidth(scale: number | undefined) {
  return Math.round(3.5 * clampLandmarkScale(scale) * 10) / 10;
}

/**
 * With fade on, labels ease in over a couple of zoom levels instead of popping
 * into place; each feature's own opacity stays the ceiling either way.
 */
export function landmarkTextOpacityExpression(fade: boolean): ExpressionSpecification {
  if (!fade) {
    return ['get', 'opacity'] as ExpressionSpecification;
  }

  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    8, 0,
    10.5, ['get', 'opacity'],
  ] as ExpressionSpecification;
}
