import type { TextAnnotation } from '@/types';

/** Slowdown spans one second of route time, centered on the station. The
 * raised-cosine density gives a continuous change of speed at both ends and
 * never makes the marker completely stationary. */
const APPROACH_MS = 500;

export function annotationExtraTime(routeTime: number, totalDuration: number, annotations: TextAnnotation[], defaultHoldDuration = 5000): number {
  return annotations.reduce((extra, annotation) => {
    const duration = Math.max(0, annotation.holdDuration ?? defaultHoldDuration);
    if (!duration || !totalDuration) return extra;
    const arrival = annotation.progress * totalDuration;
    const start = Math.max(0, arrival - APPROACH_MS);
    const end = Math.min(totalDuration, arrival + APPROACH_MS);
    if (end <= start) return extra;
    // Include the route time already occupied by the visible interval.
    const addedDuration = Math.max(0, duration - (end - start));
    const x = Math.max(0, Math.min(1, (routeTime - start) / (end - start)));
    return extra + addedDuration * (x - Math.sin(2 * Math.PI * x) / (2 * Math.PI));
  }, 0);
}

export function playbackTimeForRoute(routeTime: number, totalDuration: number, annotations: TextAnnotation[], defaultHoldDuration = 5000): number {
  return routeTime + annotationExtraTime(routeTime, totalDuration, annotations, defaultHoldDuration);
}

/**
 * How many milliseconds of output time one millisecond of route time occupies.
 * It is 1 away from a field note and rises smoothly through its slowdown.
 */
export function annotationPlaybackRate(routeTime: number, totalDuration: number, annotations: TextAnnotation[], defaultHoldDuration = 5000): number {
  return annotations.reduce((rate, annotation) => {
    const duration = Math.max(0, annotation.holdDuration ?? defaultHoldDuration);
    if (!duration || !totalDuration) return rate;
    const arrival = annotation.progress * totalDuration;
    const start = Math.max(0, arrival - APPROACH_MS);
    const end = Math.min(totalDuration, arrival + APPROACH_MS);
    if (end <= start || routeTime <= start || routeTime >= end) return rate;
    const x = (routeTime - start) / (end - start);
    const addedDuration = Math.max(0, duration - (end - start));
    return rate + (addedDuration / (end - start)) * (1 - Math.cos(2 * Math.PI * x));
  }, 1);
}

/**
 * Slow annotation spans move so little between output frames that rendering
 * every nominal 30/60fps frame only repeats nearly identical map work. A VFR
 * sample may safely cover this many output frames while moving no farther than
 * a normal-speed single frame would have moved.
 */
export function annotationExportFrameStride(
  routeTime: number,
  totalDuration: number,
  annotations: TextAnnotation[],
  maximum = 2,
  defaultHoldDuration = 5000,
): number {
  return Math.max(1, Math.min(maximum, Math.floor(annotationPlaybackRate(routeTime, totalDuration, annotations, defaultHoldDuration))));
}

export function routeTimeForPlayback(elapsed: number, totalDuration: number, annotations: TextAnnotation[], defaultHoldDuration = 5000): number {
  let low = 0;
  let high = totalDuration;
  for (let i = 0; i < 32; i += 1) {
    const middle = (low + high) / 2;
    if (playbackTimeForRoute(middle, totalDuration, annotations, defaultHoldDuration) < elapsed) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function sidePanelVisible(annotation: TextAnnotation, routeTime: number, totalDuration: number): boolean {
  const arrival = annotation.progress * totalDuration;
  return routeTime >= Math.max(0, arrival - APPROACH_MS) && routeTime <= Math.min(totalDuration, arrival + APPROACH_MS);
}
