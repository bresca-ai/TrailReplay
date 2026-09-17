import { useEffect, useRef } from 'react';
import type * as maplibregl from 'maplibre-gl';
import {
  nextPitchLimitDeg,
  readCameraGroundClearanceMeters,
} from '@/utils/cameraTerrainClearance';

/** Below this the limit is not worth re-applying; it only churns the camera. */
const APPLY_EPSILON_DEG = 0.05;

/**
 * Stops the camera being pushed inside a mountain, in every camera mode.
 *
 * Applies to whatever moved the camera — a drag, a pinch, a keyframed
 * cinematic shot — because it reads the resulting camera position rather than
 * the intent behind it. See cameraTerrainClearance.ts for why the remedy is a
 * pitch ceiling and not a correction after the fact.
 */
export function useCameraTerrainClearance({
  isMapLoaded,
  mapRef,
  show3DTerrain,
}: {
  isMapLoaded: boolean;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  show3DTerrain: boolean;
}) {
  const limitRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // The map's own maximum, captured before anything here narrows it, so it
    // can always be handed back intact.
    const ceilingDeg = map.getMaxPitch();
    // `setMaxPitch` throws below the map's own minimum, so the servo stops there.
    const floorDeg = map.getMinPitch();
    limitRef.current = ceilingDeg;
    lastFrameTimeRef.current = null;

    if (!show3DTerrain) {
      // Flat ground: there is nothing to be inside of.
      map.setMaxPitch(ceilingDeg);
      return;
    }

    let applying = false;

    const update = () => {
      // `setMaxPitch` can itself move the camera, which fires `move` again.
      if (applying) return;

      const now = performance.now();
      const elapsedMs = lastFrameTimeRef.current === null ? 0 : now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      if (elapsedMs <= 0) return;

      const currentLimitDeg = limitRef.current ?? ceilingDeg;
      const nextLimit = nextPitchLimitDeg({
        currentLimitDeg,
        pitchDeg: map.getPitch(),
        clearanceMeters: readCameraGroundClearanceMeters(map),
        ceilingDeg,
        floorDeg,
        elapsedMs,
      });

      limitRef.current = nextLimit;
      if (Math.abs(nextLimit - currentLimitDeg) < APPLY_EPSILON_DEG) return;

      applying = true;
      try {
        map.setMaxPitch(nextLimit);
      } finally {
        applying = false;
      }
    };

    // `render` rather than `move`: the limit has to keep easing back open
    // after the camera has come to rest, and it is the terrain finishing
    // loading — not the camera moving — that often changes the answer.
    map.on('render', update);
    return () => {
      map.off('render', update);
      map.setMaxPitch(ceilingDeg);
    };
  }, [isMapLoaded, mapRef, show3DTerrain]);
}
