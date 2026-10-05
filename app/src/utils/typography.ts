import type { OverlayFont, OverlayTextCase } from '@/types';

export const OVERLAY_FONT_OPTIONS: ReadonlyArray<{
  id: OverlayFont;
  labelKey: string;
  sample: string;
}> = [
  { id: 'modern', labelKey: 'annotations.fontModern', sample: 'Aa' },
  { id: 'editorial', labelKey: 'annotations.fontEditorial', sample: 'Aa' },
  { id: 'technical', labelKey: 'annotations.fontTechnical', sample: 'Aa' },
];

const FONT_FAMILIES: Record<OverlayFont, string> = {
  modern: "'Inter', Arial, sans-serif",
  editorial: "'Source Serif 4', Georgia, serif",
  technical: "'JetBrains Mono', Monaco, monospace",
};

export function overlayFontFamily(font: OverlayFont | null | undefined): string {
  return FONT_FAMILIES[font ?? 'technical'] ?? FONT_FAMILIES.technical;
}

export function overlayCanvasFontFamily(font: OverlayFont | null | undefined): string {
  return overlayFontFamily(font);
}

export function applyOverlayTextCase(
  value: string,
  textCase: OverlayTextCase | null | undefined,
  locale?: string,
): string {
  return textCase === 'uppercase' ? value.toLocaleUpperCase(locale) : value;
}
