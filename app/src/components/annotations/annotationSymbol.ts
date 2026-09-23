import { isLandmarkGlyph, PINHEAD_PATHS, type LandmarkGlyph } from '@/components/map/landmarkGlyphs';
import { pinheadIconPath } from './pinheadIcons';

const MAP_ICON_PREFIX = 'map:';
// Library icons get their own prefix: Pinhead reuses some built-in glyph names
// (pin, water, shelter, waterfall) for different drawings, and a saved
// `map:pin` has to keep drawing the pin it was saved with.
const PINHEAD_ICON_PREFIX = 'pinhead:';

/** Existing emoji values remain valid; map icons use a namespaced value. */
export function mapAnnotationSymbol(glyph: LandmarkGlyph) {
  return `${MAP_ICON_PREFIX}${glyph}`;
}

export function pinheadAnnotationSymbol(id: string) {
  return `${PINHEAD_ICON_PREFIX}${id}`;
}

export function annotationMapGlyph(symbol: string | undefined): LandmarkGlyph | null {
  if (!symbol?.startsWith(MAP_ICON_PREFIX)) return null;
  const glyph = symbol.slice(MAP_ICON_PREFIX.length);
  return isLandmarkGlyph(glyph) ? glyph : null;
}

export function annotationPinheadId(symbol: string | undefined): string | null {
  if (!symbol?.startsWith(PINHEAD_ICON_PREFIX)) return null;
  return symbol.slice(PINHEAD_ICON_PREFIX.length) || null;
}

/** Human-readable icon name used by hover tooltips and accessible labels. */
export function annotationSymbolLabel(symbol: string | undefined) {
  const glyph = annotationMapGlyph(symbol);
  if (glyph) return glyph;
  const pinheadId = annotationPinheadId(symbol);
  return pinheadId ? pinheadId.replace(/_/g, ' ') : symbol || 'annotation';
}

/** Whether drawing any of these symbols needs the Pinhead library loaded. */
export function needsPinheadIcons(symbols: Array<string | undefined>) {
  return symbols.some((symbol) => annotationPinheadId(symbol) !== null);
}

/**
 * The icon path to draw, or `null` for an emoji. An icon that cannot be drawn
 * yet (library still loading, or an id this Pinhead version lacks) is drawn as
 * the pin rather than as its raw `pinhead:…` text.
 */
export function annotationSymbolPath(symbol: string | undefined) {
  const glyph = annotationMapGlyph(symbol);
  if (glyph) return PINHEAD_PATHS[glyph];
  const pinheadId = annotationPinheadId(symbol);
  if (pinheadId) return pinheadIconPath(pinheadId) ?? PINHEAD_PATHS.pin;
  return symbol?.startsWith(MAP_ICON_PREFIX) ? PINHEAD_PATHS.pin : null;
}

/** Draw the same Pinhead path used by map landmarks, or retain a legacy emoji. */
export function drawAnnotationSymbol(
  context: CanvasRenderingContext2D,
  symbol: string | undefined,
  centerX: number,
  centerY: number,
  size: number,
  color: string,
) {
  const path = annotationSymbolPath(symbol);
  context.save();
  context.shadowColor = 'rgba(5, 17, 16, 0.72)';
  context.shadowBlur = size * 0.18;
  if (path) {
    context.translate(centerX - size / 2, centerY - size / 2);
    context.scale(size / 15, size / 15);
    context.fillStyle = color;
    context.fill(new Path2D(path));
  } else {
    context.fillStyle = '#f8f6f0';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${size}px sans-serif`;
    context.fillText(symbol || '●', centerX, centerY);
  }
  context.restore();
}
