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
    { id: 'comparison-position-glow-yellow', type: 'circle', paint: {} },
    { id: 'comparison-track-label-yellow', type: 'symbol', paint: {} },
    { id: 'comparison-divergence-point-yellow', type: 'circle', paint: {} },
    { id: 'route-annotations-upcoming-pins', type: 'symbol', paint: {} },
    { id: 'route-annotations-card', type: 'symbol', paint: {} },
    { id: 'location-start-cue-dot', type: 'circle', paint: {} },
    { id: 'location-start-cue-ring', type: 'circle', paint: {} },
    { id: 'location-start-cue-halo', type: 'circle', paint: {} },
    { id: 'route-landmarks-icon', type: 'symbol', paint: {} },
    { id: 'route-landmarks-emoji', type: 'symbol', paint: {} },
    { id: 'route-landmarks-label', type: 'symbol', paint: {} },
    { id: 'carto-labels', type: 'raster', paint: {} },
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
    for (const id of ['comparison-position-glow-yellow', 'comparison-track-label-yellow', 'comparison-divergence-point-yellow', 'route-annotations-upcoming-pins', 'route-annotations-card', 'location-start-cue-dot', 'location-start-cue-ring', 'location-start-cue-halo']) {
      expect(snapshot.layouts.get(id)).toBe('none');
    }
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

  it.each([undefined, true])('shows cover places only when explicitly enabled (%s), then restores live visibility', async (showPlaces) => {
    const h = harness();
    await captureSocialMap(h.map, { showPlaces });
    for (const id of ['route-landmarks-icon', 'route-landmarks-emoji', 'route-landmarks-label', 'carto-labels']) {
      expect(h.captured()!.layouts.get(id)).toBe(showPlaces ? 'visible' : 'none');
    }
    expect(JSON.stringify([...h.layouts])).toBe(h.initialLayout);
  });

  it('keeps map labels but excludes landmark markers from a cover', async () => {
    const h = harness();
    await captureSocialMap(h.map, { showPlaces: true, cleanCover: true });
    for (const id of ['route-landmarks-icon', 'route-landmarks-emoji', 'route-landmarks-label']) {
      expect(h.captured()!.layouts.get(id)).toBe('none');
    }
    expect(h.captured()!.layouts.get('carto-labels')).toBe('visible');
    expect(JSON.stringify([...h.layouts])).toBe(h.initialLayout);
  });
});
