import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { captureSocialMap } from './captureSocialMap';

function harness(fail = false) {
  const color = ['coalesce', ['get', 'color'], '#f52100'];
  const layers = [
    { id: 'trail-line', type: 'line', paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0 } },
    { id: 'trail-completed', type: 'line', paint: { 'line-color': color, 'line-width': 6 } },
    { id: 'comparison-trail-line-yellow', type: 'line', paint: { 'line-color': '#f1de09', 'line-width': 4, 'line-opacity': 0.5 } },
    { id: 'comparison-trail-completed-yellow', type: 'line', paint: { 'line-color': '#f1de09', 'line-width': 6 } },
    { id: 'places', type: 'symbol', paint: {} },
  ];
  const paints = new globalThis.Map(layers.map(l => [l.id, { ...l.paint } as Record<string, unknown>]));
  const layouts = new globalThis.Map<string, unknown>([['trail-completed', 'visible']]);
  const initialPaint = JSON.stringify([...paints]);
  const initialLayout = JSON.stringify([...layouts]);
  const handlers = new Set<() => void>();
  let captured: { paints: typeof paints; layouts: typeof layouts } | undefined;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => {
      if (fail) throw new Error('capture failed');
      captured = {
        paints: new globalThis.Map([...paints].map(([id, p]) => [id, { ...p }])),
        layouts: new globalThis.Map(layouts),
      };
    },
  } as unknown as CanvasRenderingContext2D);
  const map = {
    getStyle: () => ({ layers }),
    getLayer: (id: string) => layers.find(l => l.id === id),
    getPaintProperty: (id: string, key: string) => paints.get(id)?.[key],
    setPaintProperty: (id: string, key: string, value: unknown) => {
      if (value === undefined) delete paints.get(id)![key];
      else paints.get(id)![key] = value;
    },
    getLayoutProperty: (id: string) => layouts.get(id),
    setLayoutProperty: (id: string, _key: string, value: unknown) => {
      if (value === undefined) layouts.delete(id);
      else layouts.set(id, value);
    },
    getCanvas: () => Object.assign(document.createElement('canvas'), { width: 1080, height: 608 }),
    areTilesLoaded: () => true,
    once: (_event: string, handler: () => void) => { handlers.add(handler); },
    off: (_event: string, handler: () => void) => { handlers.delete(handler); },
    triggerRepaint: () => {
      const frame = [...handlers]; handlers.clear(); frame.forEach(h => h());
    },
  };
  return { map: map as unknown as Map, paints, layouts, initialPaint, initialLayout, captured: () => captured };
}

afterEach(() => vi.restoreAllMocks());

describe('finished replay map capture', () => {
  it('uses native finished route colors and widths for every full route, then restores the paused map', async () => {
    const h = harness();
    expect(await captureSocialMap(h.map)).not.toBeNull();
    const snapshot = h.captured()!;
    for (const id of ['trail-line', 'comparison-trail-line-yellow']) {
      const complete = id.replace('trail-line', 'trail-completed');
      for (const key of ['line-color', 'line-width', 'line-opacity']) {
        expect(snapshot.paints.get(id)?.[key]).toEqual(snapshot.paints.get(complete)?.[key]);
      }
      expect(snapshot.layouts.get(complete)).toBe('none');
    }
    expect(snapshot.layouts.get('places')).toBeUndefined();
    expect(JSON.stringify([...h.paints])).toBe(h.initialPaint);
    expect(JSON.stringify([...h.layouts])).toBe(h.initialLayout);
  });

  it('restores original styling and visibility when canvas capture fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness(true);
    expect(await captureSocialMap(h.map)).toBeNull();
    expect(JSON.stringify([...h.paints])).toBe(h.initialPaint);
    expect(JSON.stringify([...h.layouts])).toBe(h.initialLayout);
  });
});
