import { wrapText } from '@/components/map/annotationCardText';
import type { OverlayFont, TextAnnotation } from '@/types';
import { overlayCanvasFontFamily } from '@/utils/typography';
import { sideAnnotationContent } from './sideAnnotationContent';

export type FieldNoteRole = 'eyebrow' | 'title' | 'meta' | 'description';
export type FieldNoteLine = { text: string; role: FieldNoteRole; y: number; font: string };
export type FieldNoteLayout = { width: number; height: number; lines: FieldNoteLine[]; scale: number };

/** Layout is independent of the output resolution, so preview and video share it. */
export function layoutFieldNote(annotation: TextAnnotation, _font: OverlayFont, maxWidth: number, measure: (text: string, font: string) => number, textOnly = false, markerSize = 1, fontSize = 1): FieldNoteLayout {
  const widthLimit = Math.max(64, maxWidth);
  const scale = Math.min(1, Math.max(0.7, widthLimit / 320));
  const family = overlayCanvasFontFamily('modern');
  const textScale = (annotation.presentation === 'side-panel' ? 0.8 : 1) * fontSize;
  const styles: Record<FieldNoteRole, { font: string; lineHeight: number; gap: number }> = {
    eyebrow: { font: `600 ${11 * scale * textScale}px ${family}`, lineHeight: 15 * scale * textScale, gap: 2 * scale },
    title: { font: `700 ${28 * scale * textScale}px ${family}`, lineHeight: 34 * scale * textScale, gap: 3 * scale },
    meta: { font: `600 ${14 * scale * textScale}px ${family}`, lineHeight: 19 * scale * textScale, gap: 3 * scale },
    description: { font: `500 ${15 * scale * textScale}px ${family}`, lineHeight: 21 * scale * textScale, gap: 3 * scale },
  };
  const copy = sideAnnotationContent(annotation);
  const header = [copy.eyebrow?.toLocaleUpperCase(), copy.code].filter(Boolean).join('  ·  ');
  const fields: Array<[FieldNoteRole, string | null]> = [
    ['eyebrow', header], ['title', copy.title], ['meta', copy.meta], ['description', copy.description],
  ];
  const pinHeight = 40 * scale * markerSize;
  const left = textOnly ? 14 * scale : 29 * scale + 20 * pinHeight / 22;
  const right = 18 * scale, top = 14 * scale, bottom = 14 * scale;
  const maxTextWidth = Math.max(8, widthLimit - left - right);
  let y = top, widest = 0;
  const lines: FieldNoteLine[] = [];
  for (const [role, value] of fields) {
    if (!value?.trim()) continue;
    const style = styles[role];
    if (lines.length) y += style.gap;
    for (const paragraph of value.split('\n')) {
      const wrapped = wrapText({ measureText: text => ({ width: measure(text, style.font) }) }, paragraph, maxTextWidth, Number.MAX_SAFE_INTEGER);
      for (const item of wrapped) {
        // Long words must wrap instead of being cut off at the canvas edge.
        let part = '';
        for (const char of Array.from(item)) {
          if (part && measure(part + char, style.font) > maxTextWidth) {
            lines.push({ text: part, role, y: y + (style.lineHeight - parseFloat(style.font.match(/[\d.]+px/)![0])) / 2, font: style.font });
            widest = Math.max(widest, measure(part, style.font));
            y += style.lineHeight;
            part = '';
          }
          part += char;
        }
        if (part) {
          lines.push({ text: part, role, y: y + (style.lineHeight - parseFloat(style.font.match(/[\d.]+px/)![0])) / 2, font: style.font });
          widest = Math.max(widest, measure(part, style.font));
          y += style.lineHeight;
        }
      }
    }
  }
  const height = Math.ceil(Math.max(Math.max(32 * scale, y - top, textOnly ? 0 : pinHeight) + top + bottom, textOnly ? 0 : pinHeight * 1.4));
  const verticalOffset = (height - (y - top)) / 2 - top;
  for (const line of lines) line.y += verticalOffset;
  return { width: Math.min(widthLimit, Math.max(56 * scale, Math.ceil((lines.length ? left + widest + right : 20 * scale + 20 * pinHeight / 22)))), height, lines, scale };
}
