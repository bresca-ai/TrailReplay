import { describe, expect, it, vi } from 'vitest';
import { drawExportStatIcon } from './drawExportStatIcon';

describe('drawExportStatIcon', () => {
  it('draws the Route and Mountain strokes used by distance and elevation', () => {
    const stroke = vi.fn();
    const context = {
      stroke,
      beginPath: vi.fn(),
      arc: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    class Path2DStub {
      d: string;
      constructor(d: string) { this.d = d; }
    }
    vi.stubGlobal('Path2D', Path2DStub);

    try {
      const route = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      route.innerHTML = '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5"/><circle cx="18" cy="5" r="3"/>';
      const mountain = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      mountain.innerHTML = '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>';

      drawExportStatIcon(context, route);
      drawExportStatIcon(context, mountain);

      expect(context.arc).toHaveBeenCalledTimes(2);
      expect(stroke).toHaveBeenCalledTimes(4);
      expect(stroke.mock.calls[3][0]).toMatchObject({ d: 'm8 3 4 8 5-5 5 15H2L8 3z' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
