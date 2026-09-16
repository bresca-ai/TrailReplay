import type { LanguageCode, TextAnnotation } from '@/types';

export function localizedAnnotation(annotation: TextAnnotation, language: LanguageCode): TextAnnotation {
  const wording = annotation.translations?.[language];
  if (!wording) return annotation;
  return {
    ...annotation,
    title: wording.title.trim() || annotation.title,
    subtitle: wording.subtitle?.trim() || annotation.subtitle,
    meta: wording.meta?.trim() ?? annotation.meta,
    description: wording.description?.trim() ?? annotation.description,
  };
}
