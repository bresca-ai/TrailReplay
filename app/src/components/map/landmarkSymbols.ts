import type { RouteLandmark } from '@/types/landmarks';
import { annotationMapGlyph, annotationPinheadId, mapAnnotationSymbol } from '@/components/annotations/annotationSymbol';
import { glyphForLandmark, isLandmarkGlyph } from './landmarkGlyphs';

/** Keep old unprefixed glyphs and unknown legacy values compatible. */
export function landmarkSymbol(landmark: Pick<RouteLandmark, 'type' | 'icon'>): string {
  const icon = landmark.icon;
  if (icon?.startsWith('emoji:')) return icon.slice('emoji:'.length);
  if (isLandmarkGlyph(icon)) return mapAnnotationSymbol(icon);
  if (icon && (annotationMapGlyph(icon) || annotationPinheadId(icon) || /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(icon))) return icon;
  return mapAnnotationSymbol(glyphForLandmark(landmark));
}

/** Store built-in picks in the existing format; library icons keep their prefix. */
export function landmarkIconFromSymbol(symbol: string): string {
  return annotationMapGlyph(symbol) ?? (annotationPinheadId(symbol) ? symbol : `emoji:${symbol}`);
}
