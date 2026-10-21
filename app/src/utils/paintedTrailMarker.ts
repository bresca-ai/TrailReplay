import type { Map as MapLibreMap } from 'maplibre-gl';
import { newestPaintedTrailTip, PAINTED_TRAIL_TIP_LAYER } from './paintedTrailTip';

type PaintedTip = NonNullable<ReturnType<typeof newestPaintedTrailTip>>;
export type PaintedMarkerMap = Pick<MapLibreMap, 'getLayer' | 'queryRenderedFeatures' | 'project' | 'on' | 'off'>;

/** A render-only adornment. Camera move events must never reposition it. */
export class PaintedTrailMarker {
  minimumRevision: number;
  private element: HTMLElement;
  private tip: PaintedTip | null = null;

  constructor(element: HTMLElement, container: HTMLElement, minimumRevision: number) {
    this.element = element;
    this.minimumRevision = minimumRevision;
    Object.assign(element.style, {
      position: 'absolute', top: '0', left: '0',
      pointerEvents: 'none', visibility: 'hidden', transition: 'none',
    });
    container.appendChild(element);
  }

  getElement(): HTMLElement { return this.element; }

  render(tip: PaintedTip | null, map: Pick<PaintedMarkerMap, 'project'>): void {
    if (tip && tip.revision >= this.minimumRevision) {
      this.tip = tip;
      this.minimumRevision = tip.revision;
    }
    // A tile can briefly disappear from a rendered query while its replacement
    // loads. Keep the last painted tip rather than blinking the marker off.
    // A new/recreated marker stays hidden until its own first tip is painted.
    if (!this.tip) return;
    const point = map.project(this.tip.position);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const transform = `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`;
    if (this.element.style.transform !== transform) this.element.style.transform = transform;
    this.element.style.visibility = 'visible';
  }

  remove(): void { this.element.remove(); }
}

export function bindPaintedTrailMarker(
  map: PaintedMarkerMap,
  getMarker: () => PaintedTrailMarker | null,
): () => void {
  const render = () => {
    const marker = getMarker();
    if (!marker || !map.getLayer(PAINTED_TRAIL_TIP_LAYER)) return;
    marker.render(newestPaintedTrailTip(
      map.queryRenderedFeatures({ layers: [PAINTED_TRAIL_TIP_LAYER] }),
      marker.minimumRevision,
    ), map);
  };
  // One writer, after WebGL has drawn. A MapLibre Marker also writes its DOM
  // transform on move/moveend/terrain/idle, between completed canvas frames.
  map.on('render', render);
  return () => { map.off('render', render); };
}
