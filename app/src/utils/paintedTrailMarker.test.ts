import { describe, expect, it, vi } from 'vitest';
import { bindPaintedTrailMarker, PaintedTrailMarker, type PaintedMarkerMap } from './paintedTrailMarker';

function harness() {
  const handlers = new Map<string, Set<() => void>>();
  let features: Array<{ properties: Record<string, unknown> }> = [];
  const map = {
    getLayer: () => ({}),
    querySourceFeatures: vi.fn(() => features),
    queryRenderedFeatures: vi.fn(() => []),
    project: vi.fn(() => ({ x: 100.125, y: 200.875 })),
    on: (event: string, handler: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off: (event: string, handler: () => void) => { handlers.get(event)?.delete(handler); },
  };
  const element = document.createElement('div');
  const container = document.createElement('div');
  const marker = new PaintedTrailMarker(element, container, 1);
  const unbind = bindPaintedTrailMarker(map as unknown as PaintedMarkerMap, () => marker);
  return {
    map, element, container, marker, unbind,
    emit: (event: string) => { handlers.get(event)?.forEach((handler) => handler()); },
    tip: (revision: number, position = [1.2, 41.3]) => { features = [{ properties: { kind: 'playback-tip', revision, lon: position[0], lat: position[1] } }]; },
    empty: () => { features = []; },
  };
}

describe('render-only playback marker', () => {
  it('does not change its position between canvas renders, even when the camera moves', () => {
    const h = harness();
    h.tip(1);
    h.emit('render');
    const paintedTransform = h.element.style.transform;
    expect(paintedTransform).toContain('100.125px, 200.875px');
    h.map.project.mockReturnValue({ x: 150.25, y: 240.75 });
    for (const event of ['move', 'moveend', 'terrain', 'idle']) h.emit(event);
    expect(h.element.style.transform).toBe(paintedTransform);
    expect(h.map.project).toHaveBeenCalledTimes(1);
    h.emit('render');
    expect(h.element.style.transform).toContain('150.25px, 240.75px');
    expect(h.element.style.position).toBe('absolute');
  });

  it('does not blink or rewind while a rendered tile is replaced', () => {
    const h = harness();
    h.tip(4);
    h.emit('render');
    h.empty();
    h.emit('render');
    expect(h.element.style.visibility).toBe('visible');
    expect(h.marker.minimumRevision).toBe(4);
    h.tip(2);
    h.emit('render');
    expect(h.marker.minimumRevision).toBe(4);
    expect(h.map.project).toHaveBeenLastCalledWith([1.2, 41.3]);
  });

  it('advances with renderable trail tiles even when steep-terrain screen queries miss the endpoint', () => {
    const h = harness();
    h.tip(335, [1.836937, 41.573107]);
    h.emit('render');
    // The opening cinematic pan used to hold revision 335 while the rendered
    // source advanced to 373, because the circle layer's hit test returned [].
    h.tip(373, [1.840481, 41.573437]);
    h.emit('render');
    expect(h.marker.minimumRevision).toBe(373);
    expect(h.map.project).toHaveBeenLastCalledWith([1.840481, 41.573437]);
    expect(h.map.querySourceFeatures).toHaveBeenLastCalledWith('trail-completed', {
      filter: ['==', ['get', 'kind'], 'playback-tip'],
    });
    expect(h.map.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('waits for the first painted tip and removes its listener and element', () => {
    const h = harness();
    h.emit('render');
    expect(h.element.style.visibility).toBe('hidden');
    expect(h.map.project).not.toHaveBeenCalled();
    h.unbind();
    h.tip(1);
    h.emit('render');
    expect(h.map.project).not.toHaveBeenCalled();
    h.marker.remove();
    expect(h.container.childElementCount).toBe(0);
  });
});
