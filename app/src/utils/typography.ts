import type { OverlayFont } from '@/types';

export const TRADITIONAL_CHINESE_FONT_FAMILY = "'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', sans-serif";

export const OVERLAY_FONT_OPTIONS: ReadonlyArray<{
  id: OverlayFont;
  labelKey: string;
}> = [
  { id: 'modern', labelKey: 'annotations.fontModern' },
  { id: 'editorial', labelKey: 'annotations.fontEditorial' },
  { id: 'technical', labelKey: 'annotations.fontTechnical' },
  { id: 'condensed', labelKey: 'annotations.fontCondensed' },
  { id: 'geometric', labelKey: 'annotations.fontGeometric' },
  { id: 'poster', labelKey: 'annotations.fontPoster' },
  { id: 'display', labelKey: 'annotations.fontDisplay' },
];

const FONT_FAMILIES: Record<OverlayFont, string> = {
  modern: "'Inter', Arial, sans-serif",
  editorial: "'Source Serif 4', Georgia, serif",
  technical: "'JetBrains Mono', Monaco, monospace",
  condensed: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  geometric: "'Montserrat', Arial, sans-serif",
  poster: "'Anton', Impact, sans-serif",
  display: "'Bebas Neue', 'Arial Narrow', sans-serif",
};

export function overlayFontFamily(font: OverlayFont | null | undefined): string {
  const family = FONT_FAMILIES[font ?? 'technical'] ?? FONT_FAMILIES.technical;
  // Use installed Traditional Chinese glyphs consistently in DOM, map cards
  // and canvas exports without downloading a large CJK font for every visitor.
  return family.replace(/, (sans-serif|serif|monospace)$/, ", 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', $1");
}

export function overlayCanvasFontFamily(font: OverlayFont | null | undefined): string {
  return overlayFontFamily(font);
}
