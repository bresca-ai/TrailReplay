import { afterEach, expect, it, vi } from 'vitest';
import { drawFieldNote } from './drawFieldNote';
import type { TextAnnotation } from '@/types';

const annotation: TextAnnotation = { id: 'a', lat: 1, lon: 2, progress: 0.5, title: 'Water stop', color: '#f3b133', displayDuration: 4000, presentation: 'map-card' };
afterEach(() => vi.restoreAllMocks());

it('draws a colored divider for screen text and omits it for empty notes', () => {
  const fillRect = vi.fn();
  const context = {
    font: '', fillStyle: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0,
    measureText: (text: string) => ({ width: text.length * 10 }),
    scale: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), translate: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }), fillRect, fillText: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  drawFieldNote(annotation, 'modern', 400, 'text');
  expect(fillRect).toHaveBeenCalledWith(2, expect.any(Number), 2, expect.any(Number));
  fillRect.mockClear();
  drawFieldNote({ ...annotation, title: '' }, 'modern', 400, 'text');
  expect(fillRect).not.toHaveBeenCalled();
});

it('can rasterize annotation text above preview resolution for video export', () => {
  const context = {
    font: '', fillStyle: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0,
    measureText: (text: string) => ({ width: text.length * 10 }),
    scale: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), translate: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(), fillText: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const preview = drawFieldNote(annotation, 'modern', 400, 'text');
  const exported = drawFieldNote(annotation, 'modern', 400, 'text', 1, 1, 8);
  expect(exported?.resolution).toBe(8);
  expect(exported!.canvas.width).toBeGreaterThan(preview!.canvas.width);
});
