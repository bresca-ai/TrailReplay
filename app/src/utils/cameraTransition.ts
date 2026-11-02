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
