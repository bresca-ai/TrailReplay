import { isLandmarkGlyph, LANDMARK_GLYPH_LABELS, PINHEAD_PATHS, type LandmarkGlyph } from '@/components/map/landmarkGlyphs';

const MAP_ICON_PREFIX = 'map:';

/** Existing emoji values remain valid; map icons use a namespaced value. */
export function mapAnnotationSymbol(glyph: LandmarkGlyph) {
  return `${MAP_ICON_PREFIX}${glyph}`;
}

export function annotationMapGlyph(symbol: string | undefined): LandmarkGlyph | null {
  if (!symbol?.startsWith(MAP_ICON_PREFIX)) return null;
  const glyph = symbol.slice(MAP_ICON_PREFIX.length);
  return isLandmarkGlyph(glyph) ? glyph : null;
}

export function annotationSymbolPath(symbol: string | undefined) {
  const glyph = annotationMapGlyph(symbol);
  return glyph ? PINHEAD_PATHS[glyph] : null;
}

/** Human-readable label used by icon hover tooltips and accessible names. */
export function annotationSymbolLabel(symbol: string | undefined) {
  const glyph = annotationMapGlyph(symbol);
  return glyph ? LANDMARK_GLYPH_LABELS[glyph] : symbol || 'Annotation';
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
