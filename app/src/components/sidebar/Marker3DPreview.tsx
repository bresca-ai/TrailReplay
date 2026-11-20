import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { create3DMarker } from '@/components/map/load3DMarker';

/** A live model users can orbit without changing its direction on the map. */
export function Marker3DPreview({ value, color, label }: { value: string; color: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  const viewRef = useRef({ bearing: -60, pitch: 68, dragged: false, x: 0, y: 0, active: false });
  const redrawRef = useRef<() => void>(() => {});
  useEffect(() => { colorRef.current = color; redrawRef.current(); }, [color]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let frame = 0;
    let model: ReturnType<typeof import('@/components/map/runner3d').createRunnerRenderer> | null = null;
    viewRef.current = { bearing: -60, pitch: 68, dragged: false, x: 0, y: 0, active: false };
    void create3DMarker(canvas, value).then((renderer) => {
      if (cancelled) { renderer.dispose(); return; }
      model = renderer;
      const start = performance.now();
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const draw = (now: number) => {
        if (cancelled || !model) return;
        const elapsed = reducedMotion ? 0 : now - start;
        const view = viewRef.current;
        if (!view.dragged && !reducedMotion) view.bearing = -60 + elapsed * 0.025;
        model.render(elapsed, 90, view.bearing, view.pitch, colorRef.current, true);
      };
      redrawRef.current = () => draw(performance.now());
      const tick = (now: number) => { draw(now); if (!cancelled && !reducedMotion) frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    }).catch(error => console.error('Could not load 3D marker preview', error));
    return () => { cancelled = true; redrawRef.current = () => {}; cancelAnimationFrame(frame); model?.dispose(); };
  }, [value]);

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const view = viewRef.current;
    view.active = true; view.x = event.clientX; view.y = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const view = viewRef.current;
    if (!view.active || (event.clientX === view.x && event.clientY === view.y)) return;
    view.dragged = true;
    view.bearing += (event.clientX - view.x) * 0.6;
    view.pitch = Math.max(15, Math.min(85, view.pitch + (event.clientY - view.y) * 0.35));
    view.x = event.clientX; view.y = event.clientY; redrawRef.current();
  }
  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const view = viewRef.current;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') view.bearing += event.key === 'ArrowLeft' ? -10 : 10;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') view.pitch = Math.max(15, Math.min(85, view.pitch + (event.key === 'ArrowUp' ? -5 : 5)));
    else return;
    event.preventDefault(); view.dragged = true; redrawRef.current();
  }
  return <canvas ref={canvasRef} role="img" aria-label={label} tabIndex={0}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={() => { viewRef.current.active = false; }} onPointerCancel={() => { viewRef.current.active = false; }}
    onKeyDown={onKeyDown} className="h-56 w-56 cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-[var(--trail-orange)] active:cursor-grabbing sm:h-64 sm:w-64" />;
}
