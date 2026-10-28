import type { Map as MapLibreMap } from 'maplibre-gl';
import { newestPaintedTrailTip, PAINTED_TRAIL_TIP_KIND, PAINTED_TRAIL_TIP_LAYER } from './paintedTrailTip';

type PaintedTip = NonNullable<ReturnType<typeof newestPaintedTrailTip>>;
export type PaintedMarkerMap = Pick<MapLibreMap, 'getLayer' | 'querySourceFeatures' | 'project' | 'on' | 'off'>;

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
    this.renderAt(point.x, point.y);
  }

  /** Position the same DOM adornment at a screen point painted by a 3D layer. */
  renderAt(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
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
      // Read the tiles used by this render, not a screen-space hit test. At
      // steep terrain angles that test can miss a visible endpoint for seconds
      // while both the trail and camera continue to advance. Source queries
      // use renderable tiles, so this still follows the painted worker revision
      // rather than jumping ahead to the latest submitted playback position.
      map.querySourceFeatures('trail-completed', {
        filter: ['==', ['get', 'kind'], PAINTED_TRAIL_TIP_KIND],
      }),
      marker.minimumRevision,
    ), map);
  };
  // One writer, after WebGL has drawn. A MapLibre Marker also writes its DOM
  // transform on move/moveend/terrain/idle, between completed canvas frames.
  map.on('render', render);
  return () => { map.off('render', render); };
}
