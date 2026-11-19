import { useEffect, useRef, type RefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PaintedTrailMarker } from '@/utils/paintedTrailMarker';
import { getRouteBearingAtProgress } from '@/utils/replayCameraPlan';
import { markerRouteHeading } from '@/utils/markerRouteHeading';
import { steerMarker, type MarkerSteeringState } from '@/utils/markerSteering';
import { is3DActivityIcon } from '@/utils/activityIcons';
import { create3DMarker } from '../load3DMarker';

type RunnerCanvas = HTMLCanvasElement & { renderRunnerAt?: (timeMs: number) => void };

/** Draw the model in a transparent marker anchored to the painted route tip. */
export function useRunner3D({ mapRef, markerRef, icon, coordinates, completedCoordinates, progress, timeMs, color, isExporting }: {
  mapRef: RefObject<MapLibreMap | null>; markerRef: RefObject<PaintedTrailMarker | null>;
  icon: string; coordinates: number[][]; completedCoordinates: number[][]; progress: number; timeMs: number; color: string; isExporting: boolean;
}) {
  const state = useRef({ coordinates, completedCoordinates, progress, timeMs, color, isExporting });
  useEffect(() => { state.current = { coordinates, completedCoordinates, progress, timeMs, color, isExporting }; }, [coordinates, completedCoordinates, progress, timeMs, color, isExporting]);
  useEffect(() => {
    if (!is3DActivityIcon(icon)) return;
    let cancelled = false;
    let frame = 0;
    let currentCanvas: RunnerCanvas | null = null;
    let instance: ReturnType<typeof import('../runner3d').createRunnerRenderer> | null = null;
    let creating = false;
    let lastRender = '';
    let steering: MarkerSteeringState | null = null;
    const update = () => {
      if (cancelled) return;
      const canvas = markerRef.current?.getElement().querySelector('[data-runner-3d] canvas') as RunnerCanvas | null;
      if (canvas !== currentCanvas) {
        if (currentCanvas) delete currentCanvas.renderRunnerAt;
        instance?.dispose(); instance = null; currentCanvas = canvas; steering = null;
      }
      if (canvas && !instance && !creating) {
        creating = true;
        void create3DMarker(canvas, icon).then((renderer) => {
          creating = false;
          if (cancelled || currentCanvas !== canvas) { renderer.dispose(); return; }
          try {
            instance = renderer;
            canvas.renderRunnerAt = (time) => {
              const map = mapRef.current;
              if (!map || !instance) return;
              const { coordinates: route, progress: routeProgress } = state.current;
              const heading = markerRouteHeading(state.current.completedCoordinates, markerRef.current?.getPosition() ?? null)
                ?? getRouteBearingAtProgress(route, routeProgress);
              steering = steerMarker(steering, heading, time);
              instance.render(time, steering.heading, map.getBearing(), map.getPitch(), state.current.color);
            };
            canvas.renderRunnerAt(state.current.timeMs);
          } catch (error) { console.error('Could not create 3D marker', error); }
        }).catch(error => { creating = false; console.error('Could not load 3D marker', error); });
      }
      if (canvas?.renderRunnerAt && !state.current.isExporting) {
        const map = mapRef.current;
        const tip = markerRef.current?.getPosition();
        const signature = `${state.current.timeMs}:${state.current.progress}:${state.current.color}:${tip?.[0]}:${tip?.[1]}:${map?.getBearing()}:${map?.getPitch()}`;
        if (signature !== lastRender) { canvas.renderRunnerAt(state.current.timeMs); lastRender = signature; }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelled = true; cancelAnimationFrame(frame);
      if (currentCanvas) delete currentCanvas.renderRunnerAt;
      instance?.dispose();
    };
  }, [icon, mapRef, markerRef]);
}
