import { describe, expect, it } from 'vitest';
import { layoutSideAnnotationCanvasText } from './sideAnnotationCanvasLayout';
import { SIDE_ANNOTATION_TYPOGRAPHY } from './sideAnnotationTypography';

const measure = (_role: string, text: string) => ({ width: text.length * 10 });

describe('side annotation canvas layout', () => {
  it('keeps every line of a long stop and grows the shaded panel to contain it', () => {
    const description = Array.from({ length: 30 }, (_, index) => `provision-${index + 1}`).join(' ');
    const short = layoutSideAnnotationCanvasText(
      { title: 'Water station', meta: 'Km 40 · 18:00–03:15', description: 'Water · Fruit' },
      SIDE_ANNOTATION_TYPOGRAPHY.narrow,
      180,
      measure,
    );
    const long = layoutSideAnnotationCanvasText(
      { title: 'Water station', meta: 'Km 40 · 18:00–03:15', description },
      SIDE_ANNOTATION_TYPOGRAPHY.narrow,
      180,
      measure,
    );

    expect(long.description.length).toBeGreaterThan(12);
    expect(long.description.join(' ')).toBe(description);
    expect(long.panelHeight).toBeGreaterThan(short.panelHeight);
  });

  it('accounts for wrapped titles and metadata in the shade height', () => {
    const compact = layoutSideAnnotationCanvasText(
      { title: 'Stop', meta: 'Km 1', description: null },
      SIDE_ANNOTATION_TYPOGRAPHY.wide,
      200,
      measure,
    );
    const wrapped = layoutSideAnnotationCanvasText(
      {
        title: 'A very long official refreshment station title',
        meta: 'Official kilometre 58 with extended opening hours',
        description: null,
      },
      SIDE_ANNOTATION_TYPOGRAPHY.wide,
      200,
      measure,
    );

    expect(wrapped.title.length).toBeGreaterThan(compact.title.length);
    expect(wrapped.meta.length).toBeGreaterThan(compact.meta.length);
    expect(wrapped.panelHeight).toBeGreaterThan(compact.panelHeight);
  });
});
