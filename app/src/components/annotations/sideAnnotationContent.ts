import type { TextAnnotation } from '@/types';

/** Keep the authored wording while giving short station codes and route details
 * their own visual hierarchy in the preview and video export. */
export function sideAnnotationContent(annotation: TextAnnotation) {
  const title = annotation.title.trim();
  const titleParts = title.split(/\s+·\s+/, 2);
  const hasCode = titleParts.length === 2 && /^[A-Za-z]\d+$/.test(titleParts[0]);
  const subtitleLines = (annotation.subtitle ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const hasMeta = subtitleLines.length > 0
    && /\b\d{1,2}:\d{2}\b/.test(subtitleLines[0])
    && subtitleLines[0].includes(' · ');

  return {
    code: annotation.code?.trim() || (hasCode ? titleParts[0] : null),
    title: hasCode ? titleParts[1] : title,
    meta: annotation.meta ?? (hasMeta ? subtitleLines[0] : null),
    description: annotation.description ?? (hasMeta ? subtitleLines.slice(1) : subtitleLines).join(' '),
  };
}
