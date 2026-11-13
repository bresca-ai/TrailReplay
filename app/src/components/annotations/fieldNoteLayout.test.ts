import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '@/types';
import { layoutFieldNote } from './fieldNoteLayout';

const annotation: TextAnnotation = { id: 'a', lat: 1, lon: 2, progress: .3, title: '', color: '#f90', displayDuration: 4000 };
const measure = (text: string, font: string) => text.length * (Number.parseFloat(font.match(/([\d.]+)px/)?.[1] ?? '14') * 0.5);

describe('compact field note', () => {
  it('uses no reserved rows for missing fields', () => {
    const titleOnly = layoutFieldNote({ ...annotation, title: 'Summit' }, 'modern', 400, measure);
    const full = layoutFieldNote({ ...annotation, eyebrow: 'Pass', title: 'Summit', meta: 'Km 7', description: 'Water' }, 'modern', 400, measure);
    expect(titleOnly.lines.map(line => line.text)).toEqual(['Summit']);
    expect(titleOnly.height).toBeLessThan(70);
    expect(full.height).toBeGreaterThan(titleOnly.height);
    expect(titleOnly.width).toBeLessThan(200);
  });

  it.each([true, false])('centers a single title on the divider (text only: %s)', (textOnly) => {
    const result = layoutFieldNote({ ...annotation, title: 'Summit' }, 'modern', 400, measure, textOnly, 1.5);
    const fontSize = parseFloat(result.lines[0].font.match(/[\d.]+px/)![0]);
    expect(result.lines[0].y + fontSize / 2).toBeCloseTo(result.height / 2);
  });

  it('supports an icon-only note without a large empty backdrop', () => {
    const layout = layoutFieldNote(annotation, 'modern', 400, measure);
    expect(layout.lines).toEqual([]);
    expect(layout.width).toBeLessThan(65);
    expect(layout.height).toBeLessThan(70);
  });

  it('wraps long text within the allowed width without dropping any words', () => {
    const text = 'A long climb towards the top with a spectacular view';
    const layout = layoutFieldNote({ ...annotation, title: text }, 'modern', 180, measure);
    expect(layout.width).toBeLessThanOrEqual(180);
    expect(layout.lines.map(line => line.text).join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
    expect(layout.lines.length).toBeGreaterThan(1);
  });

  it('fits within narrow and wide video frames', () => {
    for (const width of [120, 180, 320, 500]) {
      const layout = layoutFieldNote({ ...annotation, title: 'Sant Miquel', description: 'A beautiful water stop along the route' }, 'modern', width, measure);
      expect(layout.width).toBeLessThanOrEqual(width);
      expect(layout.lines.some(line => line.text.includes('Sant'))).toBe(true);
    }
  });

  it('changes text size without changing the available marker space', () => {
    const small = layoutFieldNote({ ...annotation, title: 'Summit' }, 'modern', 400, measure, false, 1, 0.7);
    const large = layoutFieldNote({ ...annotation, title: 'Summit' }, 'modern', 400, measure, false, 1, 1.5);
    expect(parseFloat(small.lines[0].font.match(/[\d.]+px/)![0])).toBeLessThan(parseFloat(large.lines[0].font.match(/[\d.]+px/)![0]));
    expect(small.scale).toBe(large.scale);
  });

  it('uses smaller type for the map-anchored presentation', () => {
    const screen = layoutFieldNote({ ...annotation, title: 'Summit', presentation: 'map-card' }, 'modern', 400, measure);
    const map = layoutFieldNote({ ...annotation, title: 'Summit', presentation: 'side-panel' }, 'modern', 400, measure);
    expect(parseFloat(map.lines[0].font.match(/[\d.]+px/)![0])).toBeLessThan(parseFloat(screen.lines[0].font.match(/[\d.]+px/)![0]));
  });

  it('breaks a single long word rather than clipping it', () => {
    const text = 'Averylongunbrokenmountainplacename';
    const layout = layoutFieldNote({ ...annotation, title: text }, 'modern', 120, measure);
    expect(layout.lines.map(line => line.text).join('')).toBe(text);
    expect(layout.width).toBeLessThanOrEqual(120);
  });
});
