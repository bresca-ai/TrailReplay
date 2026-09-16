import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '@/types';
import { localizedAnnotation } from './annotationTranslations';

const annotation: TextAnnotation = {
  id: 'a1', progress: 0.2, lat: 41, lon: 2, title: 'A1 · Avituallament',
  subtitle: 'Fruits secs', color: '#123456', displayDuration: 4000,
  translations: { en: { title: 'A1 · Water station', subtitle: 'Nuts' } },
};

describe('annotation wording', () => {
  it('uses the selected language and falls back to authored text for missing languages', () => {
    expect(localizedAnnotation(annotation, 'en')).toMatchObject({ title: 'A1 · Water station', subtitle: 'Nuts' });
    expect(localizedAnnotation(annotation, 'ca')).toMatchObject({ title: 'A1 · Avituallament', subtitle: 'Fruits secs' });
    expect(annotation.title).toBe('A1 · Avituallament');
  });
});
