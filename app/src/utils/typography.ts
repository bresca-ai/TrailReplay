import type { OverlayFont } from '@/types';

export const OVERLAY_FONT_OPTIONS: ReadonlyArray<{
  id: OverlayFont;
  labelKey: string;
}> = [
  { id: 'modern', labelKey: 'annotations.fontModern' },
  { id: 'editorial', labelKey: 'annotations.fontEditorial' },
  { id: 'technical', labelKey: 'annotations.fontTechnical' },
  { id: 'condensed', labelKey: 'annotations.fontCondensed' },
  { id: 'geometric', labelKey: 'annotations.fontGeometric' },
];

const FONT_FAMILIES: Record<OverlayFont, string> = {
  modern: "'Inter', Arial, sans-serif",
  editorial: "'Source Serif 4', Georgia, serif",
  technical: "'JetBrains Mono', Monaco, monospace",
  condensed: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  geometric: "'Montserrat', Arial, sans-serif",
};

export function overlayFontFamily(font: OverlayFont | null | undefined): string {
  return FONT_FAMILIES[font ?? 'technical'] ?? FONT_FAMILIES.technical;
}

export function overlayCanvasFontFamily(font: OverlayFont | null | undefined): string {
  return overlayFontFamily(font);
}
