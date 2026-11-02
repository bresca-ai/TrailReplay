/** A three-stage camera move: zoom out, pan, and zoom back in. */
export function cameraTransitionPose(from: [number, number], to: [number, number], progress: number, startZoom: number, endZoom: number, wideZoom: number) {
  const p = Math.max(0, Math.min(1, progress));
  const ease = (n: number) => { const x = Math.max(0, Math.min(1, n)); return x * x * (3 - 2 * x); };
  const pan = ease((p - 0.25) / 0.5);
  const longitudeDelta = ((to[0] - from[0] + 540) % 360) - 180;
  const zoom = p < 0.25
    ? startZoom + (wideZoom - startZoom) * ease(p / 0.25)
    : p > 0.75 ? wideZoom + (endZoom - wideZoom) * ease((p - 0.75) / 0.25) : wideZoom;
  return { center: [from[0] + longitudeDelta * pan, from[1] + (to[1] - from[1]) * pan] as [number, number], zoom };
}

export interface TransitionCameraPose {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/** Interpolate all camera components continuously, including across north. */
export function transitionCameraPose(start: TransitionCameraPose, end: TransitionCameraPose, progress: number, wideZoom: number): TransitionCameraPose {
  const p = Math.max(0, Math.min(1, progress));
  const ease = (n: number) => { const x = Math.max(0, Math.min(1, n)); return x * x * (3 - 2 * x); };
  const opening = ease(p / 0.25);
  const closing = ease((p - 0.75) / 0.25);
  const { center, zoom } = cameraTransitionPose(start.center, end.center, p, start.zoom, end.zoom, wideZoom);
  const pitch = p < 0.5 ? start.pitch * (1 - opening) : end.pitch * closing;
  const bearingDelta = ((end.bearing - start.bearing + 540) % 360) - 180;
  // Rotate while zoomed out, preserving the exact orientation at both ends.
  const bearing = start.bearing + bearingDelta * ease((p - 0.25) / 0.5);
  return { center, zoom, pitch, bearing };
}

export function arrivalZoomOffset(extraZoom: number, elapsedMs: number): number {
  const p = Math.max(0, Math.min(1, elapsedMs / 1500));
  return extraZoom * (1 - p * p * (3 - 2 * p));
}
