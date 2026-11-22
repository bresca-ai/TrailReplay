import { useEffect, useRef, type RefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PaintedTrailMarker } from '@/utils/paintedTrailMarker';
import { getRouteBearingAtProgress } from '@/utils/replayCameraPlan';
import { markerRouteHeading } from '@/utils/markerRouteHeading';
import { steerMarker, type MarkerSteeringState } from '@/utils/markerSteering';
import { is3DActivityIcon } from '@/utils/activityIcons';
import { create3DMarker, getLoaded3DModelModule, load3DModelModule } from '../load3DMarker';
import { activeMarkerTransition, type MarkerTransition } from '@/utils/markerTransitions';

type RunnerCanvas = HTMLCanvasElement & { renderRunnerAt?: (timeMs: number) => void };
type TransitionRenderer = ReturnType<typeof import('../markerTransition3d').createMarkerTransitionRenderer>;

/** Draw the model in a transparent marker anchored to the painted route tip. */
export function useRunner3D({ mapRef, markerRef, icon, coordinates, completedCoordinates, progress, timeMs, color, isExporting, transitions = [], totalDuration = 0 }: {
  mapRef: RefObject<MapLibreMap | null>; markerRef: RefObject<PaintedTrailMarker | null>;
  icon: string; coordinates: number[][]; completedCoordinates: number[][]; progress: number; timeMs: number; color: string; isExporting: boolean;
  /** Model changes that play a get-off / get-on animation (already filtered to the enabled ones). */
  transitions?: MarkerTransition[]; totalDuration?: number;
}) {
  const state = useRef({ coordinates, completedCoordinates, progress, timeMs, color, isExporting, transitions, totalDuration });
  useEffect(() => { state.current = { coordinates, completedCoordinates, progress, timeMs, color, isExporting, transitions, totalDuration }; }, [coordinates, completedCoordinates, progress, timeMs, color, isExporting, transitions, totalDuration]);

  // The transition draws on its own canvas next to the model's, and survives the icon swap at the boundary.
  const transition = useRef<{ id: string; canvas: HTMLCanvasElement; renderer: TransitionRenderer | null } | null>(null);
  const transitionModule = useRef<typeof import('../markerTransition3d') | null>(null);
  const transitionKey = transitions.map((entry) => `${entry.fromIcon}>${entry.toIcon}`).join('|');
  useEffect(() => {
    if (!transitionKey) return;
    void import('../markerTransition3d').then((module) => { transitionModule.current = module; });
    for (const entry of transitionKey.split('|')) for (const name of entry.split('>')) void load3DModelModule(name).catch(() => undefined);
  }, [transitionKey]);
  useEffect(() => () => { transition.current?.renderer?.dispose(); transition.current?.canvas.remove(); transition.current = null; }, []);

  useEffect(() => {
    if (!is3DActivityIcon(icon)) return;
    let cancelled = false;
    let frame = 0;
    let currentCanvas: RunnerCanvas | null = null;
    let instance: ReturnType<typeof import('../runner3d').createRunnerRenderer> | null = null;
    let creating = false;
    let lastRender = '';
    let steering: MarkerSteeringState | null = null;

    const hideTransition = (canvas: HTMLCanvasElement) => {
      if (transition.current) transition.current.canvas.hidden = true;
      canvas.style.visibility = '';
    };
    // Draw the transition instead of the model when the route time is inside one; false when there is none to draw.
    const renderTransition = (canvas: HTMLCanvasElement, time: number, heading: number, map: MapLibreMap): boolean => {
      const active = activeMarkerTransition(state.current.transitions, time, state.current.totalDuration);
      const module = transitionModule.current;
      if (!active || !module) return false;
      const from = getLoaded3DModelModule(active.transition.fromIcon), to = getLoaded3DModelModule(active.transition.toIcon);
      if (!from || !to) return false;
      let current = transition.current;
      if (!current || current.id !== active.transition.id) {
        current?.renderer?.dispose(); current?.canvas.remove();
        const own = document.createElement('canvas');
        own.dataset.markerTransition = '';
        own.setAttribute('aria-hidden', 'true');
        current = transition.current = { id: active.transition.id, canvas: own, renderer: null };
        try {
          current.renderer = module.createMarkerTransitionRenderer(own, active.transition.fromIcon, active.transition.toIcon, from, to);
        } catch (error) { console.error('Could not create marker transition', error); return false; }
      }
      if (!current.renderer) return false;
      if (current.canvas.parentElement !== canvas.parentElement) canvas.parentElement?.appendChild(current.canvas);
      current.canvas.style.cssText = canvas.style.cssText;
      current.canvas.style.visibility = '';
      current.canvas.hidden = false;
      canvas.style.visibility = 'hidden';
      current.renderer.render(active.clipSeconds, heading, map.getBearing(), map.getPitch(), state.current.color);
      return true;
    };

    const update = () => {
      if (cancelled) return;
      const canvas = markerRef.current?.getElement().querySelector('[data-runner-3d] canvas:not([data-marker-transition])') as RunnerCanvas | null;
      if (canvas !== currentCanvas) {
        if (currentCanvas) delete currentCanvas.renderRunnerAt;
        instance?.dispose(); instance = null; currentCanvas = canvas;
        if (canvas) {
          canvas.renderRunnerAt = (time) => {
            const map = mapRef.current;
            if (!map) return;
            const { coordinates: route, progress: routeProgress } = state.current;
            const heading = markerRouteHeading(state.current.completedCoordinates, markerRef.current?.getPosition() ?? null)
              ?? getRouteBearingAtProgress(route, routeProgress);
            steering = steerMarker(steering, heading, time);
            if (renderTransition(canvas, time, steering.heading, map)) return;
            hideTransition(canvas);
            instance?.render(time, steering.heading, map.getBearing(), map.getPitch(), state.current.color);
          };
        }
      }
      if (canvas && !instance && !creating) {
        creating = true;
        void create3DMarker(canvas, icon).then((renderer) => {
          creating = false;
          if (cancelled || currentCanvas !== canvas) { renderer.dispose(); return; }
          instance = renderer;
          lastRender = '';
        }).catch(error => { creating = false; console.error('Could not load 3D marker', error); });
      }
      if (canvas?.renderRunnerAt && !state.current.isExporting) {
        const map = mapRef.current;
        const tip = markerRef.current?.getPosition();
        const signature = `${!!instance}:${!!transitionModule.current}:${state.current.timeMs}:${state.current.progress}:${state.current.color}:${tip?.[0]}:${tip?.[1]}:${map?.getBearing()}:${map?.getPitch()}`;
        if (signature !== lastRender) { canvas.renderRunnerAt(state.current.timeMs); lastRender = signature; }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelled = true; cancelAnimationFrame(frame);
      if (currentCanvas) { delete currentCanvas.renderRunnerAt; currentCanvas.style.visibility = ''; }
      instance?.dispose();
    };
  }, [icon, mapRef, markerRef]);
}
