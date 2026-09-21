import { describe, expect, it } from 'vitest';
import { sideAnnotationContent } from './sideAnnotationContent';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import type { TextAnnotation } from '@/types';

const base: TextAnnotation = { id: 'a1', progress: 0.1, lat: 0, lon: 0, color: '#fff', displayDuration: 4000, title: 'A1 · Aigua', subtitle: 'Km 10,2 · 15:30–19:30\nFruita · Aigua' };

describe('side annotation content', () => {
  it('keeps old combined annotations readable', () => {
    expect(sideAnnotationContent(base)).toEqual({ eyebrow: null, code: 'A1', title: 'Aigua', meta: 'Km 10,2 · 15:30–19:30', description: 'Fruita · Aigua' });
  });

  it('uses separately authored fields and localized details', () => {
    const annotation: TextAnnotation = { ...base, code: 'B2', title: 'Taronges', subtitle: undefined, meta: 'Km 33,1 · 17:50–1:10', description: 'Taronges', translations: { en: { title: 'Oranges', meta: 'Km 33.1 · 17:50–1:10', description: 'Oranges' } } };
    expect(sideAnnotationContent(localizedAnnotation(annotation, 'en'))).toEqual({ eyebrow: null, code: 'B2', title: 'Oranges', meta: 'Km 33.1 · 17:50–1:10', description: 'Oranges' });
  });

  it('uses an authored small heading when available', () => {
    expect(sideAnnotationContent({ ...base, eyebrow: 'Water stop' }).eyebrow).toBe('Water stop');
  });
});
