import type { LanguageCode, TextAnnotation } from '@/types';

export function localizedAnnotation(annotation: TextAnnotation, language: LanguageCode): TextAnnotation {
  const wording = annotation.translations?.[language];
  if (!wording) return annotation;
  return {
    ...annotation,
    title: wording.title ?? annotation.title,
    subtitle: wording.subtitle ?? annotation.subtitle,
    eyebrow: wording.eyebrow ?? annotation.eyebrow,
    meta: wording.meta ?? annotation.meta,
    description: wording.description ?? annotation.description,
  };
}
